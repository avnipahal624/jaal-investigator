import {
  ActionButton,
  Chip,
  ConfirmDialog,
  LoadingState,
  PageHeader,
  Panel,
  Stat,
} from "@/components/security/ui";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/types/dast";
import { useMutation, useQuery } from "convex/react";
import {
  Activity,
  ArrowRight,
  Bot,
  Boxes,
  Braces,
  Crosshair,
  FileText,
  Fingerprint,
  GitBranch,
  Layers,
  Network,
  Play,
  Radar,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: "#F87171",
  HIGH: "#F5B942",
  MEDIUM: "#F5B942",
  LOW: "#9FB3C8",
  INFORMATIONAL: "#9FB3C8",
};

const STAGES = [
  "Detect",
  "Discover",
  "Understand",
  "Plan",
  "Execute",
  "Verify",
  "Report",
  "Retest",
];

export default function OverviewPage() {
  const data = useQuery(api.dast.overview);
  const bootstrap = useQuery(api.dast.bootstrap);
  const seed = useMutation(api.dast.seedLab);
  const trigger = useMutation(api.dast.triggerDeployment);
  const reset = useMutation(api.dast.resetLab);
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [demoOpen, setDemoOpen] = useState(true);
  const [confirmReset, setConfirmReset] = useState(false);

  const severityData = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.severityCounts)
      .map(([name, value]) => ({ name, value: Number(value) }))
      .filter((row) => row.value > 0);
  }, [data]);

  const inventory = data?.inventory ?? { active: 0, zombie: 0, shadow: 0, unknown: 0 };

  async function initialize() {
    setBusy("seed");
    try {
      await seed();
      toast.success("Synthetic travel lab initialized");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not initialize lab");
    } finally {
      setBusy(null);
    }
  }

  async function runInvestigation() {
    setBusy("run");
    try {
      if (!bootstrap?.application) await seed();
      const result = await trigger();
      if (result?.investigationId) {
        navigate(`/security/investigations/${result.investigationId}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not run investigation");
    } finally {
      setBusy(null);
    }
  }

  async function resetAll() {
    setBusy("reset");
    try {
      await reset();
      toast.success("Synthetic DAST workspace reset");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setBusy(null);
    }
  }

  if (!bootstrap) {
    return <LoadingState label="Loading security operations workspace" />;
  }

  if (!data) {
    return (
      <>
        <PageHeader
          eyebrow="JAAL / SECURITY OPERATIONS"
          title="The agentic security investigation engine"
          description="Detect, discover, understand, plan, execute safely, verify, prioritize, report and retest — against an isolated travel security lab built for this demonstration."
          actions={
            <ActionButton onClick={initialize} disabled={busy === "seed"}>
              <Sparkles className="size-3" />
              {busy === "seed" ? "Initializing…" : "Initialize synthetic lab"}
            </ActionButton>
          }
        />
        <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
          <Panel className="overflow-hidden" flush>
            <div className="relative p-6 sm:p-8">
              <div className="absolute right-0 top-0 size-56 bg-[radial-gradient(circle_at_top_right,rgba(39,199,184,0.15),transparent_65%)]" />
              <div className="relative">
                <Chip tone="violet" dot>
                  Synthetic lab · no external targets
                </Chip>
                <h2 className="mt-4 max-w-xl text-2xl font-semibold leading-tight tracking-[-0.02em]">
                  One deployment. Three ways an agency boundary can break.
                </h2>
                <p className="mt-3 max-w-xl text-[12px] leading-relaxed text-[#9FB3C8]">
                  JAAL will diff a release, discover the travel APIs itself, probe them
                  with synthetic roles, plan business-logic tests, stop for approval,
                  reproduce violations with a control request, seal SHA-256 evidence and
                  retest after the fix.
                </p>
                <div className="mt-6 grid gap-2 sm:grid-cols-4">
                  {[
                    ["12", "lab endpoints"],
                    ["4", "synthetic roles"],
                    ["6", "attack modules"],
                    ["0", "external hosts"],
                  ].map(([value, label]) => (
                    <div key={label} className="border border-[#2A3B55] bg-[#0F1B2D] px-3 py-2.5">
                      <p className="text-xl font-semibold text-[#2DD4BF]">{value}</p>
                      <p className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.12em] text-[#7E93A8]">
                        {label}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mt-6 flex flex-wrap gap-2">
                  <ActionButton onClick={initialize} disabled={busy === "seed"}>
                    <Play className="size-3" />
                    {busy === "seed" ? "Initializing…" : "Start with the lab"}
                  </ActionButton>
                  <Link
                    to="/security/settings"
                    className="inline-flex h-8 items-center gap-1.5 border border-[#2A3B55] px-3 font-mono text-[9px] uppercase tracking-[0.12em] text-[#9FB3C8] hover:text-[#E5EDF5]"
                  >
                    Review safety model
                  </Link>
                </div>
              </div>
            </div>
          </Panel>
          <Panel title="Investigation loop" eyebrow="Architecture">
            <div className="grid grid-cols-2 gap-1.5">
              {STAGES.map((stage, index) => (
                <div
                  key={stage}
                  className="flex items-center gap-2 border border-[#2A3B55] bg-[#0F1B2D] px-2.5 py-2"
                >
                  <span className="font-mono text-[8px] text-[#2DD4BF]">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="text-[10px] text-[#C7D5E5]">{stage}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 border-t border-[#24344F] pt-3">
              <p className="font-mono text-[8px] uppercase leading-relaxed tracking-[0.13em] text-[#7E93A8]">
                Seven agents · one orchestrator · persistent job records · human approval
                before every active test.
              </p>
            </div>
          </Panel>
        </div>
      </>
    );
  }

  const pending = data.latestInvestigation?.status === "WAITING_FOR_APPROVAL";
  const verified = data.verified;

  return (
    <>
      <PageHeader
        eyebrow="COMMAND CENTER / SYNTHETIC TRAVEL LAB"
        title="Security operations overview"
        description="Live, owner-scoped metrics from the Agentic DAST backend. Every number is derived from discovered endpoints, verified test evidence and recorded investigations — never seeded as a finding."
        actions={
          <>
            {pending && data.latestInvestigation && (
              <Link to={`/security/investigations/${data.latestInvestigation._id}`}>
                <ActionButton variant="danger">
                  <ShieldAlert className="size-3" /> Approval required
                </ActionButton>
              </Link>
            )}
            <ActionButton onClick={runInvestigation} disabled={busy === "run"}>
              <GitBranch className="size-3" />
              {busy === "run" ? "Running…" : "Trigger deployment"}
            </ActionButton>
            <ActionButton
              variant="ghost"
              onClick={() => setConfirmReset(true)}
              disabled={busy === "reset"}
            >
              <RotateCcw className="size-3" />
              {busy === "reset" ? "Resetting…" : "Reset lab"}
            </ActionButton>
          </>
        }
      />

      {pending && data.latestInvestigation && (
        <Link
          to={`/security/investigations/${data.latestInvestigation._id}`}
          className="mb-4 flex flex-col gap-3 border border-[#F5B942]/35 bg-[#F5B942]/6 px-4 py-3 transition-colors hover:bg-[#F5B942]/10 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center border border-[#F5B942]/40 bg-[#F5B942]/10">
              <ShieldAlert className="size-4 text-[#F5B942]" />
            </div>
            <div>
              <p className="text-[12px] font-medium text-[#F5B942]">
                {data.latestInvestigation.caseId} is paused at the safety gate
              </p>
              <p className="mt-0.5 text-[10px] text-[#F5B942]">
                Discovery and planning completed. No active request will run until an
                operator approves the scoped test plans.
              </p>
            </div>
          </div>
          <span className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[#F5B942]">
            Review approval <ArrowRight className="size-3" />
          </span>
        </Link>
      )}

      {demoOpen && (
        <div className="mb-4 border border-[#2DD4BF]/25 bg-[#0b1720] p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="size-3.5 text-[#2DD4BF]" />
              <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#2DD4BF]">
                Guided synthetic demo
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDemoOpen(false)}
              className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#6B8199] hover:text-[#E5EDF5]"
            >
              Dismiss
            </button>
          </div>
          <div className="mt-2.5 grid grid-cols-2 gap-1.5 lg:grid-cols-5">
            {[
              {
                label: "1 · Initialize lab",
                done: Boolean(data.application),
                note: "Synthetic target + policy",
              },
              {
                label: "2 · Trigger deployment",
                done: data.deploymentCount > 1,
                note: "Diff + scoped investigation",
              },
              {
                label: "3 · Approve plans",
                done: !pending && data.findingsTotal > 0,
                active: pending,
                note: "Human safety gate",
              },
              {
                label: "4 · Verify findings",
                done: data.findingsTotal > 0,
                note: "Control + attack + SHA-256",
              },
              {
                label: "5 · Apply fix & retest",
                done: data.retestCount > 0,
                note: "Fixed-config replay",
              },
            ].map((step) => (
              <div
                key={step.label}
                className={cn(
                  "border px-2.5 py-2",
                  step.done
                    ? "border-[#34D399]/30 bg-[#34D399]/6"
                    : step.active
                      ? "border-[#F5B942]/40 bg-[#F5B942]/8"
                      : "border-[#2A3B55] bg-[#0F1B2D]",
                )}
              >
                <p
                  className={cn(
                    "font-mono text-[8px] uppercase tracking-[0.08em]",
                    step.done
                      ? "text-[#34D399]"
                      : step.active
                        ? "text-[#F5B942]"
                        : "text-[#9FB3C8]",
                  )}
                >
                  {step.label}
                </p>
                <p className="mt-1 text-[8px] text-[#6B8199]">{step.note}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 xl:grid-cols-8">
        <Stat label="Applications" value={1} hint="Synthetic lab only" icon={<Boxes className="size-3.5" />} />
        <Stat label="Endpoints" value={data.endpointCount} hint="Discovered, not supplied" icon={<Network className="size-3.5" />} />
        <Stat label="Active APIs" value={inventory.active} tone="success" hint="Current traffic" />
        <Stat label="Zombie APIs" value={inventory.zombie} tone="high" hint="Reachable · stale" />
        <Stat label="Shadow APIs" value={inventory.shadow} tone="teal" hint="Undocumented" />
        <Stat label="Verified" value={verified} tone="critical" hint="Reproduced findings" />
        <Stat label="Investigations" value={data.investigationsRunning} tone="teal" hint={`${data.completedInvestigations} completed`} />
        <Stat label="Deploy → verify" value={data.mttvf ? `${(data.mttvf / 1000).toFixed(1)}s` : "—"} hint="Measured backend time" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-12">
        <Panel
          className="xl:col-span-3"
          title="Findings by severity"
          eyebrow="Precision"
          action={<Chip tone={verified ? "critical" : "success"}>{verified ? "verified" : "clean"}</Chip>}
        >
          <div className="relative h-[190px]">
            {severityData.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <ShieldCheck className="size-7 text-[#34D399]" />
                <p className="mt-2 text-[11px] text-[#9FB3C8]">No findings yet</p>
                <p className="mt-1 max-w-[160px] font-mono text-[8px] uppercase leading-relaxed tracking-[0.1em] text-[#6B8199]">
                  Run the deployment investigation
                </p>
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={severityData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={58}
                      outerRadius={78}
                      paddingAngle={3}
                      stroke="none"
                    >
                      {severityData.map((entry) => (
                        <Cell key={entry.name} fill={SEVERITY_COLORS[entry.name]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "#152238",
                        border: "1px solid #2A3B55",
                        fontSize: 10,
                        color: "#E5EDF5",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-semibold">{data.findingsTotal}</span>
                  <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-[#7E93A8]">
                    findings
                  </span>
                </div>
              </>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-[#24344F] pt-3">
            {Object.entries(data.severityCounts).map(([severity, count]) => (
              <div key={severity} className="flex items-center justify-between text-[9px]">
                <span className="flex items-center gap-1.5 text-[#9FB3C8]">
                  <span
                    className="size-1.5 rounded-full"
                    style={{ backgroundColor: SEVERITY_COLORS[severity] }}
                  />
                  {severity}
                </span>
                <span className="font-mono text-[#C7D5E5]">{String(count)}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          className="xl:col-span-6"
          title="Findings over the observation window"
          eyebrow="Trend · last 14 days"
          action={<span className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#7E93A8]">UTC</span>}
        >
          <div className="h-[190px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.trends} margin={{ top: 8, right: 6, left: -24, bottom: 0 }}>
                <defs>
                  <linearGradient id="totalFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2DD4BF" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#2DD4BF" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#24344F" strokeDasharray="2 4" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "#6B8199", fontSize: 8, fontFamily: "monospace" }}
                  tickLine={false}
                  axisLine={{ stroke: "#24344F" }}
                  tickFormatter={(value: string) => value.slice(5)}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: "#6B8199", fontSize: 8, fontFamily: "monospace" }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "#152238",
                    border: "1px solid #2A3B55",
                    fontSize: 10,
                    color: "#E5EDF5",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke="#2DD4BF"
                  strokeWidth={1.5}
                  fill="url(#totalFill)"
                  name="Findings"
                />
                <Area
                  type="monotone"
                  dataKey="critical"
                  stroke="#F87171"
                  strokeWidth={1.2}
                  fill="transparent"
                  name="Critical"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 grid grid-cols-4 gap-2 border-t border-[#24344F] pt-3">
            <MiniMetric label="Verified" value={data.verified} tone="text-[#F87171]" />
            <MiniMetric label="Retest success" value={data.retestSuccess == null ? "—" : `${Math.round(data.retestSuccess * 100)}%`} tone="text-[#34D399]" />
            <MiniMetric label="Reports" value={data.reportCount} tone="text-[#2DD4BF]" />
            <MiniMetric label="Deployments" value={data.deploymentCount} tone="text-[#9FB3C8]" />
          </div>
        </Panel>

        <Panel className="xl:col-span-3" title="API inventory" eyebrow="Discovery quality">
          <div className="space-y-3">
            {[
              ["Active", inventory.active, "#34D399"],
              ["Zombie", inventory.zombie, "#F5B942"],
              ["Shadow", inventory.shadow, "#F5B942"],
              ["Unknown", inventory.unknown, "#9FB3C8"],
            ].map(([label, value, color]) => {
              const numeric = Number(value);
              const pct = data.endpointCount ? Math.round((numeric / data.endpointCount) * 100) : 0;
              return (
                <div key={String(label)}>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="flex items-center gap-1.5 text-[#C7D5E5]">
                      <span className="size-1.5 rounded-full" style={{ backgroundColor: String(color) }} />
                      {label}
                    </span>
                    <span className="font-mono text-[#7E93A8]">
                      {numeric} · {pct}%
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 bg-[#0a1220]">
                    <div
                      className="h-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: String(color) }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 border-t border-[#24344F] pt-3">
            <Link
              to="/security/apis"
              className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.12em] text-[#2DD4BF] hover:text-[#5EEAD4]"
            >
              Open API explorer <ArrowRight className="size-3" />
            </Link>
          </div>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-12">
        <Panel
          className="xl:col-span-7"
          title="Live activity"
          eyebrow="Backend audit stream"
          action={
            <span className="flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.12em] text-[#34D399]">
              <span className="size-1.5 rounded-full bg-[#34D399]" /> reactive
            </span>
          }
          flush
        >
          <div className="max-h-[300px] overflow-y-auto">
            {data.activity.length === 0 ? (
              <p className="p-4 text-[11px] text-[#7E93A8]">No audit events yet.</p>
            ) : (
              data.activity.map((event) => (
                <div
                  key={event._id}
                  className="flex items-start gap-3 border-b border-[#1B2C45] px-4 py-2.5 last:border-b-0"
                >
                  <span
                    className={cn(
                      "mt-1 size-1.5 shrink-0 rounded-full",
                      event.severity === "CRITICAL"
                        ? "bg-[#F87171]"
                        : event.severity === "WARN"
                          ? "bg-[#F5B942]"
                          : event.severity === "SUCCESS"
                            ? "bg-[#34D399]"
                            : "bg-[#9FB3C8]",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] leading-snug text-[#C7D5E5]">{event.message}</p>
                    <p className="mt-0.5 flex items-center gap-2 font-mono text-[8px] uppercase tracking-[0.1em] text-[#6B8199]">
                      <span>{event.type}</span>
                      <span>·</span>
                      <span>{event.actor}</span>
                      <span>·</span>
                      <span>{relativeTime(event.at)}</span>
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>

        <Panel className="xl:col-span-5" title="Agent execution" eyebrow="Seven-agent pipeline" flush>
          <div className="divide-y divide-[#1B2C45]">
            {data.agents.map((agent) => (
              <div key={agent.key} className="flex items-center gap-3 px-4 py-2.5">
                <div className="flex size-7 items-center justify-center border border-[#2A3B55] bg-[#0F1B2D]">
                  {agent.key === "change-sentinel" ? (
                    <GitBranch className="size-3.5 text-[#9FB3C8]" />
                  ) : agent.key === "recon-inventory" ? (
                    <Radar className="size-3.5 text-[#2DD4BF]" />
                  ) : agent.key === "attack-planner" ? (
                    <Crosshair className="size-3.5 text-[#F5B942]" />
                  ) : agent.key === "safe-executor" ? (
                    <ShieldCheck className="size-3.5 text-[#34D399]" />
                  ) : agent.key === "verification" ? (
                    <Fingerprint className="size-3.5 text-[#F5B942]" />
                  ) : agent.key === "triage-reporting" ? (
                    <FileTextIcon />
                  ) : (
                    <RefreshCw className="size-3.5 text-[#F5B942]" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[10px] text-[#C7D5E5]">{agent.name}</p>
                  <p className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#6B8199]">
                    {agent.durationMs ? `${agent.durationMs} ms` : "not run"}
                  </p>
                </div>
                <span
                  className={cn(
                    "font-mono text-[8px] uppercase tracking-[0.1em]",
                    agent.status === "COMPLETED"
                      ? "text-[#34D399]"
                      : agent.status === "RUNNING"
                        ? "text-[#2DD4BF]"
                        : agent.status === "WAITING_FOR_APPROVAL"
                          ? "text-[#F5B942]"
                          : agent.status === "FAILED"
                            ? "text-[#F87171]"
                            : "text-[#7E93A8]",
                  )}
                >
                  {agent.status.replaceAll("_", " ")}
                </span>
              </div>
            ))}
          </div>
          <div className="border-t border-[#24344F] p-3">
            <Link
              to="/security/agents"
              className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.12em] text-[#2DD4BF] hover:text-[#5EEAD4]"
            >
              Open agent control center <ArrowRight className="size-3" />
            </Link>
          </div>
        </Panel>
      </div>

      <div className="mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { icon: Braces, label: "OpenAPI generated", value: "From observed routes", link: "/security/apis" },
          { icon: Layers, label: "Business flows mapped", value: "6 travel workflows", link: "/security/graph" },
          { icon: Activity, label: "Deploy-to-verified", value: data.mttvf ? `${(data.mttvf / 1000).toFixed(1)} seconds` : "Awaiting run", link: "/security/investigations" },
          { icon: Bot, label: "Safety gate", value: "Human approval required", link: "/security/settings" },
        ].map((item) => (
          <Link
            key={item.label}
            to={item.link}
            className="group flex items-center gap-3 border border-[#24344F] bg-[#152238] px-3 py-3 transition-colors hover:border-[#2a435b]"
          >
            <item.icon className="size-4 text-[#2DD4BF]" />
            <div className="min-w-0">
              <p className="text-[11px] text-[#C7D5E5]">{item.label}</p>
              <p className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#6B8199]">
                {item.value}
              </p>
            </div>
            <ArrowRight className="ml-auto size-3 text-[#6B8199] group-hover:text-[#2DD4BF]" />
          </Link>
        ))}
      </div>

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        tone="danger"
        title="Reset this operator's synthetic DAST workspace?"
        description="Only dast* records for this operator are deleted. Original JAAL forensic cases, consumer routes and investigation data are untouched. Audit history is retained."
        confirmLabel="Reset DAST workspace"
        busy={busy === "reset"}
        onConfirm={() => {
          setConfirmReset(false);
          void resetAll();
        }}
      />
    </>
  );
}

function MiniMetric({ label, value, tone }: { label: string; value: React.ReactNode; tone: string }) {
  return (
    <div>
      <p className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#6B8199]">{label}</p>
      <p className={cn("mt-0.5 text-[13px] font-semibold", tone)}>{value}</p>
    </div>
  );
}

function FileTextIcon() {
  return <FileText className="size-3.5 text-[#2DD4BF]" />;
}
