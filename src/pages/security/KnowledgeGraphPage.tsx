import {
  Chip,
  ClassificationBadge,
  EmptyState,
  MethodBadge,
  PageHeader,
  Panel,
  SeverityBadge,
} from "@/components/security/ui";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import {
  CLASSIFICATION_META,
  relativeTime,
  type DastClassification,
} from "@/types/dast";
import { useQuery } from "convex/react";
import {
  Boxes,
  Braces,
  GitBranch,
  Layers3,
  Network,
  Search,
  ShieldAlert,
  Waypoints,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";

type GraphNode = {
  id: string;
  label: string;
  type: string;
  classification?: string;
  risk?: string;
  severity?: string;
};

type GraphEdge = { source: string; target: string; label: string };

const CLASS_COLORS: Record<string, string> = {
  ACTIVE: "#34D399",
  ZOMBIE: "#F5B942",
  SHADOW: "#B383F5",
  UNKNOWN: "#9FB3C8",
};

export default function KnowledgeGraphPage() {
  const graph = useQuery(api.dast.graph);
  const endpoints = useQuery(api.dast.endpoints);
  const [classification, setClassification] = useState("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const visibleNodes = useMemo(() => {
    if (!graph) return [];
    return (graph.nodes as GraphNode[]).filter((node) => {
      if (node.type !== "endpoint") return true;
      if (classification !== "ALL" && node.classification !== classification) return false;
      if (query.trim() && !node.label.toLowerCase().includes(query.trim().toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [graph, classification, query]);

  const positions = useMemo(() => {
    const width = 1220;
    const height = 760;
    const columns: Record<string, number> = {
      application: 105,
      service: 340,
      endpoint: 650,
      flow: 980,
      finding: 1140,
    };
    const groups: Record<string, GraphNode[]> = {};
    for (const node of visibleNodes) {
      (groups[node.type] ??= []).push(node);
    }
    const map = new Map<string, { x: number; y: number; node: GraphNode }>();
    for (const [type, nodes] of Object.entries(groups)) {
      const usable = height - 150;
      const gap = nodes.length > 1 ? usable / (nodes.length - 1) : 0;
      nodes.forEach((node, index) => {
        map.set(node.id, {
          x: columns[type] ?? 600,
          y: nodes.length > 1 ? 80 + index * gap : height / 2,
          node,
        });
      });
    }
    return { map, width, height };
  }, [visibleNodes]);

  const visibleIds = new Set(positions.map.keys());
  const edges = ((graph?.edges ?? []) as GraphEdge[]).filter(
    (edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target),
  );
  const selected = selectedId ? positions.map.get(selectedId)?.node ?? null : null;
  const selectedEndpoint =
    selected?.type === "endpoint"
      ? (endpoints ?? []).find((endpoint) => `endpoint:${endpoint._id}` === selected.id)
      : null;

  const connected = useMemo(() => {
    if (!selectedId) return new Set<string>();
    const ids = new Set<string>([selectedId]);
    for (const edge of edges) {
      if (edge.source === selectedId) ids.add(edge.target);
      if (edge.target === selectedId) ids.add(edge.source);
    }
    return ids;
  }, [selectedId, edges]);

  if (graph === undefined) {
    return <div className="py-16 text-center text-[11px] text-[#9FB3C8]">Building graph…</div>;
  }

  if (!graph.nodes.length) {
    return (
      <>
        <PageHeader
          eyebrow="UNDERSTAND / RELATIONSHIPS"
          title="API knowledge graph"
          description="Applications, services, endpoints, business flows and verified findings as a connected inventory."
        />
        <EmptyState
          icon={<Waypoints className="size-5" />}
          title="The graph is empty"
          body="Run the deployment investigation to discover endpoints. Graph nodes are derived from inventory and findings, never hand-authored."
          action={
            <Link
              to="/security/investigations"
              className="inline-flex h-8 items-center gap-1.5 border border-[#2DD4BF]/50 bg-[#2DD4BF]/10 px-3 font-mono text-[9px] uppercase tracking-[0.12em] text-[#2DD4BF]"
            >
              Start investigation
            </Link>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="UNDERSTAND / RELATIONSHIPS"
        title="API knowledge graph"
        description="A live relationship map built from discovered endpoints, their services, business flows and verified findings. Click any node to inspect its actual metadata."
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            {["ALL", "ACTIVE", "ZOMBIE", "SHADOW"].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setClassification(value)}
                className={cn(
                  "border px-2 py-1 font-mono text-[8px] uppercase tracking-[0.1em]",
                  classification === value
                    ? "border-[#2DD4BF]/50 bg-[#2DD4BF]/10 text-[#2DD4BF]"
                    : "border-[#2A3B55] text-[#9FB3C8] hover:text-[#E5EDF5]",
                )}
              >
                {value}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <Panel className="min-w-0" flush>
          <div className="flex flex-col gap-2 border-b border-[#24344F] p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#6B8199]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find an endpoint…"
                className="h-7 w-full border border-[#2A3B55] bg-[#0F1B2D] pl-8 pr-3 text-[10px] text-[#d7e2ee] placeholder:text-[#4d647a] focus:border-[#2DD4BF]/60 focus:outline-none"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3 font-mono text-[8px] uppercase tracking-[0.08em] text-[#7E93A8]">
              <Legend color="#2DD4BF" label="Application" />
              <Legend color="#64B5F6" label="Service" />
              <Legend color="#34D399" label="Endpoint" />
              <Legend color="#B383F5" label="Flow" />
              <Legend color="#F87171" label="Finding" />
            </div>
          </div>
          <div className="relative overflow-x-auto bg-[#080f1a]">
            <svg
              viewBox={`0 0 ${positions.width} ${positions.height}`}
              className="h-[620px] w-full min-w-[1000px]"
              role="img"
              aria-label="JAAL API knowledge graph"
            >
              <defs>
                <pattern id="graphGrid" width="34" height="34" patternUnits="userSpaceOnUse">
                  <path d="M 34 0 L 0 0 0 34" fill="none" stroke="#142233" strokeWidth="1" />
                </pattern>
                <marker
                  id="arrow"
                  markerWidth="6"
                  markerHeight="6"
                  refX="5"
                  refY="3"
                  orient="auto"
                >
                  <path d="M0,0 L0,6 L5,3 z" fill="#2b4259" />
                </marker>
              </defs>
              <rect width={positions.width} height={positions.height} fill="url(#graphGrid)" />
              {edges.map((edge, index) => {
                const from = positions.map.get(edge.source);
                const to = positions.map.get(edge.target);
                if (!from || !to) return null;
                const active =
                  selectedId != null &&
                  (edge.source === selectedId || edge.target === selectedId);
                const dim = selectedId != null && !active;
                const curve = Math.max(40, Math.abs(to.x - from.x) * 0.45);
                return (
                  <path
                    key={`${edge.source}-${edge.target}-${index}`}
                    d={`M ${from.x + 72} ${from.y} C ${from.x + 72 + curve} ${from.y}, ${to.x - 72 - curve} ${to.y}, ${to.x - 72} ${to.y}`}
                    fill="none"
                    stroke={active ? "#2DD4BF" : "#263c52"}
                    strokeWidth={active ? 1.6 : 1}
                    strokeOpacity={dim ? 0.15 : active ? 0.9 : 0.55}
                    strokeDasharray={edge.label === "AFFECTED_BY" ? "4 3" : undefined}
                    markerEnd="url(#arrow)"
                  />
                );
              })}
              {[...positions.map.values()].map(({ node, x, y }) => {
                const isSelected = selectedId === node.id;
                const dim = selectedId != null && !connected.has(node.id);
                if (node.type === "application") {
                  return (
                    <g
                      key={node.id}
                      opacity={dim ? 0.3 : 1}
                      onClick={() => setSelectedId(node.id)}
                      className="cursor-pointer"
                    >
                      <rect
                        x={x - 62}
                        y={y - 32}
                        width="124"
                        height="64"
                        fill="#0e2430"
                        stroke={isSelected ? "#2DD4BF" : "#2b6a6f"}
                        strokeWidth={isSelected ? 2 : 1}
                      />
                      <text
                        x={x}
                        y={y - 5}
                        textAnchor="middle"
                        fill="#5EEAD4"
                        fontSize="9"
                        fontFamily="monospace"
                        letterSpacing="1.4"
                      >
                        SYNTHETIC
                      </text>
                      <text
                        x={x}
                        y={y + 9}
                        textAnchor="middle"
                        fill="#E5EDF5"
                        fontSize="11"
                        fontWeight="600"
                      >
                        Travel Lab
                      </text>
                      <text
                        x={x}
                        y={y + 23}
                        textAnchor="middle"
                        fill="#7E93A8"
                        fontSize="7"
                        fontFamily="monospace"
                      >
                        APPLICATION
                      </text>
                    </g>
                  );
                }
                if (node.type === "endpoint") {
                  const color = CLASS_COLORS[node.classification ?? "UNKNOWN"];
                  return (
                    <g
                      key={node.id}
                      opacity={dim ? 0.22 : 1}
                      onClick={() => setSelectedId(node.id)}
                      className="cursor-pointer"
                    >
                      <rect
                        x={x - 70}
                        y={y - 12}
                        width="140"
                        height="24"
                        fill={isSelected ? "#122a38" : "#0d1a2a"}
                        stroke={isSelected ? color : "#243b51"}
                        strokeWidth={isSelected ? 1.8 : 1}
                      />
                      <circle cx={x - 58} cy={y} r="3" fill={color} />
                      <text
                        x={x - 50}
                        y={y + 3}
                        fill="#C7D5E5"
                        fontSize="8"
                        fontFamily="monospace"
                      >
                        {node.label.length > 25 ? `${node.label.slice(0, 24)}…` : node.label}
                      </text>
                    </g>
                  );
                }
                if (node.type === "service") {
                  return (
                    <g
                      key={node.id}
                      opacity={dim ? 0.25 : 1}
                      onClick={() => setSelectedId(node.id)}
                      className="cursor-pointer"
                    >
                      <rect
                        x={x - 62}
                        y={y - 14}
                        width="124"
                        height="28"
                        fill="#0c1726"
                        stroke={isSelected ? "#64B5F6" : "#2c415a"}
                      />
                      <text
                        x={x - 52}
                        y={y + 3}
                        fill="#9fc7ef"
                        fontSize="8"
                        fontFamily="monospace"
                      >
                        {node.label}
                      </text>
                    </g>
                  );
                }
                if (node.type === "flow") {
                  return (
                    <g
                      key={node.id}
                      opacity={dim ? 0.25 : 1}
                      onClick={() => setSelectedId(node.id)}
                      className="cursor-pointer"
                    >
                      <rect
                        x={x - 66}
                        y={y - 16}
                        width="132"
                        height="32"
                        fill="#17122a"
                        stroke={isSelected ? "#B383F5" : "#3d2d5c"}
                        strokeDasharray="3 2"
                      />
                      <text
                        x={x - 56}
                        y={y + 3}
                        fill="#c7b2ef"
                        fontSize="8"
                        fontFamily="monospace"
                      >
                        {node.label.length > 22 ? `${node.label.slice(0, 21)}…` : node.label}
                      </text>
                    </g>
                  );
                }
                return (
                  <g
                    key={node.id}
                    opacity={dim ? 0.25 : 1}
                    onClick={() => setSelectedId(node.id)}
                    className="cursor-pointer"
                  >
                    <circle cx={x - 38} cy={y} r="7" fill="#2a1119" stroke="#F87171" />
                    <text
                      x={x - 24}
                      y={y + 3}
                      fill="#F87171"
                      fontSize="8"
                      fontFamily="monospace"
                    >
                      {node.label}
                    </text>
                  </g>
                );
              })}
            </svg>
            {visibleNodes.length === 0 && (
              <p className="absolute inset-0 flex items-center justify-center text-[11px] text-[#7E93A8]">
                No nodes match the current filter.
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#24344F] px-3 py-2 font-mono text-[8px] uppercase tracking-[0.08em] text-[#6B8199]">
            <span>
              {visibleNodes.length} nodes · {edges.length} edges
            </span>
            <span>Derived from observed inventory · inferred relationships marked</span>
          </div>
        </Panel>

        <div className="space-y-3">
          {selected ? (
            <Panel flush>
              <div className="flex items-start justify-between gap-2 border-b border-[#24344F] p-3">
                <div>
                  <p className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#7E93A8]">
                    {selected.type}
                  </p>
                  <p className="mt-1 break-all text-[12px] font-medium text-[#d7e2ee]">
                    {selected.label}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Clear selection"
                  onClick={() => setSelectedId(null)}
                  className="text-[#7E93A8] hover:text-[#E5EDF5]"
                >
                  <X className="size-3.5" />
                </button>
              </div>
              <div className="p-3">
                {selectedEndpoint ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <MethodBadge method={selectedEndpoint.method} />
                      <ClassificationBadge value={selectedEndpoint.classification} />
                      <SeverityBadge severity={selectedEndpoint.riskLevel} />
                    </div>
                    <p className="text-[10px] leading-relaxed text-[#9FB3C8]">
                      {selectedEndpoint.description}
                    </p>
                    <div className="grid grid-cols-2 gap-2 border-t border-[#24344F] pt-3 text-[9px]">
                      <Info label="Service" value={selectedEndpoint.service} />
                      <Info label="Flow" value={selectedEndpoint.businessFlow} />
                      <Info label="Auth" value={selectedEndpoint.authType.replaceAll("_", " ")} />
                      <Info label="Confidence" value={`${(selectedEndpoint.confidence * 100).toFixed(0)}%`} />
                      <Info label="Last seen" value={relativeTime(selectedEndpoint.lastObservedAt)} />
                      <Info label="Findings" value={String(selectedEndpoint.findingsCount)} />
                    </div>
                    <div className="border border-[#2A3B55] bg-[#0F1B2D] p-2.5">
                      <p className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#6B8199]">
                        Why this classification
                      </p>
                      <p className="mt-1 text-[9px] leading-relaxed text-[#9FB3C8]">
                        {CLASSIFICATION_META[selectedEndpoint.classification as DastClassification]
                          ?.description}
                      </p>
                    </div>
                    <Link
                      to="/security/apis"
                      className="flex items-center justify-between border border-[#2A3B55] px-2.5 py-2 font-mono text-[8px] uppercase tracking-[0.1em] text-[#2DD4BF]"
                    >
                      Open full endpoint record <Braces className="size-3" />
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-2 text-[10px] leading-relaxed text-[#9FB3C8]">
                    <p>
                      This node is part of the inventory graph. Select an endpoint to see
                      parameters, roles, traffic and findings.
                    </p>
                    <div className="grid grid-cols-2 gap-2 border-t border-[#24344F] pt-3">
                      <Info label="Node type" value={selected.type} />
                      <Info
                        label="Connections"
                        value={String(
                          edges.filter(
                            (edge) => edge.source === selected.id || edge.target === selected.id,
                          ).length,
                        )}
                      />
                    </div>
                  </div>
                )}
              </div>
            </Panel>
          ) : (
            <Panel title="Graph metadata" eyebrow="How to read this">
              <div className="space-y-3 text-[10px] leading-relaxed text-[#9FB3C8]">
                <div className="flex items-start gap-2">
                  <Boxes className="mt-0.5 size-3.5 shrink-0 text-[#2DD4BF]" />
                  <p>Application → service → endpoint relationships come from observed traffic.</p>
                </div>
                <div className="flex items-start gap-2">
                  <Layers3 className="mt-0.5 size-3.5 shrink-0 text-[#B383F5]" />
                  <p>Endpoint → business flow edges show which travel workflow is affected.</p>
                </div>
                <div className="flex items-start gap-2">
                  <GitBranch className="mt-0.5 size-3.5 shrink-0 text-[#64B5F6]" />
                  <p>Deployment changes are recorded on the endpoint and investigation records.</p>
                </div>
                <div className="flex items-start gap-2">
                  <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-[#F87171]" />
                  <p>Finding nodes only appear after deterministic verification and SHA-256 evidence.</p>
                </div>
                <p className="border-t border-[#24344F] pt-3 font-mono text-[8px] uppercase tracking-[0.1em] text-[#6B8199]">
                  Click a node to inspect it.
                </p>
              </div>
            </Panel>
          )}

          <div className="border border-[#24344F] bg-[#0F1B2D] p-3">
            <p className="flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.12em] text-[#2DD4BF]">
              <Network className="size-3" /> Inventory summary
            </p>
            <div className="mt-2 space-y-1.5">
              {["ACTIVE", "ZOMBIE", "SHADOW", "UNKNOWN"].map((key) => {
                const count = (graph.nodes as GraphNode[]).filter(
                  (node) => node.type === "endpoint" && node.classification === key,
                ).length;
                return (
                  <div key={key} className="flex items-center justify-between text-[9px]">
                    <span className="flex items-center gap-1.5 text-[#9FB3C8]">
                      <span
                        className="size-1.5 rounded-full"
                        style={{ backgroundColor: CLASS_COLORS[key] }}
                      />
                      {key}
                    </span>
                    <span className="font-mono text-[#C7D5E5]">{count}</span>
                  </div>
                );
              })}
            </div>
            <Chip tone="violet" className="mt-3">
              Synthetic lab
            </Chip>
          </div>
        </div>
      </div>
    </>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="size-1.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[8px] uppercase tracking-[0.08em] text-[#6B8199]">{label}</p>
      <p className="mt-0.5 text-[9px] text-[#C7D5E5]">{value}</p>
    </div>
  );
}
