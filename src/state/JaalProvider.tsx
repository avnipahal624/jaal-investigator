import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { useConvexAuth } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@/convex/_generated/api";
import { clearDemoSession, setDemoSession } from "@/lib/demoSession";
import { api as httpApi, probeBackend, tryApi, type BackendStatus } from "@/services/api";
import {
  generateEvidenceHash,
  verifyEvidenceIntegrity,
  transcriptEvidence,
} from "@/services/evidenceService";
import { buildReport } from "@/services/reportService";
import { parseTranscript } from "@/services/transcriptParser";
import { caseExhausted, nextScammerTurn } from "@/services/simulationService";
import type { Investigation, ScamCategory, DetectionMode } from "@/types/investigation";
import type { ConversationMessage } from "@/types/message";
import type { EvidenceReport } from "@/types/report";
import type { EvidenceReviewStatus } from "@/types/evidence";
import {
  loadState,
  reducer,
  saveState,
  clearPersistedState,
  uid,
  type AppNotification,
  type JaalState,
  type SettingsPatch,
} from "./reducer";

export interface CreateCaseInput {
  title: string;
  category: ScamCategory;
  scenarioKey?: string;
  description: string;
  notes: string;
  source: Investigation["source"];
  detectionMode: DetectionMode;
  flags: Investigation["flags"];
  /** Raw text when the source is a paste or import */
  transcript?: string;
}

interface JaalContextValue {
  state: JaalState;
  // auth / session
  signInDemo: (name: string, email: string) => Promise<boolean>;
  signOutDemo: () => Promise<void>;
  updateProfile: (name: string) => void;
  setBackendStatus: (status: BackendStatus) => void;
  // cases
  createCase: (input: CreateCaseInput) => string;
  getCase: (caseId: string) => { investigation: Investigation; runtime: JaalState["sessions"][string] } | null;
  sendMessage: (caseId: string, text: string) => Promise<void>;
  /** Trigger the next scripted scammer line without operator input. */
  advanceSimulation: (caseId: string) => Promise<void>;
  /** Import pasted transcript lines directly into the conversation. */
  ingestTranscript: (caseId: string, raw: string) => number;
  togglePause: (caseId: string) => void;
  endInvestigation: (caseId: string) => void;
  resetCase: (caseId: string) => void;
  resetDemoData: () => void;
  clearLogs: (caseId: string) => void;
  setCaseStatus: (caseId: string, status: Investigation["status"]) => void;
  // evidence
  /** Returns true when hashing succeeded; false when the backend refused. */
  generateHash: (caseId: string, evidenceId: string) => Promise<boolean>;
  verifyEvidence: (
    caseId: string,
    evidenceId: string,
  ) => Promise<"match" | "mismatch" | "generated" | "error">;
  /** Explicit re-baseline of a mismatched hash — requires a recorded reason. */
  rebaselineEvidence: (
    caseId: string,
    evidenceId: string,
    reason: string,
  ) => Promise<boolean>;
  setEvidenceContent: (caseId: string, evidenceId: string, content: string) => void;
  setEvidenceNotes: (caseId: string, evidenceId: string, notes: string) => void;
  /** Analyst review verdict — stored separately from the extraction. */
  reviewEvidence: (
    caseId: string,
    evidenceId: string,
    status: EvidenceReviewStatus,
    note?: string,
  ) => void;
  // reports
  createReport: (caseId: string) => EvidenceReport | null;
  // settings / notifications
  updateSettings: (patch: SettingsPatch) => void;
  notify: (n: Omit<AppNotification, "id" | "read" | "timestamp">) => void;
  markNotificationsRead: () => void;
  clearNotifications: () => void;
}

const JaalContext = createContext<JaalContextValue | null>(null);

const REPLY_DELAY_MIN = 1100;
const REPLY_DELAY_MAX = 2100;

type RemoteState = {
  investigations: Investigation[];
  sessions: Record<string, JaalState["sessions"][string]>;
  reports: EvidenceReport[];
  settings: JaalState["settings"];
};

/**
 * Application state provider.
 *
 * Primary source of truth: the Convex backend (`jaal.state` reactive query).
 * Investigations, conversations, evidence, kill-chains, logs, events, reports
 * and settings all come from the database via live subscription, and every
 * command (send message, advance simulation, verify evidence, complete case,
 * generate report…) runs server-side. The local simulation engine remains as
 * an offline fallback when the backend has not connected yet, so the UI keeps
 * working during initial load or without a deployment.
 */
export function JaalProvider({ children }: { children: ReactNode }) {
  const [localState, dispatch] = useReducer(reducer, null, loadState);
  const [typingMap, setTypingMap] = useState<Record<string, boolean>>({});

  // Convex Auth actions — the simulation login establishes a real,
  // per-guest Anonymous identity so backend ownership is never shared.
  const { signIn, signOut } = useAuthActions();
  const { isAuthenticated } = useConvexAuth();

  // ---- Backend (Convex) wiring ------------------------------------------
  const remote = useQuery(api.jaal.state) as RemoteState | null | undefined;
  const remoteReady = remote !== undefined;

  const seedDemo = useMutation(api.jaal.seedDemo);
  const createInvestigationMut = useMutation(api.jaal.createInvestigation);
  const sendMessageMut = useMutation(api.jaal.sendMessage);
  const simulationNextMut = useMutation(api.jaal.simulationNext);
  const ingestMessagesMut = useMutation(api.jaal.ingestMessages);
  const setRunStatusMut = useMutation(api.jaal.setRunStatus);
  const completeMut = useMutation(api.jaal.completeInvestigation);
  const setStatusMut = useMutation(api.jaal.setInvestigationStatus);
  const resetCaseMut = useMutation(api.jaal.resetCase);
  const resetDemoMut = useMutation(api.jaal.resetDemo);
  const clearLogsMut = useMutation(api.jaal.clearLogs);
  const generateHashMut = useMutation(api.jaal.generateHash);
  const verifyEvidenceMut = useMutation(api.jaal.verifyEvidence);
  const rebaselineMut = useMutation(api.jaal.rebaselineEvidence);
  const setContentMut = useMutation(api.jaal.setEvidenceContent);
  const setNotesMut = useMutation(api.jaal.setEvidenceNotes);
  const reviewMut = useMutation(api.jaal.reviewEvidence);
  const generateReportMut = useMutation(api.jaal.generateReport);
  const updateSettingsMut = useMutation(api.jaal.updateSettings);

  // AI-augmented actions (LLM when configured, simulation fallback otherwise).
  const sendMessageAI = useAction(api.actions.sendMessageWithAI);
  const simulationNextAI = useAction(api.actions.simulationNextWithAI);
  const generateReportAI = useAction(api.actions.generateReportWithAI);

  // ---- Effective state: Convex-authoritative with local merge ----------
  const state = useMemo<JaalState>(() => {
    if (!remote) return localState;
    const invById = new Map(remote.investigations.map((i) => [i.id, i]));
    // Optimistic local cases not yet acknowledged by the backend stay visible.
    for (const li of localState.investigations) {
      if (!invById.has(li.id)) invById.set(li.id, li);
    }
    const investigations = [...invById.values()].sort(
      (a, b) => b.lastActivityAt - a.lastActivityAt,
    );
    const sessions: JaalState["sessions"] = { ...remote.sessions };
    for (const [caseId, rt] of Object.entries(localState.sessions)) {
      if (!sessions[caseId]) sessions[caseId] = rt;
    }
    for (const [caseId, typing] of Object.entries(typingMap)) {
      if (typing && sessions[caseId]) {
        sessions[caseId] = { ...sessions[caseId], typing: true };
      }
    }
    const reports = [...remote.reports];
    for (const r of localState.reports) {
      if (!reports.some((x) => x.id === r.id)) reports.push(r);
    }
    return {
      ...localState,
      investigations,
      sessions,
      reports,
      settings: remote.settings ?? localState.settings,
    };
  }, [localState, remote, typingMap]);

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  const processedHashes = useRef<Set<string>>(new Set());
  const saveTimer = useRef<number | null>(null);
  const seededForOwner = useRef(false);

  // Hydrate demo session + persisted state on first mount.
  useEffect(() => {
    dispatch({ type: "HYDRATE", state: loadState() });
  }, []);

  // Backend probe (HTTP probe powers the legacy indicator; Convex presence
  // counts as online for the workspace).
  useEffect(() => {
    let cancelled = false;
    probeBackend().then((status) => {
      if (!cancelled && status === "online") {
        dispatch({ type: "SET_BACKEND_STATUS", status });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (remoteReady && remote) {
      dispatch({ type: "SET_BACKEND_STATUS", status: "online" });
      // Seed the synthetic demo cases on first connect (idempotent).
      if (!seededForOwner.current && remote.investigations.length === 0) {
        seededForOwner.current = true;
        void seedDemo({}).catch(() => {
          seededForOwner.current = false;
        });
      }
    }
  }, [remoteReady, remote, seedDemo]);

  // Persist local state (debounced) — used only as the offline fallback.
  useEffect(() => {
    if (!localState.hydrated || remote) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => saveState(localState), 350);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [localState, remote]);

  // Auto-generate SHA-256 hashes for local-mode evidence without hashes.
  // In backend mode the server hashes evidence at extraction time.
  useEffect(() => {
    if (remote) return;
    if (!localState.settings.investigation.autoHash) return;
    const pending: { caseId: string; evidenceId: string }[] = [];
    for (const [caseId, rt] of Object.entries(localState.sessions)) {
      const inv = localState.investigations.find((i) => i.id === caseId);
      if (!inv?.flags.integrityHashing) continue;
      for (const e of rt.evidence) {
        if (!e.hash && !processedHashes.current.has(e.id)) {
          pending.push({ caseId, evidenceId: e.id });
        }
      }
    }
    if (pending.length === 0) return;
    pending.forEach((p) => processedHashes.current.add(p.evidenceId));
    pending.forEach(async (p) => {
      const item = stateRef.current.sessions[p.caseId]?.evidence.find(
        (e) => e.id === p.evidenceId,
      );
      if (!item) return;
      try {
        const { hash, at } = await generateEvidenceHash(item);
        dispatch({ type: "HASH_SET", caseId: p.caseId, evidenceId: p.evidenceId, hash, at });
      } catch {
        /* Web Crypto unavailable */
      }
    });
  }, [
    remote,
    localState.sessions,
    localState.investigations,
    localState.settings.investigation.autoHash,
  ]);

  const setTyping = useCallback((caseId: string, typing: boolean) => {
    setTypingMap((prev) => {
      if (!!prev[caseId] === typing) return prev;
      return { ...prev, [caseId]: typing };
    });
  }, []);

  const signInDemo = useCallback(
    async (name: string, email: string): Promise<boolean> => {
      // Establish a server-validated, unguessable identity for this guest
      // session (Convex Auth Anonymous provider). The backend rejects
      // unauthenticated calls and never assigns a shared "demo" owner, so
      // one guest can never read or modify another guest's data. Visitors
      // who already have a real session keep their own identity.
      if (!isAuthenticated) {
        try {
          await signIn("anonymous");
        } catch {
          dispatch({
            type: "NOTIFY",
            notification: {
              title: "Backend session unavailable",
              detail:
                "Could not establish an isolated simulation session — case data will not persist to the backend.",
              kind: "system",
            },
          });
          // No server-validated identity means every owner-scoped query would
          // be rejected, so don't record a session that can't actually be used
          // (RequireAuth would otherwise let it through and the route would
          // crash on its first query).
          return false;
        }
      }
      const session = setDemoSession(name, email);
      dispatch({ type: "SET_USER", user: session });
      return true;
    },
    [isAuthenticated, signIn],
  );

  const signOutDemo = useCallback(async () => {
    clearDemoSession();
    dispatch({ type: "SET_USER", user: null });
    if (isAuthenticated) {
      try {
        await signOut();
      } catch {
        /* local session cleared regardless */
      }
    }
  }, [isAuthenticated, signOut]);

  const updateProfile = useCallback((name: string) => {
    const current = stateRef.current.user;
    const trimmed = name.trim() || "Simulation Operator";
    const session = setDemoSession(trimmed, current?.email ?? "operator@jaal.demo");
    dispatch({ type: "SET_USER", user: session });
  }, []);

  const setBackendStatus = useCallback((status: BackendStatus) => {
    dispatch({ type: "SET_BACKEND_STATUS", status });
  }, []);

  const createCase = useCallback(
    (input: CreateCaseInput): string => {
      const now = Date.now();
      const nextNumber = stateRef.current.investigations.reduce((max, inv) => {
        const n = Number(inv.id.split("-")[1]);
        return Number.isFinite(n) && n > max ? n : max;
      }, 0) + 1;
      const caseId = `JAAL-${String(nextNumber).padStart(3, "0")}`;
      const investigation: Investigation = {
        id: caseId,
        title: input.title,
        category: input.category,
        scenarioKey: input.scenarioKey,
        description: input.description,
        notes: input.notes,
        status: "active",
        createdAt: now,
        lastActivityAt: now,
        currentStage: "contact",
        source: input.source,
        detectionMode: input.detectionMode,
        flags: input.flags,
      };

      // Parse transcript locally with the SHARED parser (same rules as the
      // backend: multiline, timestamps, unpreserved-line tracking) for the
      // synchronous count + optimistic UI, then persist through the backend
      // pipeline and surface its authoritative import summary.
      let seedMessages: ConversationMessage[] = [];
      let transcriptDraft: ReturnType<typeof transcriptEvidence> | null = null;
      if (input.transcript?.trim()) {
        const parsedTranscript = parseTranscript(input.transcript);
        const parsed: ConversationMessage[] = parsedTranscript.messages.map(
          (m, idx) => ({
            id: uid("msg"),
            caseId,
            author: m.sender === "decoy" ? "decoy" : "scammer",
            text: m.text,
            timestamp: m.timestamp ?? now + idx * 1500,
            source: input.source === "paste" ? "OPERATOR" : "TRANSCRIPT-IMPORT",
            status:
              m.sender === "decoy"
                ? "DECOY-ACTIVE"
                : m.needsReview
                  ? "NEEDS-REVIEW"
                  : undefined,
          }),
        );
        seedMessages = parsed;
        if (parsed.length > 0) transcriptDraft = transcriptEvidence(caseId, parsed);
      }

      dispatch({ type: "CREATE_CASE", investigation, seedMessages, transcriptDraft });

      if (remote) {
        void createInvestigationMut({
          caseId,
          title: input.title,
          category: input.category,
          scenarioKey: input.scenarioKey,
          description: input.description,
          notes: input.notes,
          source: input.source,
          detectionMode: input.detectionMode,
          flags: input.flags,
          transcript: input.transcript,
        })
          .then((res) => {
            // Authoritative import summary from the backend parse — never
            // claim full success when lines were skipped or unparsed.
            const stats = res?.import;
            if (!stats) return;
            const skipped = stats.unparsedLines;
            const warnings = stats.warnings.length;
            const partial = skipped > 0 || warnings > 0;
            dispatch({
              type: "NOTIFY",
              notification: {
                title: partial
                  ? `Imported with gaps · ${caseId}`
                  : `Transcript imported · ${caseId}`,
                detail: `${stats.totalLines} lines · ${stats.messagesImported} messages${skipped > 0 ? ` · ${skipped} unparsed` : ""}${stats.continuationLines > 0 ? ` · ${stats.continuationLines} multiline` : ""}${warnings > 0 ? ` · ${warnings} warning${warnings > 1 ? "s" : ""}` : ""}`,
                caseId,
                kind: partial ? "system" : "evidence",
              },
            });
          })
          .catch(() => {
            dispatch({
              type: "NOTIFY",
              notification: {
                title: `Case ${caseId} not persisted`,
                detail: "Backend unavailable — the case exists locally for this session only.",
                caseId,
                kind: "system",
              },
            });
          });
      }

      return caseId;
    },
    [remote, createInvestigationMut],
  );

  const getCase = useCallback((caseId: string) => {
    const investigation = stateRef.current.investigations.find((i) => i.id === caseId);
    const runtime = stateRef.current.sessions[caseId];
    if (!investigation || !runtime) return null;
    return { investigation, runtime };
  }, []);

  const sendMessage = useCallback(
    async (caseId: string, text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      // ---- Backend path (authoritative) ----
      if (remote) {
        setTyping(caseId, true);
        const started = Date.now();
        try {
          await sendMessageAI({ caseId, text: trimmed });
        } catch {
          try {
            await sendMessageMut({ caseId, text: trimmed });
          } catch {
            dispatch({
              type: "NOTIFY",
              notification: {
                title: "Message not delivered",
                detail: "Backend unavailable — check the connection and retry.",
                caseId,
                kind: "system",
              },
            });
          }
        } finally {
          const elapsed = Date.now() - started;
          if (elapsed < 600) {
            window.setTimeout(() => setTyping(caseId, false), 600 - elapsed);
          } else {
            setTyping(caseId, false);
          }
        }
        return;
      }

      // ---- Local fallback path ----
      const snapshot = stateRef.current;
      const rt = snapshot.sessions[caseId];
      const inv = snapshot.investigations.find((i) => i.id === caseId);
      if (!rt || !inv) return;
      if (rt.status === "completed" || rt.status === "paused") return;

      const now = Date.now();
      const userMessage: ConversationMessage = {
        id: uid("msg"),
        caseId,
        author: "decoy",
        text: trimmed,
        timestamp: now,
        source: "OPERATOR",
        status: "DECOY-ACTIVE",
      };
      dispatch({ type: "INGEST_MESSAGE", message: userMessage });

      const remoteHttp = await tryApi(() =>
        httpApi.sendMessage({ sessionId: caseId, author: "decoy", text: trimmed }),
      );
      if (remoteHttp) {
        dispatch({ type: "INGEST_MESSAGE", message: { ...remoteHttp, caseId } });
        return;
      }

      dispatch({ type: "TYPING", caseId, typing: true });
      const delay =
        REPLY_DELAY_MIN + Math.random() * (REPLY_DELAY_MAX - REPLY_DELAY_MIN);
      await new Promise((resolve) => setTimeout(resolve, delay));

      const current = stateRef.current.sessions[caseId];
      if (!current || current.status !== "running") {
        dispatch({ type: "TYPING", caseId, typing: false });
        return;
      }

      const scenarioKey = stateRef.current.investigations.find((i) => i.id === caseId)?.scenarioKey;
      const turn = nextScammerTurn(trimmed, current.cursor, current.turnCount, scenarioKey);
      if (turn.exhausted) {
        dispatch({ type: "TYPING", caseId, typing: false });
        dispatch({
          type: "INGEST_MESSAGE",
          message: {
            id: uid("msg"),
            caseId,
            author: "system",
            text: "Channel quiet — scripted simulation exhausted. Investigation marked complete.",
            timestamp: Date.now(),
            source: "SIM-ENGINE",
          },
        });
        dispatch({ type: "SET_CASE_STATUS", caseId, status: "completed" });
        return;
      }

      const reply: ConversationMessage = {
        id: uid("msg"),
        caseId,
        author: "scammer",
        text: turn.text,
        timestamp: Date.now(),
        source: turn.branch ? `SIM-ENGINE·${turn.branch.id}` : "SIM-ENGINE",
      };
      const nextCursor = turn.arc ? current.cursor + 1 : current.cursor;
      const nextTurnCount = current.turnCount + 1;
      if (caseExhausted(scenarioKey, nextCursor) && !turn.branch) {
        dispatch({
          type: "INGEST_MESSAGE",
          message: reply,
          cursor: nextCursor,
          turnCount: nextTurnCount,
        });
        dispatch({ type: "SET_CASE_STATUS", caseId, status: "completed" });
        return;
      }
      dispatch({
        type: "INGEST_MESSAGE",
        message: reply,
        cursor: nextCursor,
        turnCount: nextTurnCount,
      });
    },
    [remote, sendMessageAI, sendMessageMut, setTyping],
  );

  const advanceSimulation = useCallback(
    async (caseId: string) => {
      // ---- Backend path ----
      if (remote) {
        setTyping(caseId, true);
        try {
          await simulationNextAI({ caseId });
        } catch {
          try {
            await simulationNextMut({ caseId });
          } catch {
            /* surfaced by state subscription gap */
          }
        } finally {
          setTyping(caseId, false);
        }
        return;
      }

      // ---- Local fallback path ----
      const current = stateRef.current.sessions[caseId];
      if (!current || current.status !== "running") return;

      const scenarioKey = stateRef.current.investigations.find((i) => i.id === caseId)?.scenarioKey;
      if (caseExhausted(scenarioKey, current.cursor)) {
        dispatch({
          type: "INGEST_MESSAGE",
          message: {
            id: uid("msg"),
            caseId,
            author: "system",
            text: "Script exhausted — no further synthetic lines available.",
            timestamp: Date.now(),
            source: "SIM-ENGINE",
          },
        });
        return;
      }

      dispatch({ type: "TYPING", caseId, typing: true });
      await new Promise((r) => setTimeout(r, 700));
      const rt = stateRef.current.sessions[caseId];
      if (!rt || rt.status !== "running") {
        dispatch({ type: "TYPING", caseId, typing: false });
        return;
      }
      const turn = nextScammerTurn("", rt.cursor, rt.turnCount, scenarioKey);
      if (turn.exhausted) {
        dispatch({ type: "TYPING", caseId, typing: false });
        dispatch({ type: "SET_CASE_STATUS", caseId, status: "completed" });
        return;
      }
      const nextCursor = turn.arc ? rt.cursor + 1 : rt.cursor;
      dispatch({
        type: "INGEST_MESSAGE",
        message: {
          id: uid("msg"),
          caseId,
          author: "scammer",
          text: turn.text,
          timestamp: Date.now(),
          source: turn.branch ? `SIM-ENGINE·${turn.branch.id}` : "SIM-ENGINE",
        },
        cursor: nextCursor,
        turnCount: rt.turnCount + 1,
      });
      if (caseExhausted(scenarioKey, nextCursor) && !turn.branch) {
        dispatch({ type: "SET_CASE_STATUS", caseId, status: "completed" });
      }
    },
    [remote, simulationNextAI, simulationNextMut, setTyping],
  );

  const ingestTranscript = useCallback(
    (caseId: string, raw: string): number => {
      const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const parsed: ConversationMessage[] = [];
      let offset = 0;
      for (const line of lines) {
        const m = line.match(
          /^(?:\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*)?([A-Za-z][A-Za-z ]{1,20}):\s*(.+)$/,
        );
        if (!m) continue;
        const who = m[1]!.toLowerCase().trim();
        const isDecoy = /^(me|you|decoy|self|operator|user|jaal)$/.test(who);
        parsed.push({
          id: uid("msg"),
          caseId,
          author: isDecoy ? "decoy" : "scammer",
          text: m[2]!,
          timestamp: Date.now() + offset,
          source: "TRANSCRIPT-IMPORT",
          status: isDecoy ? "DECOY-ACTIVE" : undefined,
        });
        offset += 400;
      }
      parsed.forEach((message) =>
        dispatch({ type: "INGEST_MESSAGE", message }),
      );
      if (remote && parsed.length > 0) {
        void ingestMessagesMut({
          caseId,
          messages: parsed.map((m) => ({
            sender: m.author === "decoy" ? ("decoy" as const) : ("scammer" as const),
            content: m.text,
            source: m.source,
            timestamp: m.timestamp,
          })),
        }).catch(() => undefined);
      }
      return parsed.length;
    },
    [remote, ingestMessagesMut],
  );

  const togglePause = useCallback(
    (caseId: string) => {
      const rt = stateRef.current.sessions[caseId];
      if (!rt || rt.status === "completed") return;
      if (remote) {
        void setRunStatusMut({
          caseId,
          action: rt.status === "running" ? "pause" : "resume",
        }).catch(() => undefined);
        return;
      }
      dispatch({
        type: "SET_CASE_STATUS",
        caseId,
        status: rt.status === "running" ? "paused" : "running",
      });
    },
    [remote, setRunStatusMut],
  );

  const endInvestigation = useCallback(
    (caseId: string) => {
      if (remote) {
        // Server completes the case and auto-generates the final report.
        void completeMut({ caseId }).catch(() => undefined);
        return;
      }
      dispatch({ type: "SET_CASE_STATUS", caseId, status: "completed" });
    },
    [remote, completeMut],
  );

  const resetCase = useCallback(
    (caseId: string) => {
      processedHashes.current.clear();
      if (remote) {
        void resetCaseMut({ caseId }).catch(() => undefined);
        return;
      }
      dispatch({ type: "RESET_CASE", caseId });
    },
    [remote, resetCaseMut],
  );

  const resetDemoData = useCallback(() => {
    processedHashes.current.clear();
    clearPersistedState();
    dispatch({ type: "RESET_DEMO" });
    if (remote) {
      void resetDemoMut({}).catch(() => undefined);
    }
  }, [remote, resetDemoMut]);

  const clearLogs = useCallback(
    (caseId: string) => {
      if (remote) {
        void clearLogsMut({ caseId }).catch(() => undefined);
        return;
      }
      dispatch({ type: "CLEAR_LOGS", caseId });
    },
    [remote, clearLogsMut],
  );

  const setCaseStatus = useCallback(
    (caseId: string, status: Investigation["status"]) => {
      if (remote) {
        void setStatusMut({ caseId, status }).catch(() => undefined);
        return;
      }
      dispatch({ type: "SET_CASE_FILTER_STATUS", caseId, status });
    },
    [remote, setStatusMut],
  );

  const generateHash = useCallback(
    async (caseId: string, evidenceId: string): Promise<boolean> => {
      if (remote) {
        try {
          await generateHashMut({ evidenceId: evidenceId as never });
          return true;
        } catch (err) {
          dispatch({
            type: "NOTIFY",
            notification: {
              title: "Hashing unavailable",
              detail:
                err instanceof Error
                  ? err.message
                  : "Backend hashing failed for this evidence item.",
              caseId,
              kind: "system",
            },
          });
          return false;
        }
      }
      const item = stateRef.current.sessions[caseId]?.evidence.find((e) => e.id === evidenceId);
      if (!item) return false;
      try {
        const { hash, at } = await generateEvidenceHash(item);
        dispatch({ type: "HASH_SET", caseId, evidenceId, hash, at });
        return true;
      } catch {
        dispatch({
          type: "NOTIFY",
          notification: {
            title: "Hashing unavailable",
            detail: "Web Crypto API requires a secure context.",
            caseId,
            kind: "system",
          },
        });
        return false;
      }
    },
    [remote, generateHashMut],
  );

  const verifyEvidence = useCallback(
    async (
      caseId: string,
      evidenceId: string,
    ): Promise<"match" | "mismatch" | "generated" | "error"> => {
      if (remote) {
        try {
          return await verifyEvidenceMut({ evidenceId: evidenceId as never });
        } catch {
          return "error";
        }
      }
      const item = stateRef.current.sessions[caseId]?.evidence.find((e) => e.id === evidenceId);
      if (!item) return "error";
      if (!item.hash) {
        await generateHash(caseId, evidenceId);
        // Hash was generated — this is NOT a verification result.
        return "generated";
      }
      try {
        const result = await verifyEvidenceIntegrity(item);
        dispatch({
          type: "VERIFY_RESULT",
          caseId,
          evidenceId,
          match: result.match,
          at: Date.now(),
        });
        void tryApi(() =>
          httpApi.verifyEvidence(caseId, { evidenceId, content: item.content }),
        );
        return result.match ? "match" : "mismatch";
      } catch {
        return "error";
      }
    },
    [remote, verifyEvidenceMut, generateHash],
  );

  const rebaselineEvidence = useCallback(
    async (caseId: string, evidenceId: string, reason: string): Promise<boolean> => {
      if (!remote) return false;
      try {
        await rebaselineMut({
          evidenceId: evidenceId as never,
          reason,
        });
        return true;
      } catch (err) {
        dispatch({
          type: "NOTIFY",
          notification: {
            title: "Re-baseline refused",
            detail:
              err instanceof Error
                ? err.message
                : "The evidence hash could not be re-baselined.",
            caseId,
            kind: "system",
          },
        });
        return false;
      }
    },
    [remote, rebaselineMut],
  );

  const setEvidenceContent = useCallback(
    (caseId: string, evidenceId: string, content: string) => {
      if (remote) {
        void setContentMut({ evidenceId: evidenceId as never, content }).catch(
          () => undefined,
        );
        return;
      }
      dispatch({ type: "SET_EVIDENCE_CONTENT", caseId, evidenceId, content });
    },
    [remote, setContentMut],
  );

  const setEvidenceNotes = useCallback(
    (caseId: string, evidenceId: string, notes: string) => {
      if (remote) {
        void setNotesMut({ evidenceId: evidenceId as never, notes }).catch(
          () => undefined,
        );
        return;
      }
      dispatch({ type: "SET_EVIDENCE_NOTES", caseId, evidenceId, notes });
    },
    [remote, setNotesMut],
  );

  const reviewEvidence = useCallback(
    (
      caseId: string,
      evidenceId: string,
      status: EvidenceReviewStatus,
      note?: string,
    ) => {
      if (remote) {
        void reviewMut({ evidenceId: evidenceId as never, status, note }).catch(
          () => undefined,
        );
        return;
      }
      dispatch({ type: "REVIEW_EVIDENCE", caseId, evidenceId, status, note });
    },
    [remote, reviewMut],
  );

  const createReport = useCallback(
    (caseId: string): EvidenceReport | null => {
      const snapshot = stateRef.current;
      const inv = snapshot.investigations.find((i) => i.id === caseId);
      const rt = snapshot.sessions[caseId];
      if (!inv || !rt) return null;
      const report = buildReport(
        inv,
        rt,
        snapshot.user?.name ?? "Simulation operator",
      );
      dispatch({ type: "REPORT_CREATED", report });
      if (remote) {
        // Backend rebuilds the report server-side from stored data with the
        // same id/timestamp so the UI and database agree.
        void generateReportAI({
          caseId,
          reportId: report.id,
          generatedAt: report.generatedAt,
        }).catch(() => {
          void generateReportMut({
            caseId,
            reportId: report.id,
            generatedAt: report.generatedAt,
          }).catch(() => undefined);
        });
      }
      return report;
    },
    [remote, generateReportAI, generateReportMut],
  );

  const updateSettings = useCallback(
    (patch: SettingsPatch) => {
      dispatch({ type: "UPDATE_SETTINGS", patch });
      if (remote) {
        void updateSettingsMut({
          appearance: patch.appearance,
          investigation: patch.investigation,
          simulation: patch.simulation,
        }).catch(() => undefined);
      }
    },
    [remote, updateSettingsMut],
  );

  const notify = useCallback((n: Omit<AppNotification, "id" | "read" | "timestamp">) => {
    dispatch({ type: "NOTIFY", notification: n });
  }, []);

  const markNotificationsRead = useCallback(() => {
    dispatch({ type: "MARK_NOTIFS_READ" });
  }, []);

  const clearNotifications = useCallback(() => {
    dispatch({ type: "CLEAR_NOTIFS" });
  }, []);

  const value = useMemo<JaalContextValue>(
    () => ({
      state,
      signInDemo,
      signOutDemo,
      setBackendStatus,
      createCase,
      getCase,
      sendMessage,
      advanceSimulation,
      ingestTranscript,
      togglePause,
      endInvestigation,
      resetCase,
      resetDemoData,
      clearLogs,
      setCaseStatus,
      generateHash,
      verifyEvidence,
      rebaselineEvidence,
      setEvidenceContent,
      setEvidenceNotes,
      reviewEvidence,
      createReport,
      updateSettings,
      notify,
      markNotificationsRead,
      clearNotifications,
      updateProfile,
    }),
    [
      state,
      signInDemo,
      signOutDemo,
      setBackendStatus,
      createCase,
      getCase,
      sendMessage,
      advanceSimulation,
      ingestTranscript,
      togglePause,
      endInvestigation,
      resetCase,
      resetDemoData,
      clearLogs,
      setCaseStatus,
      generateHash,
      verifyEvidence,
      rebaselineEvidence,
      setEvidenceContent,
      setEvidenceNotes,
      reviewEvidence,
      createReport,
      updateSettings,
      notify,
      markNotificationsRead,
      clearNotifications,
      updateProfile,
    ],
  );

  return <JaalContext.Provider value={value}>{children}</JaalContext.Provider>;
}

export function useJaal(): JaalContextValue {
  const ctx = useContext(JaalContext);
  if (!ctx) throw new Error("useJaal must be used within JaalProvider");
  return ctx;
}

/** Convenience for the seeded/derived state without the actions. */
export function useJaalState(): JaalState {
  return useJaal().state;
}
