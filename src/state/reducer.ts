import { OPENING_TURN } from "@/data/demoConversation";
import { getScenario } from "@/data/scenarios";
import { buildSeedCases, type SeedCase } from "@/data/demoInvestigations";
import { getDemoSession, type DemoSession } from "@/lib/demoSession";
import {
  analyzeMessage,
  createStages,
  currentStageId,
  STAGE_LABELS,
  TACTIC_META,
} from "@/services/investigationService";
import { toEvidenceItem, type EvidenceDraft } from "@/services/evidenceService";
import type { BackendStatus } from "@/services/api";
import type {
  EvidenceItem,
  EvidenceReviewStatus,
} from "@/types/evidence";
import type {
  ActivityEvent,
  CaseRuntime,
  Investigation,
  LogEntry,
} from "@/types/investigation";
import type { ConversationMessage } from "@/types/message";
import type { EvidenceReport } from "@/types/report";
import { DEFAULT_SETTINGS, type Settings } from "@/types/settings";

export const STATE_VERSION = 3;
const STORAGE_KEY = `jaal.state.v${STATE_VERSION}`;
const MAX_LOGS = 400;
const MAX_ACTIVITIES = 250;

export interface AppNotification {
  id: string;
  title: string;
  detail: string;
  caseId?: string;
  timestamp: number;
  read: boolean;
  kind: "stage" | "evidence" | "report" | "system";
}

export interface JaalState {
  version: number;
  hydrated: boolean;
  user: DemoSession | null;
  backendStatus: BackendStatus;
  investigations: Investigation[];
  sessions: Record<string, CaseRuntime>;
  reports: EvidenceReport[];
  settings: Settings;
  notifications: AppNotification[];
}

let seq = 0;
export function uid(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq.toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

function capLogs(entries: LogEntry[]): LogEntry[] {
  return entries.length > MAX_LOGS ? entries.slice(-MAX_LOGS) : entries;
}

function capActivities(entries: ActivityEvent[]): ActivityEvent[] {
  return entries.length > MAX_ACTIVITIES
    ? entries.slice(-MAX_ACTIVITIES)
    : entries;
}

// ---------------------------------------------------------------------------
// Seed materialisation — runs the real analysis pipeline over demo history so
// seeded tactics, stages and evidence come from actual message content.
// ---------------------------------------------------------------------------

function emptyRuntime(seed: SeedCase): CaseRuntime {
  const rt: CaseRuntime = {
    caseId: seed.investigation.id,
    messages: [],
    evidence: [],
    tactics: [],
    stages: createStages(),
    logs: [],
    activities: [],
    cursor: seed.cursor,
    turnCount: seed.turnCount,
    status: seed.status,
    startedAt: seed.startedAt,
    endedAt: seed.endedAt,
    typing: false,
    exhausted: seed.status === "completed",
  };
  rt.activities.push({
    id: uid("act"),
    caseId: rt.caseId,
    timestamp: seed.startedAt,
    kind: "case_started",
    title: "Investigation started",
    detail: `${seed.investigation.category} · source ${seed.investigation.source}`,
  });
  rt.logs.push({
    id: uid("log"),
    caseId: rt.caseId,
    timestamp: seed.startedAt,
    level: "info",
    message: `Case ${rt.caseId} initialised (${seed.investigation.detectionMode} mode)`,
  });
  for (const m of seed.messages) {
    const analysis = analyzeMessage(m, rt.tactics, rt.stages, {
      tacticDetection: seed.investigation.flags.tacticDetection,
      identifierExtraction: seed.investigation.flags.identifierExtraction,
      at: m.timestamp,
    });
    rt.messages.push(m);
    rt.tactics.push(...analysis.tactics);
    rt.stages = analysis.stages;
    rt.logs = capLogs([...rt.logs, ...analysis.logs]);
    const newEvidence: EvidenceItem[] = [];
    for (const d of analysis.evidence) {
      if (
        rt.evidence.some(
          (e) =>
            e.type === d.type && e.value.toLowerCase() === d.value.toLowerCase(),
        ) ||
        newEvidence.some(
          (e) =>
            e.type === d.type && e.value.toLowerCase() === d.value.toLowerCase(),
        )
      )
        continue;
      newEvidence.push(
        toEvidenceItem(rt.caseId, d, { messageId: m.id, messageText: m.text }, m.timestamp),
      );
    }
    rt.evidence.push(...newEvidence);
    const acts: ActivityEvent[] = [];
    analysis.tactics.forEach((t) =>
      acts.push({
        id: uid("act"),
        caseId: rt.caseId,
        timestamp: t.timestamp,
        kind: "tactic_detected",
        title: `Tactic detected: ${TACTIC_META[t.tactic].name}`,
        detail: t.explanation,
      }),
    );
    newEvidence.forEach((e) =>
      acts.push({
        id: uid("act"),
        caseId: rt.caseId,
        timestamp: e.extractedAt,
        kind: "identifier_extracted",
        title: `${e.label} extracted`,
        detail: e.value,
      }),
    );
    rt.activities = capActivities([...rt.activities, ...acts]);
  }
  if (seed.status === "completed") {
    rt.logs.push({
      id: uid("log"),
      caseId: rt.caseId,
      timestamp: seed.endedAt ?? Date.now(),
      level: "success",
      message: "Simulation script exhausted — investigation completed",
    });
  }
  return rt;
}

export function buildInitialState(user: DemoSession | null = null): JaalState {
  const seeds = buildSeedCases();
  const investigations = seeds.map((s) => s.investigation);
  const sessions: Record<string, CaseRuntime> = {};
  for (const seed of seeds) sessions[seed.investigation.id] = emptyRuntime(seed);
  return {
    version: STATE_VERSION,
    hydrated: false,
    user,
    backendStatus: "unconfigured",
    investigations,
    sessions,
    reports: [],
    settings: DEFAULT_SETTINGS,
    notifications: [
      {
        id: uid("ntf"),
        title: "Simulation mode active",
        detail:
          "JAAL is running controlled synthetic conversations. No real scammers or third parties are contacted.",
        timestamp: Date.now(),
        read: false,
        kind: "system",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export function loadState(): JaalState {
  const fallback = buildInitialState(getDemoSession());
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as JaalState;
    if (!parsed || parsed.version !== STATE_VERSION) return fallback;
    if (!Array.isArray(parsed.investigations) || !parsed.sessions) return fallback;
    return {
      ...fallback,
      ...parsed,
      user: getDemoSession(),
      hydrated: false,
      backendStatus: "unconfigured",
      settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
      notifications: parsed.notifications ?? [],
    };
  } catch {
    return fallback;
  }
}

export function saveState(state: JaalState): void {
  try {
    const payload: JaalState = {
      ...state,
      hydrated: true,
      sessions: Object.fromEntries(
        Object.entries(state.sessions).map(([k, v]) => [k, { ...v, typing: false }]),
      ),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota or unavailable — state stays in memory */
  }
}

export function clearPersistedState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type SettingsPatch = {
  appearance?: Partial<Settings["appearance"]>;
  investigation?: Partial<Settings["investigation"]>;
  simulation?: Partial<Settings["simulation"]>;
};

export type Action =
  | { type: "HYDRATE"; state: JaalState }
  | { type: "SET_USER"; user: DemoSession | null }
  | { type: "SET_BACKEND_STATUS"; status: BackendStatus }
  | {
      type: "CREATE_CASE";
      investigation: Investigation;
      seedMessages: ConversationMessage[];
      transcriptDraft?: EvidenceDraft | null;
    }
  | {
      type: "INGEST_MESSAGE";
      message: ConversationMessage;
      cursor?: number;
      turnCount?: number;
    }
  | { type: "TYPING"; caseId: string; typing: boolean }
  | { type: "SET_CASE_STATUS"; caseId: string; status: CaseRuntime["status"] }
  | { type: "RESET_CASE"; caseId: string }
  | { type: "RESET_DEMO" }
  | { type: "CLEAR_LOGS"; caseId: string }
  | { type: "SET_CASE_FILTER_STATUS"; caseId: string; status: Investigation["status"] }
  | { type: "HASH_SET"; caseId: string; evidenceId: string; hash: string; at: number }
  | {
      type: "VERIFY_RESULT";
      caseId: string;
      evidenceId: string;
      match: boolean;
      at: number;
    }
  | { type: "SET_EVIDENCE_CONTENT"; caseId: string; evidenceId: string; content: string }
  | { type: "SET_EVIDENCE_NOTES"; caseId: string; evidenceId: string; notes: string }
  | {
      type: "REVIEW_EVIDENCE";
      caseId: string;
      evidenceId: string;
      status: EvidenceReviewStatus;
      note?: string;
    }
  | { type: "REPORT_CREATED"; report: EvidenceReport }
  | { type: "UPDATE_SETTINGS"; patch: SettingsPatch }
  | { type: "NOTIFY"; notification: Omit<AppNotification, "id" | "read" | "timestamp"> }
  | { type: "MARK_NOTIFS_READ" }
  | { type: "CLEAR_NOTIFS" };

function updateRuntime(
  state: JaalState,
  caseId: string,
  fn: (rt: CaseRuntime) => CaseRuntime,
): Record<string, CaseRuntime> {
  const rt = state.sessions[caseId];
  if (!rt) return state.sessions;
  return { ...state.sessions, [caseId]: fn(rt) };
}

function updateEvidence(
  rt: CaseRuntime,
  evidenceId: string,
  fn: (item: EvidenceItem) => EvidenceItem,
): EvidenceItem[] {
  return rt.evidence.map((e) => (e.id === evidenceId ? fn(e) : e));
}

function logEntry(caseId: string, level: LogEntry["level"], message: string, at = Date.now()): LogEntry {
  return { id: uid("log"), caseId, timestamp: at, level, message };
}

function activity(
  caseId: string,
  kind: ActivityEvent["kind"],
  title: string,
  detail: string,
  at = Date.now(),
): ActivityEvent {
  return { id: uid("act"), caseId, timestamp: at, kind, title, detail };
}

/** Attach imported transcript evidence to a freshly created runtime. */
function withTranscript(
  rt: CaseRuntime,
  draft: EvidenceDraft | null | undefined,
): CaseRuntime {
  if (!draft) return rt;
  const item = toEvidenceItem(rt.caseId, draft, {
    messageId: null,
    messageText: "Imported transcript attached to the case",
  });
  return {
    ...rt,
    evidence: [...rt.evidence, item],
    logs: capLogs([
      ...rt.logs,
      logEntry(rt.caseId, "info", `Transcript indexed as evidence · ${item.value}`),
    ]),
    activities: capActivities([
      ...rt.activities,
      activity(rt.caseId, "identifier_extracted", "Transcript captured", item.value),
    ]),
  };
}

export function reducer(state: JaalState, action: Action): JaalState {
  switch (action.type) {
    case "HYDRATE":
      return { ...action.state, hydrated: true };

    case "SET_USER":
      return { ...state, user: action.user };

    case "SET_BACKEND_STATUS":
      return { ...state, backendStatus: action.status };

    case "CREATE_CASE": {
      const { investigation, seedMessages } = action;
      const seed: SeedCase = {
        investigation,
        messages: seedMessages,
        cursor: 0,
        turnCount: 0,
        status: "running",
        startedAt: investigation.createdAt,
        endedAt: null,
      };
      const rt = emptyRuntime(seed);
      // Simulated conversations open with the scripted first line.
      if (investigation.source === "simulation" && seedMessages.length === 0) {
        const opening: ConversationMessage = {
          id: uid("msg"),
          caseId: investigation.id,
          author: "scammer",
          text:
            getScenario(investigation.scenarioKey)?.turns[0]?.text ??
            OPENING_TURN.text,
          timestamp: Date.now(),
          source: "SIM-ENGINE",
        };
        const analysis = analyzeMessage(opening, rt.tactics, rt.stages, {
          tacticDetection: investigation.flags.tacticDetection,
          identifierExtraction: investigation.flags.identifierExtraction,
        });
        rt.messages.push(opening);
        rt.tactics.push(...analysis.tactics);
        rt.stages = analysis.stages;
        rt.cursor = 1;
        rt.turnCount = 1;
        rt.logs = capLogs([...rt.logs, ...analysis.logs]);
        for (const d of analysis.evidence) {
          rt.evidence.push(
            toEvidenceItem(rt.caseId, d, { messageId: opening.id, messageText: opening.text }),
          );
          rt.activities = capActivities([
            ...rt.activities,
            activity(rt.caseId, "identifier_extracted", `${d.label} extracted`, d.value, opening.timestamp),
          ]);
        }
        analysis.tactics.forEach((t) =>
          (rt.activities = capActivities([
            ...rt.activities,
            activity(
              rt.caseId,
              "tactic_detected",
              `Tactic detected: ${TACTIC_META[t.tactic].name}`,
              t.explanation,
              opening.timestamp,
            ),
          ])),
        );
      }
      return {
        ...state,
        investigations: [investigation, ...state.investigations],
        sessions: {
          ...state.sessions,
          [investigation.id]: withTranscript(rt, action.transcriptDraft),
        },
        notifications: [
          {
            id: uid("ntf"),
            title: `Case ${investigation.id} opened`,
            detail: `${investigation.title} — ${investigation.category}`,
            caseId: investigation.id,
            timestamp: Date.now(),
            read: false,
            kind: "system" as const,
          },
          ...state.notifications,
        ].slice(0, 40),
      };
    }

    case "INGEST_MESSAGE": {
      const { message, cursor, turnCount } = action;
      const caseId = message.caseId;
      const rt = state.sessions[caseId];
      const inv = state.investigations.find((i) => i.id === caseId);
      if (!rt || !inv) return state;

      const analysis = analyzeMessage(message, rt.tactics, rt.stages, {
        tacticDetection: inv.flags.tacticDetection,
        identifierExtraction:
          inv.flags.identifierExtraction && state.settings.investigation.autoExtract,
        at: message.timestamp,
      });

      const newEvidence: EvidenceItem[] = [];
      for (const d of analysis.evidence) {
        const dup =
          rt.evidence.some(
            (e) =>
              e.type === d.type && e.value.toLowerCase() === d.value.toLowerCase(),
          ) ||
          newEvidence.some(
            (e) =>
              e.type === d.type && e.value.toLowerCase() === d.value.toLowerCase(),
          );
        if (dup) continue;
        newEvidence.push(
          toEvidenceItem(caseId, d, {
            messageId: message.id,
            messageText: message.text,
          }, message.timestamp),
        );
      }

      const stageBefore = currentStageId(rt.stages);
      const stageAfter = currentStageId(analysis.stages);
      const stageChanged = message.author === "scammer" && stageAfter !== stageBefore;

      const acts: ActivityEvent[] = [];
      if (message.author !== "system") {
        acts.push(
          activity(
            caseId,
            "message",
            message.author === "scammer" ? "Message received" : "Decoy message sent",
            message.text.slice(0, 96),
            message.timestamp,
          ),
        );
      }
      analysis.tactics.forEach((t) =>
        acts.push(
          activity(
            caseId,
            "tactic_detected",
            `Tactic detected: ${TACTIC_META[t.tactic].name}`,
            t.explanation,
            t.timestamp,
          ),
        ),
      );
      newEvidence.forEach((e) =>
        acts.push(
          activity(caseId, "identifier_extracted", `${e.label} extracted`, e.value, e.extractedAt),
        ),
      );
      if (stageChanged) {
        acts.push(
          activity(
            caseId,
            "stage_advanced",
            `Stage reached: ${STAGE_LABELS[stageAfter]}`,
            analysis.stages.find((s) => s.id === stageAfter)?.reason ?? "",
            message.timestamp,
          ),
        );
      }

      const logs: LogEntry[] = [...analysis.logs];
      if (message.author === "decoy") {
        logs.push(logEntry(caseId, "info", "Operator (decoy) message sent", message.timestamp));
      }
      if (stageChanged) {
        logs.push(
          logEntry(caseId, "warn", `Kill-chain stage: ${STAGE_LABELS[stageAfter]}`, message.timestamp),
        );
      }

      const sessions = {
        ...state.sessions,
        [caseId]: {
          ...rt,
          messages: [...rt.messages, message],
          evidence: [...rt.evidence, ...newEvidence],
          tactics: [...rt.tactics, ...analysis.tactics],
          stages: analysis.stages,
          logs: capLogs([...rt.logs, ...logs]),
          activities: capActivities([...rt.activities, ...acts]),
          cursor: cursor ?? rt.cursor,
          turnCount: turnCount ?? rt.turnCount,
          typing: false,
        },
      };

      const investigations = state.investigations.map((i) =>
        i.id === caseId
          ? {
              ...i,
              lastActivityAt: Math.max(i.lastActivityAt, message.timestamp),
              currentStage:
                message.author === "scammer" ? stageAfter : i.currentStage,
            }
          : i,
      );

      const notifications =
        stageChanged && state.settings.simulation.simulatedActivity
          ? [
              {
                id: uid("ntf"),
                title: `${caseId} · ${STAGE_LABELS[stageAfter]}`,
                detail: analysis.stages.find((s) => s.id === stageAfter)?.reason ?? "",
                caseId,
                timestamp: Date.now(),
                read: false,
                kind: "stage" as const,
              },
              ...state.notifications,
            ].slice(0, 40)
          : state.notifications;

      return { ...state, sessions, investigations, notifications };
    }

    case "TYPING":
      return {
        ...state,
        sessions: updateRuntime(state, action.caseId, (rt) => ({
          ...rt,
          typing: action.typing,
        })),
      };

    case "SET_CASE_STATUS":
      return {
        ...state,
        sessions: updateRuntime(state, action.caseId, (rt) => ({
          ...rt,
          status: action.status,
          endedAt:
            action.status === "completed" ? (rt.endedAt ?? Date.now()) : rt.endedAt,
          typing: false,
        })),
        investigations: state.investigations.map((i) =>
          i.id === action.caseId
            ? {
                ...i,
                status:
                  action.status === "completed" && i.status === "active"
                    ? "completed"
                    : i.status,
                lastActivityAt: Date.now(),
              }
            : i,
        ),
      };

    case "RESET_CASE": {
      const inv = state.investigations.find((i) => i.id === action.caseId);
      if (!inv) return state;
      const now = Date.now();
      const seed: SeedCase = {
        investigation: inv,
        messages: [],
        cursor: 0,
        turnCount: 0,
        status: "running",
        startedAt: now,
        endedAt: null,
      };
      const rt = emptyRuntime(seed);
      if (inv.source === "simulation") {
        const opening: ConversationMessage = {
          id: uid("msg"),
          caseId: inv.id,
          author: "scammer",
          text: getScenario(inv.scenarioKey)?.turns[0]?.text ?? OPENING_TURN.text,
          timestamp: now,
          source: "SIM-ENGINE",
        };
        const analysis = analyzeMessage(opening, rt.tactics, rt.stages, {
          tacticDetection: inv.flags.tacticDetection,
          identifierExtraction: inv.flags.identifierExtraction,
          at: now,
        });
        rt.messages.push(opening);
        rt.tactics.push(...analysis.tactics);
        rt.stages = analysis.stages;
        rt.cursor = 1;
        rt.turnCount = 1;
        rt.logs = capLogs([...rt.logs, ...analysis.logs]);
        for (const d of analysis.evidence) {
          rt.evidence.push(
            toEvidenceItem(rt.caseId, d, { messageId: opening.id, messageText: opening.text }, now),
          );
        }
      }
      rt.logs = capLogs([
        ...rt.logs,
        logEntry(inv.id, "success", "Simulation reset — session cleared"),
      ]);
      return {
        ...state,
        sessions: { ...state.sessions, [inv.id]: rt },
        investigations: state.investigations.map((i) =>
          i.id === inv.id
            ? {
                ...i,
                status: "active",
                currentStage: "contact",
                lastActivityAt: now,
              }
            : i,
        ),
      };
    }

    case "RESET_DEMO": {
      const fresh = buildInitialState(state.user);
      return { ...fresh, hydrated: true };
    }

    case "CLEAR_LOGS":
      return {
        ...state,
        sessions: updateRuntime(state, action.caseId, (rt) => ({
          ...rt,
          logs: [
            logEntry(action.caseId, "info", "Log cleared by operator"),
          ],
        })),
      };

    case "SET_CASE_FILTER_STATUS":
      return {
        ...state,
        investigations: state.investigations.map((i) =>
          i.id === action.caseId ? { ...i, status: action.status } : i,
        ),
      };

    case "HASH_SET":
      return {
        ...state,
        sessions: updateRuntime(state, action.caseId, (rt) => {
          const item = rt.evidence.find((e) => e.id === action.evidenceId);
          if (!item) return rt;
          return {
            ...rt,
            evidence: updateEvidence(rt, action.evidenceId, (e) => ({
              ...e,
              hash: action.hash,
              hashGeneratedAt: action.at,
              hashStatus: "generated",
              tampered: false,
            })),
            logs: capLogs([
              ...rt.logs,
              logEntry(action.caseId, "success", `SHA-256 hash generated · ${item.label}`, action.at),
            ]),
            activities: capActivities([
              ...rt.activities,
              activity(
                action.caseId,
                "hash_generated",
                "Evidence hash generated",
                `${item.label}: ${item.value}`,
                action.at,
              ),
            ]),
          };
        }),
      };

    case "VERIFY_RESULT": {
      const item = state.sessions[action.caseId]?.evidence.find(
        (e) => e.id === action.evidenceId,
      );
      if (!item) return state;
      return {
        ...state,
        sessions: updateRuntime(state, action.caseId, (rt) => ({
          ...rt,
          evidence: updateEvidence(rt, action.evidenceId, (e) => ({
            ...e,
            hashStatus: action.match ? "verified" : "mismatch",
          })),
          logs: capLogs([
            ...rt.logs,
            action.match
              ? logEntry(action.caseId, "success", `Integrity verified · ${item.label}`, action.at)
              : logEntry(
                  action.caseId,
                  "error",
                  `Hash mismatch · ${item.label} — content no longer matches the recorded hash`,
                  action.at,
                ),
          ]),
          activities: capActivities([
            ...rt.activities,
            activity(
              action.caseId,
              action.match ? "integrity_verified" : "integrity_mismatch",
              action.match ? "Integrity verified" : "Integrity mismatch",
              action.match
                ? `${item.label}: content matches recorded hash`
                : `${item.label}: content no longer matches the recorded hash`,
              action.at,
            ),
          ]),
        })),
        notifications: action.match
          ? state.notifications
          : [
              {
                id: uid("ntf"),
                title: `Integrity mismatch · ${action.caseId}`,
                detail: `${item.label} content no longer matches its recorded hash.`,
                caseId: action.caseId,
                timestamp: action.at,
                read: false,
                kind: "evidence" as const,
              },
              ...state.notifications,
            ].slice(0, 40),
      };
    }

    case "SET_EVIDENCE_CONTENT":
      return {
        ...state,
        sessions: updateRuntime(state, action.caseId, (rt) => ({
          ...rt,
          evidence: updateEvidence(rt, action.evidenceId, (e) => ({
            ...e,
            content: action.content,
            tampered: true,
          })),
          logs: capLogs([
            ...rt.logs,
            logEntry(action.caseId, "warn", "Evidence content modified by operator (integrity demo)"),
          ]),
        })),
      };

    case "SET_EVIDENCE_NOTES":
      return {
        ...state,
        sessions: updateRuntime(state, action.caseId, (rt) => ({
          ...rt,
          evidence: updateEvidence(rt, action.evidenceId, (e) => ({
            ...e,
            notes: action.notes,
          })),
        })),
      };

    case "REVIEW_EVIDENCE":
      return {
        ...state,
        sessions: updateRuntime(state, action.caseId, (rt) => ({
          ...rt,
          evidence: updateEvidence(rt, action.evidenceId, (e) => ({
            ...e,
            reviewStatus: action.status,
            reviewNote: action.note ?? e.reviewNote ?? null,
            reviewedAt: Date.now(),
          })),
          logs: capLogs([
            ...rt.logs,
            logEntry(
              action.caseId,
              "info",
              `Analyst review · ${action.status.replace("_", " ")}`,
            ),
          ]),
          activities: capActivities([
            ...rt.activities,
            activity(
              action.caseId,
              "evidence_reviewed",
              "Analyst review recorded",
              `${action.status.replace("_", " ")}`,
            ),
          ]),
        })),
      };

    case "REPORT_CREATED": {
      const rt = state.sessions[action.report.caseId];
      return {
        ...state,
        reports: [action.report, ...state.reports].slice(0, 50),
        sessions: rt
          ? {
              ...state.sessions,
              [action.report.caseId]: {
                ...rt,
                logs: capLogs([
                  ...rt.logs,
                  logEntry(
                    action.report.caseId,
                    "success",
                    `Report ${action.report.id} created`,
                    action.report.generatedAt,
                  ),
                ]),
                activities: capActivities([
                  ...rt.activities,
                  activity(
                    action.report.caseId,
                    "report_created",
                    `Report ${action.report.id} created`,
                    `${action.report.evidenceCount} evidence items included`,
                    action.report.generatedAt,
                  ),
                ]),
              },
            }
          : state.sessions,
        notifications: [
          {
            id: uid("ntf"),
            title: `Report ${action.report.id} created`,
            detail: `${action.report.caseId} · ${action.report.evidenceCount} evidence items`,
            caseId: action.report.caseId,
            timestamp: action.report.generatedAt,
            read: false,
            kind: "report" as const,
          },
          ...state.notifications,
        ].slice(0, 40),
      };
    }

    case "UPDATE_SETTINGS":
      return {
        ...state,
        settings: {
          appearance: { ...state.settings.appearance, ...action.patch.appearance },
          investigation: { ...state.settings.investigation, ...action.patch.investigation },
          simulation: { ...state.settings.simulation, ...action.patch.simulation },
        },
      };

    case "NOTIFY":
      return {
        ...state,
        notifications: [
          {
            ...action.notification,
            id: uid("ntf"),
            timestamp: Date.now(),
            read: false,
          },
          ...state.notifications,
        ].slice(0, 40),
      };

    case "MARK_NOTIFS_READ":
      return {
        ...state,
        notifications: state.notifications.map((n) => ({ ...n, read: true })),
      };

    case "CLEAR_NOTIFS":
      return { ...state, notifications: [] };

    default:
      return state;
  }
}
