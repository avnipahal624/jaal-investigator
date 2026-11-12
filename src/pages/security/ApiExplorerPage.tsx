import {
  ActionButton,
  Chip,
  ClassificationBadge,
  EmptyState,
  MethodBadge,
  PageHeader,
  Panel,
  SeverityBadge,
} from "@/components/security/ui";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import {
  CLASSIFICATION_META,
  formatTimestamp,
  relativeTime,
  type DastClassification,
} from "@/types/dast";
import { useQuery } from "convex/react";
import {
  ArrowRight,
  Braces,
  ChevronRight,
  Download,
  Filter,
  Globe2,
  Network,
  Search,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";

export default function ApiExplorerPage() {
  const endpoints = useQuery(api.dast.endpoints);
  const [search, setSearch] = useState("");
  const [method, setMethod] = useState("ALL");
  const [classification, setClassification] = useState("ALL");
  const [service, setService] = useState("ALL");
  const [selected, setSelected] = useState<Doc<"dastEndpoints"> | null>(null);

  const services = useMemo(
    () => Array.from(new Set((endpoints ?? []).map((endpoint) => endpoint.service))).sort(),
    [endpoints],
  );

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (endpoints ?? []).filter((endpoint) => {
      if (method !== "ALL" && endpoint.method !== method) return false;
      if (classification !== "ALL" && endpoint.classification !== classification) return false;
      if (service !== "ALL" && endpoint.service !== service) return false;
      if (
        query &&
        !`${endpoint.method} ${endpoint.path} ${endpoint.service} ${endpoint.businessFlow} ${endpoint.authType}`
          .toLowerCase()
          .includes(query)
      ) {
        return false;
      }
      return true;
    });
  }, [endpoints, search, method, classification, service]);

  function exportOpenApi() {
    if (!endpoints?.length) return;
    const paths: Record<string, Record<string, unknown>> = {};
    for (const endpoint of endpoints) {
      paths[endpoint.path] ??= {};
      paths[endpoint.path]![endpoint.method.toLowerCase()] = {
        summary: endpoint.description,
        operationId: `${endpoint.method.toLowerCase()}_${endpoint.path.replace(/[^a-zA-Z0-9]+/g, "_")}`,
        tags: [endpoint.service],
        parameters: (endpoint.parameters as Array<Record<string, unknown>>).map((parameter) => ({
          name: parameter.name,
          in: parameter.in,
          required: parameter.required,
          schema: { type: "string" },
          "x-jaal-inferred": parameter.inferred,
        })),
        responses: {
          "200": { description: "Observed response shape (inferred)" },
          "401": { description: "Authentication required" },
          "403": { description: "Authorization boundary" },
        },
        "x-jaal-classification": endpoint.classification,
        "x-jaal-confidence": endpoint.confidence,
        "x-jaal-documented": endpoint.documented,
        "x-jaal-last-observed": endpoint.lastObservedAt
          ? new Date(endpoint.lastObservedAt).toISOString()
          : null,
      };
    }
    const spec = {
      openapi: "3.1.0",
      info: {
        title: "JAAL inferred travel API inventory",
        version: "synthetic-lab-2026.11.1",
        description:
          "Generated from observed synthetic-lab endpoints. Inferred elements are marked; this is not authoritative documentation.",
      },
      servers: [{ url: "https://lab.jaal.internal" }],
      paths,
    };
    const blob = new Blob([JSON.stringify(spec, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "jaal-inferred-openapi.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const counts = useMemo(() => {
    const all = endpoints ?? [];
    return {
      total: all.length,
      active: all.filter((endpoint) => endpoint.classification === "ACTIVE").length,
      zombie: all.filter((endpoint) => endpoint.classification === "ZOMBIE").length,
      shadow: all.filter((endpoint) => endpoint.classification === "SHADOW").length,
    };
  }, [endpoints]);

  return (
    <>
      <PageHeader
        eyebrow="DISCOVERY / INFERRED INVENTORY"
        title="API explorer"
        description="Endpoints discovered by the reconnaissance agent — not imported from a supplied OpenAPI file. Parameters marked inferred are schema guesses and are never presented as authoritative."
        actions={
          <>
            <ActionButton variant="ghost" onClick={exportOpenApi} disabled={!endpoints?.length}>
              <Download className="size-3" /> Export OpenAPI
            </ActionButton>
            <Link to="/security/graph">
              <ActionButton>
                <Network className="size-3" /> Knowledge graph
              </ActionButton>
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <FilterStat label="Discovered" value={counts.total} />
        <FilterStat label="Active" value={counts.active} tone="text-[#35C98A]" />
        <FilterStat label="Zombie" value={counts.zombie} tone="text-[#F59E55]" />
        <FilterStat label="Shadow" value={counts.shadow} tone="text-[#B383F5]" />
      </div>

      <div className="mt-4 border border-[#1b2a3e] bg-[#101827]">
        <div className="flex flex-col gap-2 border-b border-[#1b2a3e] p-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#526a81]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Filter by path, service, flow or auth…"
              className="h-8 w-full border border-[#24364c] bg-[#0b1421] pl-8 pr-3 text-[11px] text-[#d7e2ee] placeholder:text-[#4d647a] focus:border-[#27C7B8]/60 focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={method} onChange={setMethod} options={["ALL", "GET", "POST"]} label="Method" />
            <Select
              value={classification}
              onChange={setClassification}
              options={["ALL", "ACTIVE", "ZOMBIE", "SHADOW", "UNKNOWN"]}
              label="Class"
            />
            <Select
              value={service}
              onChange={setService}
              options={["ALL", ...services]}
              label="Service"
            />
            {(search || method !== "ALL" || classification !== "ALL" || service !== "ALL") && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setMethod("ALL");
                  setClassification("ALL");
                  setService("ALL");
                }}
                className="inline-flex items-center gap-1 font-mono text-[8px] uppercase tracking-[0.1em] text-[#91A3BB] hover:text-[#F3F6FC]"
              >
                <X className="size-3" /> Clear
              </button>
            )}
          </div>
        </div>

        {!endpoints || endpoints.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<Braces className="size-5" />}
              title="No endpoint inventory yet"
              body="Run the deployment investigation. The reconnaissance agent probes the authorized synthetic lab by role, records responses and builds this inventory itself."
              action={
                <Link to="/security/investigations">
                  <ActionButton>
                    Start investigation <ArrowRight className="size-3" />
                  </ActionButton>
                </Link>
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left">
              <thead>
                <tr className="border-b border-[#1b2a3e] bg-[#0c1521]">
                  {[
                    "Method",
                    "Path",
                    "Service",
                    "Auth",
                    "Class",
                    "Risk",
                    "Confidence",
                    "Last observed",
                    "Findings",
                  ].map((header) => (
                    <th
                      key={header}
                      className="whitespace-nowrap px-3 py-2 font-mono text-[8px] uppercase tracking-[0.12em] text-[#60788f]"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((endpoint) => (
                  <tr
                    key={endpoint._id}
                    onClick={() => setSelected(endpoint)}
                    className={cn(
                      "cursor-pointer border-b border-[#162436] transition-colors last:border-b-0 hover:bg-[#121d2d]",
                      selected?._id === endpoint._id && "bg-[#12202f]",
                    )}
                  >
                    <td className="px-3 py-2">
                      <MethodBadge method={endpoint.method} />
                    </td>
                    <td className="max-w-[300px] px-3 py-2 font-mono text-[10px] text-[#d7e2ee]">
                      <span className="block truncate">{endpoint.path}</span>
                      <span className="mt-0.5 block text-[8px] text-[#526a81]">
                        {endpoint.businessFlow}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-[9px] text-[#91A3BB]">
                      {endpoint.service}
                    </td>
                    <td className="px-3 py-2 font-mono text-[8px] uppercase tracking-[0.06em] text-[#7890a8]">
                      {endpoint.authType.replaceAll("_", " ")}
                    </td>
                    <td className="px-3 py-2">
                      <ClassificationBadge value={endpoint.classification} />
                    </td>
                    <td className="px-3 py-2">
                      <SeverityBadge severity={endpoint.riskLevel} />
                    </td>
                    <td className="px-3 py-2 font-mono text-[9px] text-[#91A3BB]">
                      {(endpoint.confidence * 100).toFixed(0)}%
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-[8px] text-[#526a81]">
                      {relativeTime(endpoint.lastObservedAt)}
                    </td>
                    <td className="px-3 py-2">
                      {endpoint.findingsCount > 0 ? (
                        <span className="inline-flex items-center gap-1 font-mono text-[9px] text-[#F05D67]">
                          <ShieldAlert className="size-3" /> {endpoint.findingsCount}
                        </span>
                      ) : (
                        <span className="font-mono text-[9px] text-[#3f566d]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && (
              <p className="p-6 text-center text-[11px] text-[#60788f]">
                No endpoints match the current filters.
              </p>
            )}
          </div>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setSelected(null)}
            aria-hidden
          />
          <aside className="relative h-full w-full max-w-[440px] overflow-y-auto border-l border-[#24364c] bg-[#0b1421]">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[#1b2a3e] bg-[#0b1421]/95 p-4 backdrop-blur">
              <div>
                <div className="flex items-center gap-2">
                  <MethodBadge method={selected.method} />
                  <ClassificationBadge value={selected.classification} />
                </div>
                <p className="mt-2 break-all font-mono text-[11px] text-[#d7e2ee]">
                  {selected.path}
                </p>
                <p className="mt-1 text-[9px] text-[#60788f]">{selected.description}</p>
              </div>
              <button
                type="button"
                aria-label="Close endpoint details"
                onClick={() => setSelected(null)}
                className="text-[#7890a8] hover:text-[#F3F6FC]"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="space-y-4 p-4">
              <div className="grid grid-cols-2 gap-3">
                <Detail label="Host" value={selected.host} />
                <Detail label="Service" value={selected.service} />
                <Detail label="Auth contract" value={selected.authType.replaceAll("_", " ")} />
                <Detail label="Business flow" value={selected.businessFlow} />
                <Detail label="Risk" value={selected.riskLevel} />
                <Detail label="Confidence" value={`${(selected.confidence * 100).toFixed(0)}%`} />
                <Detail label="Documented" value={selected.documented ? "Yes" : "No — observed"} />
                <Detail label="Owner" value={selected.ownerTeam} />
                <Detail label="Last observed" value={formatTimestamp(selected.lastObservedAt)} />
                <Detail label="Last success" value={formatTimestamp(selected.lastSuccessAt)} />
              </div>

              <div className="border border-[#1e3145] bg-[#0d1623] p-3">
                <p className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#60788f]">
                  Classification evidence
                </p>
                <p className="mt-1.5 text-[10px] leading-relaxed text-[#91A3BB]">
                  {CLASSIFICATION_META[selected.classification as DastClassification]?.description}
                </p>
                <p className="mt-2 font-mono text-[8px] uppercase tracking-[0.08em] text-[#526a81]">
                  Source: {selected.source} · last legitimate traffic{" "}
                  {relativeTime(selected.lastLegitimateTrafficAt)}
                </p>
              </div>

              <div>
                <p className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#60788f]">
                  Parameters
                </p>
                <div className="mt-2 space-y-1">
                  {(selected.parameters as Array<Record<string, unknown>>).length === 0 ? (
                    <p className="text-[10px] text-[#526a81]">No parameters observed.</p>
                  ) : (
                    (selected.parameters as Array<Record<string, unknown>>).map((parameter) => (
                      <div
                        key={String(parameter.name)}
                        className="flex items-center justify-between border border-[#1e3145] bg-[#0b1421] px-2.5 py-1.5"
                      >
                        <span className="font-mono text-[9px] text-[#c7d3e2]">
                          {String(parameter.name)}
                        </span>
                        <span className="font-mono text-[8px] uppercase tracking-[0.08em] text-[#60788f]">
                          {String(parameter.in)}
                          {parameter.inferred ? " · inferred" : ""}
                          {parameter.required ? " · required" : ""}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div>
                <p className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#60788f]">
                  Observed roles
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {selected.observedRoles.map((role) => (
                    <Chip key={role} tone="neutral">
                      {role.replaceAll("_", " ")}
                    </Chip>
                  ))}
                </div>
              </div>

              <div className="border border-[#1e3145] bg-[#0b1421] p-3">
                <p className="flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.12em] text-[#35C98A]">
                  <ShieldCheck className="size-3" /> Inferred, not authoritative
                </p>
                <p className="mt-1.5 text-[9px] leading-relaxed text-[#7890a8]">
                  Request and response schema details are inferred from synthetic-lab
                  traffic. Use the generated OpenAPI only as an inventory aid.
                </p>
              </div>

              <Link
                to="/security/graph"
                className="flex items-center justify-between border border-[#24364c] px-3 py-2 font-mono text-[9px] uppercase tracking-[0.1em] text-[#27C7B8]"
              >
                View in knowledge graph <ChevronRight className="size-3" />
              </Link>
            </div>
          </aside>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3 text-[9px] text-[#526a81]">
        <span className="flex items-center gap-1.5">
          <Globe2 className="size-3" /> Exact host: lab.jaal.internal
        </span>
        <span className="flex items-center gap-1.5">
          <Filter className="size-3" /> Zombie window: 30 days
        </span>
        <span className="flex items-center gap-1.5">
          <Braces className="size-3" /> Inferred schema elements flagged in OpenAPI
        </span>
      </div>
    </>
  );
}

function FilterStat({
  label,
  value,
  tone = "text-[#F3F6FC]",
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="border border-[#1b2a3e] bg-[#101827] px-3 py-2.5">
      <p className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#60788f]">{label}</p>
      <p className={cn("mt-1 text-lg font-semibold tabular-nums", tone)}>{value}</p>
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  label: string;
}) {
  return (
    <label className="flex items-center gap-1.5 border border-[#24364c] bg-[#0b1421] px-2 py-1">
      <span className="font-mono text-[7px] uppercase tracking-[0.1em] text-[#526a81]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="bg-transparent font-mono text-[9px] text-[#c7d3e2] focus:outline-none"
      >
        {options.map((option) => (
          <option key={option} value={option} className="bg-[#101827]">
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#526a81]">{label}</p>
      <p className="mt-1 text-[10px] leading-relaxed text-[#c7d3e2]">{value}</p>
    </div>
  );
}
