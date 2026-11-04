import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQuery } from "convex/react";
import { BottomConsole } from "@/components/console/BottomConsole";
import { ConversationConsole } from "@/components/conversation/ConversationConsole";
import { EvidenceBoard, type BoardSelection } from "@/components/board/EvidenceBoard";
import { EvidenceDrawer } from "@/components/evidence/EvidenceDrawer";
import { EvidencePanel } from "@/components/evidence/EvidencePanel";
import { AiAnalysisPanel } from "@/components/analysis/AiAnalysisPanel";
import { AiStrategyPanel } from "@/components/analysis/AiStrategyPanel";
import { DetectedTactics } from "@/components/analysis/DetectedTactics";
import { CaseRail } from "@/components/investigation/CaseRail";
import { WorkspaceHeader } from "@/components/investigation/WorkspaceHeader";
import { Panel } from "@/components/ui/panel";
import { api } from "@/convex/_generated/api";
import { useJaal } from "@/state/JaalProvider";
import { cn } from "@/lib/utils";
import { isAiEngine, statusStyle } from "@/theme/status";
import type {
  CaseRuntime,
  DetectedTactic,
  Investigation,
} from "@/types/investigation";
import type { GraphTacticData } from "@/types/evidenceGraph";
import { Brain, Fingerprint, MessagesSquare, ScrollText, Waypoints } from "lucide-react";

type MobileTab = "chat" | "board" | "evidence" | "logs";

const MOBILE_TABS: { id: MobileTab; label: string; Icon: typeof Brain }[] = [
  { id: "chat", label: "Chat", Icon: MessagesSquare },
  { id: "board", label: "Board", Icon: Waypoints },
  { id: "evidence", label: "Evidence", Icon: Fingerprint },
  { id: "logs", label: "Logs", Icon: ScrollText },
];

/**
 * INVESTIGATION WORKSPACE — Cyber Noir forensic layout.
 *
 * Desktop: left case rail (briefing / stages / clues / activity), a dominant
 * center board over the pinned live-intercept conversation, a right rail of AI
 * analysis + tactics + evidence review, and the collapsible activity console
 * spanning the bottom. Mobile collapses to Chat / Board / Evidence / Logs tabs.
 *
 * All data flows through the existing Convex-backed store — this component
 * only renders and routes it.
 */
export default function InvestigationWorkspacePage() {
  const {
    state,
    sendMessage,
    endInvestigation,
    togglePause,
    resetCase,
    createReport,
  } = useJaal();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [mobileTab, setMobileTab] = useState<MobileTab>("chat");
  const [evidenceDrawerId, setEvidenceDrawerId] = useState<string | null>(null);
  const [highlightMsgId, setHighlightMsgId] = useState<string | null>(null);
  const [boardSelection, setBoardSelection] = useState<BoardSelection>(null);

  // Backend graph — powers the board and tactic→node selection mapping.
  const graph = useQuery(api.evidenceGraph.getByInvestigation, {
    investigationId: id ?? "",
  });

  const investigation: Investigation | undefined = state.investigations.find(
    (i) => i.id === id,
  );
  const runtime: CaseRuntime | undefined = id ? state.sessions[id] : undefined;

  if (!investigation || !runtime) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 p-10 text-center">
        <p className="font-mono text-xs text-jmuted">
          Case not found. Open a case from the investigations list.
        </p>
        <Link
          to="/investigations"
          className="border border-jcyan/50 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-jcyan transition-colors hover:bg-jcyan/10"
        >
          Back to investigations
        </Link>
      </div>
    );
  }

  const evidenceDrawerItem =
    runtime.evidence.find((e) => e.id === evidenceDrawerId) ?? null;

  // MSG #NN lookup so evidence / tactics can reference their source line.
  const messageNumbers: Record<string, number> = {};
  runtime.messages.forEach((m, i) => {
    messageNumbers[m.id] = i + 1;
  });

  const send = (text: string) => void sendMessage(investigation.id, text);

  /** Source navigation: jump the conversation to the linked message. */
  const openSourceMessage = (messageId: string) => {
    setMobileTab("chat");
    setHighlightMsgId(null);
    // Re-trigger highlight even if the same id is clicked twice.
    window.setTimeout(() => setHighlightMsgId(messageId), 10);
  };

  /**
   * Map a client DetectedTactic (composite id `tactic:messageId`) to its
   * stable graph node id (`tac:<recordId>`). Matched on the persisted fields
   * both projections carry — never fuzzy-matched.
   */
  const findTacticNodeId = (t: DetectedTactic): string | null => {
    const node = graph?.nodes.find((n) => {
      if (n.type !== "tactic") return false;
      const d = n.data as GraphTacticData;
      return d.tactic === t.tactic && (d.messageId ?? null) === (t.messageId ?? null);
    });
    return node?.id ?? null;
  };

  const engineLabel = isAiEngine(runtime.strategy?.source)
    ? "groq / live ai"
    : "simulation";

  const board = (defaultView?: "board" | "list") => (
    <EvidenceBoard
      caseId={investigation.id}
      selected={boardSelection}
      onSelect={setBoardSelection}
      onOpenEvidence={setEvidenceDrawerId}
      onOpenSource={openSourceMessage}
      defaultView={defaultView}
    />
  );

  const conversation = (
    <ConversationConsole
      investigation={investigation}
      runtime={runtime}
      highlightId={highlightMsgId}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Desktop investigation header — identity, status, engine, actions */}
      <div className="hidden lg:block">
        <WorkspaceHeader
          investigation={investigation}
          runtime={runtime}
          onPause={() => togglePause(investigation.id)}
          onEnd={() => endInvestigation(investigation.id)}
          onReset={() => resetCase(investigation.id)}
          onReport={() => {
            const report = createReport(investigation.id);
            if (report) navigate(`/reports/${report.id}`);
          }}
        />
      </div>

      {/* Mobile header + tab navigation */}
      <div className="lg:hidden">
        <MobileCaseBar investigation={investigation} runtime={runtime} />
        <nav className="flex shrink-0 border-b border-jborder/70 bg-jsurface/60">
          {MOBILE_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setMobileTab(t.id)}
              className={cn(
                "relative flex flex-1 items-center justify-center gap-1 px-1 py-2.5 font-mono text-[10px] uppercase tracking-widest transition-colors",
                mobileTab === t.id
                  ? "text-jcyan"
                  : "text-jmuted hover:text-jtext",
              )}
            >
              <t.Icon className="size-3" />
              {t.label}
              {t.id === "evidence" && runtime.evidence.length > 0 && (
                <span className="text-jcyan/80">{runtime.evidence.length}</span>
              )}
              {mobileTab === t.id && (
                <span className="absolute inset-x-2 bottom-0 h-0.5 bg-jcyan" />
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Desktop workspace — left rail · center board+chat · right rail */}
      <div className="hidden min-h-0 flex-1 grid-cols-1 lg:grid lg:grid-cols-[minmax(0,1fr)_330px] xl:grid-cols-[278px_minmax(0,1fr)_352px]">
        {/* Left rail — case briefing, stages, clues, activity (xl+) */}
        <div className="hidden min-h-0 min-w-0 border-r border-jborder/60 bg-jsurface/40 xl:block">
          <CaseRail investigation={investigation} runtime={runtime} />
        </div>

        {/* Center — evidence board (dominant) over the live intercept */}
        <div className="grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_38%] gap-2 p-2">
          <div className="jaal-panel relative flex min-h-0 min-w-0 flex-col overflow-hidden">
            {board()}
          </div>
          <div className="min-h-0 min-w-0">{conversation}</div>
        </div>

        {/* Right rail — AI analysis, strategy, tactics, evidence review */}
        <aside className="flex min-h-0 min-w-0 flex-col gap-2 overflow-y-auto border-l border-jborder/60 bg-jsurface/40 p-2">
          <Panel
            label="AI analysis"
            right={
              <>
                <Link
                  to={`/investigations/${investigation.id}/intelligence`}
                  className="whitespace-nowrap border px-1.5 py-px font-mono text-[8px] uppercase tracking-widest"
                  style={statusStyle("engine", isAiEngine(runtime.strategy?.source) ? "claude" : "simulation")}
                >
                  Intelligence hub
                </Link>
                <span
                  className="whitespace-nowrap border px-1.5 py-px font-mono text-[8px] uppercase tracking-widest"
                  style={statusStyle(
                    "engine",
                    isAiEngine(runtime.strategy?.source) ? "claude" : "simulation",
                  )}
                >
                  {engineLabel}
                </span>
              </>
            }
          >
            <AiAnalysisPanel runtime={runtime} />
          </Panel>

          <Panel label="AI investigation strategy">
            <AiStrategyPanel
              runtime={runtime}
              investigation={investigation}
              onSend={send}
            />
          </Panel>

          <Panel
            label="Detected tactics"
            right={
              <span className="font-mono text-[9px] tracking-widest text-jamber">
                {runtime.tactics.length} hits
              </span>
            }
          >
            <div className="max-h-56 overflow-y-auto">
              <DetectedTactics
                tactics={runtime.tactics}
                messageNumbers={messageNumbers}
                onSelectTactic={(t) => {
                  const nodeId = findTacticNodeId(t);
                  if (nodeId) {
                    setBoardSelection({ kind: "tactic", id: nodeId });
                  } else if (t.messageId) {
                    // Graph unavailable (loading/offline): keep the tactic →
                    // supporting-message jump working via the conversation.
                    openSourceMessage(t.messageId);
                  }
                }}
              />
            </div>
          </Panel>

          <div className="min-h-0 h-[320px] shrink-0">
            <EvidencePanel
              caseId={investigation.id}
              messageNumbers={messageNumbers}
              onOpenItem={setEvidenceDrawerId}
              footer={
                <div className="flex items-center justify-between font-mono text-[8px] uppercase tracking-widest text-jmuted/70">
                  <span>SHA-256 · Web Crypto</span>
                  <Link
                    to="/evidence"
                    className="text-jcyan transition-colors hover:text-jcyan/80"
                  >
                    Full archive →
                  </Link>
                </div>
              }
            />
          </div>
        </aside>
      </div>

      {/* Mobile workspace — one active tab at a time */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:hidden">
        {mobileTab === "chat" && (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col p-2">
            {conversation}
          </div>
        )}

        {mobileTab === "board" && (
          <div className="jaal-panel mx-2 mb-2 mt-2 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {board("list")}
          </div>
        )}

        {mobileTab === "evidence" && (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col p-2">
            <EvidencePanel
              caseId={investigation.id}
              messageNumbers={messageNumbers}
              onOpenItem={setEvidenceDrawerId}
            />
          </div>
        )}

        {mobileTab === "logs" && (
          <div className="min-h-0 flex-1">
            <BottomConsole caseId={investigation.id} embedded />
          </div>
        )}
      </div>

      <EvidenceDrawer
        item={evidenceDrawerItem}
        caseId={investigation.id}
        open={evidenceDrawerId !== null}
        onOpenChange={(open) => {
          if (!open) setEvidenceDrawerId(null);
        }}
        onOpenSource={() => {
          const sourceId = evidenceDrawerItem?.sourceMessageId ?? null;
          setEvidenceDrawerId(null);
          if (sourceId) openSourceMessage(sourceId);
        }}
      />

      {/* Bottom activity console — desktop only (mobile uses the Logs tab). */}
      <div className="hidden shrink-0 lg:block">
        <BottomConsole caseId={investigation.id} />
      </div>
    </div>
  );
}

/** Mobile-only case strip: case ID, status, active stage. */
function MobileCaseBar({
  investigation,
  runtime,
}: {
  investigation: Investigation;
  runtime: CaseRuntime;
}) {
  const activeStage = runtime.stages.find((s) => s.status === "active");
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-jborder/70 bg-jsurface/80 px-3 py-2">
      <span className="flex size-7 shrink-0 items-center justify-center border border-jcyan/60 bg-jcyan/10 font-mono text-[11px] font-bold text-jcyan">
        JA
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] tracking-wider text-jcyan">
            {investigation.id}
          </span>
          <span
            className={cn(
              "flex items-center gap-1 border px-1 py-px font-mono text-[8px] uppercase tracking-widest",
              runtime.status === "running"
                ? "border-jred/50 bg-jred/10 text-jred"
                : runtime.status === "paused"
                  ? "border-jamber/50 bg-jamber/10 text-jamber"
                  : "border-jgreen/50 bg-jgreen/10 text-jgreen",
            )}
          >
            {runtime.status}
          </span>
          {activeStage && (
            <span className="hidden truncate font-mono text-[8px] uppercase tracking-widest text-jamber sm:inline">
              stage · {activeStage.label}
            </span>
          )}
        </div>
        <h1 className="truncate text-xs font-semibold text-jtext">
          {investigation.title}
        </h1>
      </div>
    </div>
  );
}
