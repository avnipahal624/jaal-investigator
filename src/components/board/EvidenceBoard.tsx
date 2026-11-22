import { EVIDENCE_ICON } from "@/components/evidence/EvidenceCard";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { useJaal } from "@/state/JaalProvider";
import type {
  EvidenceGraph,
  GraphEvidenceData,
  GraphIndicatorData,
  GraphMessageData,
  GraphNode,
  GraphTacticData,
} from "@/types/evidenceGraph";
import type { EvidenceItem } from "@/types/evidence";
import { formatClock } from "@/utils/formatters";
import { useQuery } from "convex/react";
import {
  AlertTriangle,
  Fingerprint,
  LayoutGrid,
  Link2,
  List,
  MapPin,
  MessageSquareQuote,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Wallet,
  WifiOff,
} from "lucide-react";
import {
  Component,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  NODE_SIZE,
  computeGraphLayout,
  edgeById,
  indexEdges,
  neighborsOf,
  nodeById,
  pinTilt,
  sourceAnchor,
  threadPath,
  type BaseNode,
  type BoardSelection,
  type EdgeIndex,
} from "./boardLayout";
import {
  indicatorAccent,
  integrityKey,
  reviewKey,
  statusDot,
  statusStyle,
} from "@/theme/status";

export type { BoardSelection } from "./boardLayout";

/**
 * EVIDENCE BOARD — the investigation graph, rendered straight from the
 * backend contract (`evidenceGraph.getByInvestigation`).
 *
 * Nodes are persisted records (messages, indicators, tactics, preserved
 * evidence); edges are backend-provided relationships with documented bases.
 * Nothing here invents a node, an identifier, an edge or an integrity result.
 *
 * Interactions: click a message/tactic node to jump the conversation to its
 * source line; click an indicator/evidence node to open the evidence detail
 * drawer; click an edge to read its relationship basis and source record.
 */

// Integrity status → label; colors come from the shared status map.
const INTEGRITY_LABEL: Record<string, string> = {
  NOT_HASHED: "unhashed",
  HASH_GENERATED: "hashed",
  INTEGRITY_VERIFIED: "verified",
  HASH_MISMATCH: "mismatch",
  TAMPER_SIMULATION: "tamper sim",
};

const integrityColor = (status: string) =>
  statusDot("integrity", integrityKey(status));
const integrityLabel = (status: string) =>
  INTEGRITY_LABEL[status] ?? INTEGRITY_LABEL["NOT_HASHED"]!;
const reviewDot = (status: string) =>
  statusDot("review", reviewKey(status) ?? "needsreview");

const EDGE_TONE: Record<
  string,
  { line: string; hot: string; pin: string; label: string; text: string }
> = {
  EXTRACTED_FROM: {
    line: "stroke-jcyan/45 [stroke-width:1]",
    hot: "stroke-jcyan/95 [stroke-width:1.7]",
    pin: "fill-jcyan",
    label: "extracted from",
    text: "text-jcyan",
  },
  DETECTED_IN: {
    line: "stroke-jamber/40 [stroke-width:1]",
    hot: "stroke-jamber/95 [stroke-width:1.7]",
    pin: "fill-jamber",
    label: "detected in",
    text: "text-jamber",
  },
  PRESERVED_AS: {
    line: "stroke-jteal/45 [stroke-width:1]",
    hot: "stroke-jteal/95 [stroke-width:1.7]",
    pin: "fill-jteal",
    label: "preserved as",
    text: "text-jteal",
  },
  ASSOCIATED_WITH: {
    line: "stroke-jmuted/35 [stroke-width:1] [stroke-dasharray:4_4]",
    hot: "stroke-jmuted/80 [stroke-width:1.5] [stroke-dasharray:4_4]",
    pin: "fill-jmuted",
    label: "associated with",
    text: "text-jmuted",
  },
};

/** Integrity+review of the evidence an indicator is preserved as, if any. */
function preservedEvidenceOf(
  graph: EvidenceGraph,
  edgeIndex: EdgeIndex,
  indicatorId: string,
): GraphNode | null {
  const eviId = edgeIndex.preservedAs.get(indicatorId);
  return eviId ? nodeById(graph, eviId) : null;
}

/** Catches query failures so the workspace keeps rendering around the board. */
class GraphBoundary extends Component<
  { children: ReactNode },
  { failed: boolean; attempt: number }
> {
  state = { failed: false, attempt: 0 };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return (
        <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 px-6 text-center">
          <AlertTriangle className="size-6 text-jred" />
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-jtext">
            Evidence graph unavailable
          </p>
          <p className="max-w-sm text-[12px] leading-relaxed text-jmuted">
            The backend did not return a graph for this investigation. The
            conversation and evidence locker below are unaffected and remain
            fully usable.
          </p>
          <button
            type="button"
            onClick={() =>
              this.setState({ failed: false, attempt: this.state.attempt + 1 })
            }
            className="flex items-center gap-1.5 border border-jcyan/50 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-jcyan transition-colors hover:bg-jcyan/10"
          >
            <RefreshCw className="size-3" /> Retry graph
          </button>
        </div>
      );
    }
    return (
      <div key={this.state.attempt} className="h-full min-h-0">
        {this.props.children}
      </div>
    );
  }
}

export function EvidenceBoard({
  caseId,
  selected,
  onSelect,
  onOpenEvidence,
  onOpenSource,
  defaultView = "board",
}: {
  caseId: string;
  selected: BoardSelection;
  onSelect: (sel: BoardSelection) => void;
  onOpenEvidence: (evidenceId: string) => void;
  /** Jump to the source message in the conversation. */
  onOpenSource: (messageId: string) => void;
  defaultView?: "board" | "list";
}) {
  return (
    <GraphBoundary>
      <GraphCanvas
        caseId={caseId}
        selected={selected}
        onSelect={onSelect}
        onOpenEvidence={onOpenEvidence}
        onOpenSource={onOpenSource}
        defaultView={defaultView}
      />
    </GraphBoundary>
  );
}

function GraphCanvas({
  caseId,
  selected,
  onSelect,
  onOpenEvidence,
  onOpenSource,
  defaultView,
}: {
  caseId: string;
  selected: BoardSelection;
  onSelect: (sel: BoardSelection) => void;
  onOpenEvidence: (evidenceId: string) => void;
  onOpenSource: (messageId: string) => void;
  defaultView: "board" | "list";
}) {
  const graph = useQuery(api.evidenceGraph.getByInvestigation, {
    investigationId: caseId,
  });
  const { state } = useJaal();
  const [view, setView] = useState<"board" | "list">(defaultView);
  const [offsets, setOffsets] = useState<Record<string, { x: number; y: number }>>(
    {},
  );
  const dragRef = useRef<{
    key: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);

  // Hooks run unconditionally; layouts are null until the graph resolves.
  const layout = useMemo(
    () => (graph ? computeGraphLayout(graph) : null),
    [graph],
  );
  const edgeIndex = useMemo(() => (graph ? indexEdges(graph) : null), [graph]);
  const neighborhood = useMemo(
    () => (graph ? neighborsOf(graph, selected) : null),
    [graph, selected],
  );

  // Preserve selection across reactive updates (ids are stable) — only drop
  // it when the record genuinely disappears (case reset, deleted evidence).
  useEffect(() => {
    if (!graph || !selected) return;
    if (selected.kind === "edge") {
      if (!edgeById(graph, selected.id)) onSelect(null);
    } else if (!nodeById(graph, selected.id)) {
      onSelect(null);
    }
  }, [graph, selected, onSelect]);

  // ---- Loading / offline state ------------------------------------------
  if (graph === undefined || layout === null || edgeIndex === null) {
    const offline = state.backendStatus === "offline";
    return (
      <div className="jaal-board flex h-full min-h-0 flex-col items-center justify-center gap-3 px-6 text-center">
        {offline ? (
          <>
            <WifiOff className="size-6 text-jamber" />
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-jamber">
              Backend offline
            </p>
            <p className="max-w-sm text-[12px] leading-relaxed text-jmuted">
              The evidence graph needs the live backend. The conversation,
              evidence locker and integrity tools keep working from the last
              synced state.
            </p>
          </>
        ) : (
          <>
            <span className="size-2 bg-jcyan jaal-pulse" />
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-jmuted">
              Querying evidence graph…
            </p>
          </>
        )}
      </div>
    );
  }

  // ---- Empty state (real contract: zero persisted records) ---------------
  if (graph.nodes.length === 0) {
    return (
      <div className="jaal-board flex h-full min-h-0 flex-col items-center justify-center gap-3 px-6 text-center">
        <span className="flex size-11 items-center justify-center border border-jborder/70 bg-jsurface">
          <Sparkles className="size-5 text-jmuted/60" />
        </span>
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-jtext">
          The board is clear
        </p>
        <p className="max-w-sm text-[12px] leading-relaxed text-jmuted">
          Nodes appear as the investigation produces them: every suspect and
          decoy message becomes a node, every detected tactic links to the
          message it was found in, every extracted indicator links to the
          message it came from, and each is paired with its preserved,
          hash-tracked evidence record. Send the next decoy line or advance the
          simulation to populate the board.
        </p>
      </div>
    );
  }

  const positioned: Record<string, BaseNode> = {};
  for (const [key, node] of Object.entries(layout.nodes)) {
    const off = offsets[key];
    positioned[key] = off
      ? { ...node, x: node.x + off.x, y: node.y + off.y }
      : node;
  }

  const dimNode = (id: string) =>
    neighborhood !== null && !neighborhood.nodes.has(id);
  const edgeHot = (id: string) =>
    neighborhood !== null && neighborhood.edges.has(id);
  const edgeDim = (id: string) =>
    neighborhood !== null && !neighborhood.edges.has(id);

  const activateNode = (node: BaseNode) => {
    const record = nodeById(graph, node.id);
    if (!record) return;
    onSelect({ kind: node.kind, id: node.id });
    if (node.kind === "message") {
      // recordId is the raw message _id — what the conversation scroll needs.
      onOpenSource(record.recordId);
    } else if (node.kind === "tactic") {
      const msgId = (record.data as GraphTacticData).messageId;
      if (msgId) onOpenSource(msgId);
    } else {
      // indicator + evidence both project one evidence row → detail drawer.
      onOpenEvidence(record.recordId);
    }
  };

  const handlePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    node: BaseNode,
  ) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const off = offsets[node.key] ?? { x: 0, y: 0 };
    dragRef.current = {
      key: node.key,
      startX: e.clientX,
      startY: e.clientY,
      origX: off.x,
      origY: off.y,
      moved: false,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
    d.moved = true;
    setOffsets((prev) => ({
      ...prev,
      [d.key]: { x: d.origX + dx, y: Math.max(-22, d.origY + dy) },
    }));
  };

  const handlePointerUp = (
    _e: React.PointerEvent<HTMLDivElement>,
    node: BaseNode,
  ) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d || d.moved) return;
    activateNode(node);
  };

  const counts = {
    message: graph.nodes.filter((n) => n.type === "message").length,
    indicator: graph.nodes.filter((n) => n.type === "indicator").length,
    tactic: graph.nodes.filter((n) => n.type === "tactic").length,
    evidence: graph.nodes.filter((n) => n.type === "evidence").length,
  };

  const toolbar = (
    <BoardToolbar
      view={view}
      setView={setView}
      onResetLayout={() => setOffsets({})}
      counts={counts}
      edgeCount={graph.edges.length}
      crowded={graph.nodes.length > 40}
    />
  );

  // ---- Table view (fallback for crowded graphs / small screens) ----------
  if (view === "list") {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {toolbar}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <table className="w-full border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-jsurface/95">
              <tr className="border-b border-jborder/60">
                {["Kind", "Node", "Detail", "Integrity / review", "Time"].map(
                  (h) => (
                    <th
                      key={h}
                      className="jaal-label !text-[8px] whitespace-nowrap px-3 py-1.5"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {[...graph.nodes]
                .sort((a, b) => a.timestamp - b.timestamp)
                .map((n) => (
                  <tr
                    key={n.id}
                    onClick={() =>
                      activateNode({ key: n.id, kind: n.type, id: n.id, x: 0, y: 0 })
                    }
                    className={cn(
                      "cursor-pointer border-b border-jborder/30 transition-colors hover:bg-jcyan/[0.04]",
                      selected?.kind !== "edge" &&
                        selected &&
                        selected.id === n.id &&
                        "bg-jcyan/[0.07]",
                    )}
                  >
                    <td className="whitespace-nowrap px-3 py-1.5">
                      <span
                        className={cn(
                          "border px-1.5 py-px font-mono text-[8px] uppercase tracking-wider",
                          n.type === "message"
                            ? "border-jred/40 text-jred/90"
                            : n.type === "indicator"
                              ? "border-jteal/50 text-jteal"
                              : n.type === "tactic"
                                ? "border-jamber/40 text-jamber"
                                : "border-jcyan/40 text-jcyan",
                        )}
                      >
                        {n.type}
                      </span>
                    </td>
                    <td className="max-w-[220px] truncate px-3 py-1.5 font-mono text-[10px] text-jtext">
                      {n.label}
                    </td>
                    <td className="max-w-[380px] truncate px-3 py-1.5 text-[11px] text-jmuted">
                      {nodeDetail(n)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 font-mono text-[9px] uppercase tracking-wider">
                      <NodeStatusTags
                        node={n}
                        preserved={
                          n.type === "indicator"
                            ? preservedEvidenceOf(graph, edgeIndex, n.id)
                            : null
                        }
                      />
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 font-mono text-[9px] text-jmuted/70">
                      {formatClock(n.timestamp)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>

          {/* Edges table — relationship basis stays readable in fallback view */}
          <p className="jaal-label border-t border-jborder/60 bg-jsurface/70 px-3 py-1.5">
            Relationships ({graph.edges.length})
          </p>
          <table className="w-full border-collapse text-left">
            <tbody>
              {graph.edges.map((e) => (
                <tr
                  key={e.id}
                  onClick={() => onSelect({ kind: "edge", id: e.id })}
                  className={cn(
                    "cursor-pointer border-b border-jborder/30 transition-colors hover:bg-jcyan/[0.04]",
                    selected?.kind === "edge" &&
                      selected.id === e.id &&
                      "bg-jcyan/[0.07]",
                  )}
                >
                  <td className="whitespace-nowrap px-3 py-1.5">
                    <span
                      className={cn(
                        "border border-jborder/60 px-1.5 py-px font-mono text-[8px] uppercase tracking-wider",
                        EDGE_TONE[e.type]?.text,
                      )}
                    >
                      {EDGE_TONE[e.type]?.label ?? e.type}
                    </span>
                  </td>
                  <td className="max-w-[300px] truncate px-3 py-1.5 font-mono text-[10px] text-jtext/90">
                    {nodeById(graph, e.from)?.label ?? e.from} →{" "}
                    {nodeById(graph, e.to)?.label ?? e.to}
                  </td>
                  <td className="px-3 py-1.5 text-[10px] leading-relaxed text-jmuted">
                    {e.basis}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ---- Graph view --------------------------------------------------------
  return (
    <div className="flex h-full min-h-0 flex-col">
      {toolbar}
      <div className="jaal-board relative min-h-0 flex-1 overflow-auto">
        <div
          className="relative"
          style={{ width: layout.width, height: layout.height }}
        >
          {/* Relationship strings — backend edges only */}
          <svg
            className="pointer-events-none absolute inset-0"
            width={layout.width}
            height={layout.height}
            aria-hidden
          >
            {graph.edges.map((e) => {
              const fromNode = positioned[e.from];
              const toNode = positioned[e.to];
              if (!fromNode || !toNode) return null;
              const leftToRight = fromNode.x <= toNode.x;
              const from = sourceAnchor(
                fromNode.kind,
                fromNode.x,
                fromNode.y,
                leftToRight ? "right" : "left",
              );
              const to = sourceAnchor(
                toNode.kind,
                toNode.x,
                toNode.y,
                leftToRight ? "left" : "right",
              );
              const tone = EDGE_TONE[e.type] ?? EDGE_TONE["ASSOCIATED_WITH"]!;
              const hot = edgeHot(e.id);
              return (
                <g key={e.id} opacity={edgeDim(e.id) ? 0.2 : 1}>
                  {/* Visible string */}
                  <path
                    d={threadPath(from, to)}
                    className={cn(
                      "fill-none transition-all duration-200",
                      hot ? tone.hot : tone.line,
                    )}
                  />
                  {/* Pins at both ends */}
                  <circle
                    cx={from.x}
                    cy={from.y}
                    r={2.4}
                    className={cn(tone.pin, hot ? "opacity-100" : "opacity-60")}
                  />
                  <circle
                    cx={to.x}
                    cy={to.y}
                    r={hot ? 3.4 : 2.8}
                    className={cn(tone.pin, hot ? "opacity-100" : "opacity-80")}
                  />
                  {/* Wide invisible hitbox so thin strings are clickable */}
                  <path
                    d={threadPath(from, to)}
                    onClick={() => onSelect({ kind: "edge", id: e.id })}
                    style={{ pointerEvents: "stroke", cursor: "pointer" }}
                    className="fill-none stroke-transparent [stroke-width:12]"
                  >
                    <title>
                      {EDGE_TONE[e.type]?.label ?? e.type} — {e.basis}
                    </title>
                  </path>
                </g>
              );
            })}
          </svg>

          {/* Nodes */}
          {Object.values(positioned).map((node) => {
            const record = nodeById(graph, node.id);
            if (!record) return null;
            const isSelected =
              selected?.kind !== "edge" && selected?.id === node.id;
            const tilt = isSelected
              ? "rotate(0deg)"
              : `rotate(${pinTilt(node.id)}deg)`;
            const baseStyle = {
              left: node.x,
              top: node.y,
              transform: tilt,
            };

            if (node.kind === "message") {
              const data = record.data as GraphMessageData;
              const isScam = data.sender === "scammer";
              return (
                <div
                  key={node.id}
                  title={data.content}
                  onPointerDown={(e) => handlePointerDown(e, node)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={(e) => handlePointerUp(e, node)}
                  style={{ ...baseStyle, width: NODE_SIZE.message.w }}
                  className={cn(
                    "jaal-board-node h-16 cursor-grab border bg-panel/95 px-2 py-1.5 transition-transform duration-200 active:cursor-grabbing",
                    isScam ? "border-jred/50" : "border-jcyan/50",
                    isSelected &&
                      "ring-1 ring-jcyan shadow-[0_0_12px_rgba(57,214,232,0.25)]",
                    dimNode(node.id) && "opacity-30",
                  )}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className={cn(
                        "font-mono text-[8px] uppercase tracking-widest",
                        isScam ? "text-jred" : "text-jcyan",
                      )}
                    >
                      MSG #{String(data.messageNumber).padStart(2, "0")} ·{" "}
                      {isScam ? "suspect" : "decoy"}
                    </span>
                    <span className="font-mono text-[8px] text-jmuted/60">
                      {formatClock(record.timestamp)}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-jtext/90">
                    {data.content}
                  </p>
                </div>
              );
            }

            if (node.kind === "tactic") {
              const data = record.data as GraphTacticData;
              return (
                <div
                  key={node.id}
                  title={data.explanation}
                  onPointerDown={(e) => handlePointerDown(e, node)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={(e) => handlePointerUp(e, node)}
                  style={{ ...baseStyle, width: NODE_SIZE.tactic.w }}
                  className={cn(
                    "jaal-board-node h-14 cursor-grab border border-jamber/45 bg-panel/95 px-2 py-1.5 transition-transform duration-200 active:cursor-grabbing",
                    isSelected &&
                      "ring-1 ring-jamber shadow-[0_0_12px_rgba(255,170,69,0.25)]",
                    dimNode(node.id) && "opacity-30",
                  )}
                >
                  <div className="flex items-center gap-1">
                    <ShieldAlert className="size-3 shrink-0 text-jamber" />
                    <span className="truncate text-[10px] font-semibold text-jamber">
                      {record.label}
                    </span>
                  </div>
                  <p className="mt-0.5 font-mono text-[8px] uppercase tracking-widest text-jmuted/70">
                    {edgeIndex.detectedIn.has(node.id)
                      ? "detected in message"
                      : "no source message"}
                  </p>
                </div>
              );
            }

            if (node.kind === "indicator") {
              const data = record.data as GraphIndicatorData;
              const Icon =
                EVIDENCE_ICON[data.evidenceType as EvidenceItem["type"]] ??
                Fingerprint;
              const accent = indicatorAccent(data.evidenceType);
              return (
                <div
                  key={node.id}
                  title={`${data.value} — ${data.extractionMethod}`}
                  onPointerDown={(e) => handlePointerDown(e, node)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={(e) => handlePointerUp(e, node)}
                  style={{ ...baseStyle, width: NODE_SIZE.indicator.w }}
                  className={cn(
                    "jaal-board-node h-[60px] cursor-grab border border-jteal/50 bg-panel/95 px-2 py-1.5 transition-transform duration-200 active:cursor-grabbing",
                    isSelected &&
                      "ring-1 ring-jteal shadow-[0_0_12px_rgba(27,143,145,0.3)]",
                    dimNode(node.id) && "opacity-30",
                  )}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="flex min-w-0 items-center gap-1">
                      <Icon
                        className="size-3 shrink-0"
                        style={{ color: accent }}
                      />
                      <span
                        className="truncate font-mono text-[8px] uppercase tracking-widest"
                        style={{ color: accent }}
                      >
                        {record.label}
                      </span>
                    </span>
                    <NodeStatusDots
                      data={
                        (
                          preservedEvidenceOf(graph, edgeIndex, node.id)?.data ??
                          null
                        ) as GraphEvidenceData | null
                      }
                    />
                  </div>
                  <p className="mt-1 truncate font-mono text-[10px] text-jtext">
                    {data.value}
                  </p>
                </div>
              );
            }

            // evidence — the preserved, hash-tracked artifact
            const data = record.data as GraphEvidenceData;
            return (
              <div
                key={node.id}
                title={`${data.label} — integrity ${integrityLabel(data.integrity.status)}`}
                onPointerDown={(e) => handlePointerDown(e, node)}
                onPointerMove={handlePointerMove}
                onPointerUp={(e) => handlePointerUp(e, node)}
                style={{ ...baseStyle, width: NODE_SIZE.evidence.w }}
                className={cn(
                  "jaal-board-node h-16 cursor-grab border border-jcyan/45 bg-panel/95 px-2 py-1.5 transition-transform duration-200 active:cursor-grabbing",
                  isSelected &&
                    "ring-1 ring-jcyan shadow-[0_0_12px_rgba(57,214,232,0.25)]",
                  data.integrity.status === "HASH_MISMATCH" && "border-jred/60",
                  dimNode(node.id) && "opacity-30",
                )}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="flex min-w-0 items-center gap-1">
                    <Wallet className="size-3 shrink-0 text-jcyan" />
                    <span className="truncate font-mono text-[8px] uppercase tracking-widest text-jcyan">
                      preserved evidence
                    </span>
                  </span>
                  <NodeStatusDots data={data} />
                </div>
                <p className="mt-1 truncate font-mono text-[10px] text-jtext">
                  {data.value}
                </p>
                <p
                  className="mt-0.5 font-mono text-[7.5px] uppercase tracking-widest"
                  style={{ color: integrityColor(data.integrity.status) }}
                >
                  sha-256 · {integrityLabel(data.integrity.status)}
                </p>
              </div>
            );
          })}
        </div>

        {/* Selection / edge-basis bar */}
        <SelectionBar
          graph={graph}
          selected={selected}
          onSelect={onSelect}
          onOpenEvidence={onOpenEvidence}
          onOpenSource={onOpenSource}
        />
      </div>
    </div>
  );
}

function nodeDetail(n: GraphNode): string {
  if (n.type === "message") return (n.data as GraphMessageData).content;
  if (n.type === "tactic") return (n.data as GraphTacticData).explanation;
  if (n.type === "indicator") return (n.data as GraphIndicatorData).value;
  return (n.data as GraphEvidenceData).value;
}

/** Integrity + review chips for the list view (indicator rows inherit their
 *  preserved evidence's status — both project the same row). */
function NodeStatusTags({
  node,
  preserved,
}: {
  node: GraphNode;
  preserved: GraphNode | null;
}) {
  if (node.type === "evidence" || (node.type === "indicator" && preserved)) {
    const d =
      node.type === "evidence"
        ? (node.data as GraphEvidenceData)
        : ((preserved!.data as GraphEvidenceData));
    return (
      <span className="flex items-center gap-1.5">
        <span
          className="flex items-center gap-1"
          style={{ color: integrityColor(d.integrity.status) }}
        >
          <span
            className="size-1.5"
            style={{ background: integrityColor(d.integrity.status) }}
          />
          {integrityLabel(d.integrity.status)}
        </span>
        {d.review.status && (
          <span
            className="border border-jborder/60 px-1 py-px"
            style={statusStyle(
              "review",
              reviewKey(d.review.status) ?? "needsreview",
            )}
          >
            {d.review.status === "needs_review" ? "review" : d.review.status}
          </span>
        )}
      </span>
    );
  }
  if (node.type === "indicator") {
    return <span className="text-jmuted/60">—</span>;
  }
  return null;
}

/** Compact integrity + review dots for board cards. */
function NodeStatusDots({ data }: { data: GraphEvidenceData | null }) {
  if (!data) return null;
  return (
    <span className="flex shrink-0 items-center gap-1">
      {data.review.status && (
        <span
          title={`analyst: ${data.review.status.replace("_", " ")}`}
          className="size-1.5"
          style={{ background: reviewDot(data.review.status) }}
        />
      )}
      <span
        title={`integrity: ${integrityLabel(data.integrity.status)}`}
        className="size-1.5"
        style={{ background: integrityColor(data.integrity.status) }}
      />
    </span>
  );
}

function BoardToolbar({
  view,
  setView,
  onResetLayout,
  counts,
  edgeCount,
  crowded,
}: {
  view: "board" | "list";
  setView: (v: "board" | "list") => void;
  onResetLayout: () => void;
  counts: { message: number; indicator: number; tactic: number; evidence: number };
  edgeCount: number;
  crowded?: boolean;
}) {
  const total =
    counts.message + counts.indicator + counts.tactic + counts.evidence;
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-jborder/60 bg-jsurface/80 px-2.5 py-1.5">
      <p className="jaal-label !text-jcyan">Evidence board</p>
      <span className="flex items-center gap-2 font-mono text-[8px] uppercase tracking-widest text-jmuted/70">
        <span className="flex items-center gap-1">
          <span className="size-1.5 bg-jred/80" /> messages ({counts.message})
        </span>
        <span className="flex items-center gap-1">
          <span className="size-1.5 bg-jteal" /> indicators ({counts.indicator})
        </span>
        <span className="flex items-center gap-1">
          <span className="size-1.5 bg-jamber" /> tactics ({counts.tactic})
        </span>
        <span className="flex items-center gap-1">
          <span className="size-1.5 bg-jcyan" /> evidence ({counts.evidence})
        </span>
        <span className="flex items-center gap-1">
          <Link2 className="size-2.5" /> {edgeCount} links
        </span>
      </span>
      {crowded && (
        <span className="font-mono text-[8px] uppercase tracking-widest text-jamber">
          crowded — table view recommended
        </span>
      )}
      <div className="ml-auto flex items-center gap-1">
        <span className="mr-1 hidden font-mono text-[8px] uppercase tracking-widest text-jmuted/60 sm:inline">
          {total} nodes · drag to arrange · click a string for its basis
        </span>
        <button
          type="button"
          onClick={onResetLayout}
          title="Re-run automatic layout"
          className="flex size-6 items-center justify-center border border-jborder/70 text-jmuted transition-colors hover:border-jcyan/60 hover:text-jcyan"
        >
          <RotateCcw className="size-3" />
        </button>
        <button
          type="button"
          onClick={() => setView(view === "board" ? "list" : "board")}
          title={view === "board" ? "Switch to table view" : "Switch to board view"}
          className="flex items-center gap-1 border border-jborder/70 px-1.5 py-1 font-mono text-[9px] uppercase tracking-wider text-jmuted transition-colors hover:border-jcyan/60 hover:text-jcyan"
        >
          {view === "board" ? (
            <>
              <List className="size-3" /> table
            </>
          ) : (
            <>
              <LayoutGrid className="size-3" /> board
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function SelectionBar({
  graph,
  selected,
  onSelect,
  onOpenEvidence,
  onOpenSource,
}: {
  graph: EvidenceGraph;
  selected: BoardSelection;
  onSelect: (sel: BoardSelection) => void;
  onOpenEvidence: (id: string) => void;
  onOpenSource: (messageId: string) => void;
}) {
  if (!selected) return null;

  // ---- Edge selected: show relationship basis + supporting source -------
  if (selected.kind === "edge") {
    const edge = edgeById(graph, selected.id);
    if (!edge) return null;
    const fromLabel = nodeById(graph, edge.from)?.label ?? edge.from;
    const toLabel = nodeById(graph, edge.to)?.label ?? edge.to;
    return (
      <div className="pointer-events-auto absolute bottom-2 left-1/2 flex max-w-[94%] -translate-x-1/2 flex-col gap-1 border border-jcyan/50 bg-panel/95 px-3 py-2 shadow-lg">
        <div className="flex items-center gap-2">
          <Link2 className="size-3 shrink-0 text-jcyan" />
          <span
            className={cn(
              "font-mono text-[10px] uppercase tracking-wider",
              EDGE_TONE[edge.type]?.text ?? "text-jcyan",
            )}
          >
            {EDGE_TONE[edge.type]?.label ?? edge.type}
          </span>
          <span className="min-w-0 truncate font-mono text-[10px] text-jtext/90">
            {fromLabel} → {toLabel}
          </span>
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="ml-auto shrink-0 border border-jborder/70 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-jmuted transition-colors hover:text-jtext"
          >
            clear
          </button>
        </div>
        <p className="max-w-xl text-[11px] leading-relaxed text-jmuted">
          {edge.basis}
        </p>
        <p className="font-mono text-[8px] uppercase tracking-widest text-jmuted/60">
          source record {edge.sourceRecordId}
        </p>
      </div>
    );
  }

  // ---- Node selected -----------------------------------------------------
  const node = nodeById(graph, selected.id);
  if (!node) return null;
  let action: { label: string; run: () => void; tone: string } | null = null;
  if (selected.kind === "message") {
    action = {
      label: "open source message",
      run: () => onOpenSource(node.recordId),
      tone: "border-jcyan/50 text-jcyan hover:bg-jcyan/10",
    };
  } else if (selected.kind === "tactic") {
    const msgId = (node.data as GraphTacticData).messageId;
    if (msgId) {
      action = {
        label: "open supporting message",
        run: () => onOpenSource(msgId),
        tone: "border-jcyan/50 text-jcyan hover:bg-jcyan/10",
      };
    }
  } else {
    action = {
      label: "open evidence detail",
      run: () => onOpenEvidence(node.recordId),
      tone: "border-jgreen/50 text-jgreen hover:bg-jgreen/10",
    };
  }

  return (
    <div className="pointer-events-auto absolute bottom-2 left-1/2 flex max-w-[92%] -translate-x-1/2 items-center gap-2 border border-jcyan/50 bg-panel/95 px-3 py-1.5 shadow-lg">
      <MapPin className="size-3 shrink-0 text-jcyan" />
      <span className="font-mono text-[9px] uppercase tracking-wider text-jmuted">
        {node.type}
      </span>
      <span className="min-w-0 truncate font-mono text-[10px] text-jtext/90">
        {node.label}
      </span>
      <span className="ml-1 flex shrink-0 items-center gap-1.5">
        {action && (
          <button
            type="button"
            onClick={action.run}
            className={cn(
              "flex items-center gap-1 border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider transition-colors",
              action.tone,
            )}
          >
            {selected.kind === "message" || selected.kind === "tactic" ? (
              <MessageSquareQuote className="size-2.5" />
            ) : (
              <Wallet className="size-2.5" />
            )}
            {action.label}
          </button>
        )}
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="border border-jborder/70 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-jmuted transition-colors hover:text-jtext"
        >
          clear
        </button>
      </span>
    </div>
  );
}
