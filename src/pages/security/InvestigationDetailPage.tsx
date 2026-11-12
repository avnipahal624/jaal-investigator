import {
  ActionButton,
  Chip,
  FindingStatusBadge,
  KeyValue,
  MethodBadge,
  PageHeader,
  Panel,
  SeverityBadge,
} from "@/components/security/ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import {
  formatDuration,
  formatTimestamp,
  INVESTIGATION_STATUS_META,
  relativeTime,
  STAGE_LABELS,
} from "@/types/dast";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Fingerprint,
  GitBranch,
  LockKeyhole,
  Play,
  Radar,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Sparkles,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";

const STAGES = [
  "CHANGE_DETECTION",
  "DISCOVERY",
  "PLANNING",
  "SAFETY_REVIEW",
  "EXECUTION",
  "VERIFICATION",
  "TRIAGE",
  "REPORTING",
  "RETEST",
];

export default function InvestigationDetailPage() {
  const { id } = useParams();
  const detail = useQuery(
    api.dast.investigation,
    id ? { id: id as Id<"dastInvestigations"> } : "skip",
  );
  const approve = useMutation(api.dast.approveInvestigation);
  const execute = useMutation(api.dast.executeInvestigation);
  const deny = useMutation(api.dast.denyInvestigation);
  const enrich = useAction(api.dastAi.enrichPlans);
  const [busy, setBusy] = useState<string | null>(null);

  if (detail === undefined) {
    return <div className="py-16 text-center text-[11px] text-[#7890a8]">Loading investigation…</div>;
  }
  if (!detail) {
    return (
      <div className="border border-[#1b2a3e] bg-[#101827] p-8 text-center">
        <p className="text-sm text-[#c7d3e2]">Investigation not found.</p>
        <Link
          to="/security/investigations"
          className="mt-3 inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[#27C7B8]"
        >
          <ArrowLeft className="size-3" /> Back to investigations
        </Link>
      </div>
    );
  }

  const { investigation, plans, executions, approvals, findings, events, deployment } = detail;
  const pending = approvals.find((approval) => approval.status === "PENDING");
  const approved = approvals.find((approval) => approval.status === "APPROVED");
  const meta = INVESTIGATION_STATUS_META[investigation.status] ?? INVESTIGATION_STATUS_META.QUEUED;
  const stats = (investigation.stats ?? {}) as Record<string, unknown>;
  const budget = Number(stats.requestBudget ?? 0);
  const plannedRequests = plans.reduce((sum, plan) => sum + plan.maxRequests, 0);
  const activeStageIndex = STAGES.indexOf(investigation.stage);

  async function runApproved() {
    setBusy("execute");
    try {
      if (pending) {
        await approve({
          id: investigation._id,
          note: "Approved from the investigation detail console.",
        });
      }
      const result = await execute({ id: investigation._id });
      toast.success(
        `Execution complete · ${result.verified} verified · ${result.requestCount} requests`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Execution failed");
    } finally {
      setBusy(null);
    }
  }

  async function addAiRationale() {
    setBusy("ai");
    try {
      const result = await enrich({ id: investigation._id });
      if (!result.ok) {
        toast.error(result.reason ?? "Groq advisory is unavailable");
      } else {
        toast.success(`${result.count} advisory rationale(s) attached`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Groq advisory failed");
    } finally {
      setBusy(null);
    }
  }

  async function reject() {
    setBusy("deny");
    try {
      await deny({
        id: investigation._id,
        note: "Denied — scope review required.",
      });
      toast.success("Investigation denied; no active tests ran.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not deny investigation");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow={`INVESTIGATION / ${investigation.caseId}`}
        title={investigation.title}
        description={investigation.summary || "Scoped deployment investigation against the synthetic travel lab."}
        actions={
          <>
            <Link to="/security/investigations">
              <ActionButton variant="ghost">
                <ArrowLeft className="size-3" /> All investigations
              </ActionButton>
            </Link>
            <Chip
              tone={
                investigation.status === "COMPLETED"
                  ? "success"
                  : investigation.status === "WAITING_FOR_APPROVAL"
                    ? "medium"
                    : "teal"
              }
              dot
            >
              {meta.label}
            </Chip>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
        <Metric label="Current stage" value={STAGE_LABELS[investigation.stage] ?? investigation.stage} />
        <Metric label="Changed endpoints" value={investigation.changedEndpointIds.length} />
        <Metric label="Plans" value={plans.length} />
        <Metric label="Requests" value={Number(stats.requestCount ?? 0)} />
        <Metric
          label="Deploy → verified"
          value={stats.deployToVerifiedMs ? formatDuration(Number(stats.deployToVerifiedMs)) : "Pending"}
        />
        <Metric label="Started" value={relativeTime(investigation.startedAt)} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-8">
          {pending && (
            <Panel className="border-[#F5C96A]/35 bg-[#141a20]" flush>
              <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center border border-[#F5C96A]/40 bg-[#F5C96A]/10">
                    <ShieldAlert className="size-5 text-[#F5C96A]" />
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-[#F5C96A]">
                      Human approval required before active testing
                    </p>
                    <p className="mt-1 max-w-lg text-[10px] leading-relaxed text-[#b7a579]">
                      {plans.length} test plans passed deterministic scope validation. The
                      execution agent will only use GET/POST against{" "}
                      <span className="font-mono">lab.jaal.internal</span>, within the request
                      budget, and will stop on any control failure.
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <ActionButton variant="ghost" onClick={reject} disabled={busy !== null}>
                    <XCircle className="size-3" /> Deny
                  </ActionButton>
                  <ActionButton onClick={runApproved} disabled={busy !== null}>
                    {busy === "execute" ? (
                      <>Executing…</>
                    ) : (
                      <>
                        <Play className="size-3" /> Approve & execute
                      </>
                    )}
                  </ActionButton>
                </div>
              </div>
            </Panel>
          )}

          {approved && investigation.status === "WAITING_FOR_APPROVAL" && (
            <Panel className="border-[#35C98A]/30" flush>
              <div className="flex items-center justify-between gap-4 p-4">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="size-5 text-[#35C98A]" />
                  <div>
                    <p className="text-[12px] text-[#d7e2ee]">Approval recorded</p>
                    <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#60788f]">
                      {approved.decidedBy} · {relativeTime(approved.decidedAt)}
                    </p>
                  </div>
                </div>
                <ActionButton onClick={runApproved} disabled={busy !== null}>
                  <Play className="size-3" />
                  {busy === "execute" ? "Executing…" : "Execute approved tests"}
                </ActionButton>
              </div>
            </Panel>
          )}

          <Panel title="Investigation timeline" eyebrow="Stage-by-stage execution" flush>
            <div className="p-4">
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5 lg:grid-cols-9">
                {STAGES.map((stage, index) => {
                  const done =
                    investigation.status === "COMPLETED" ||
                    (activeStageIndex >= 0 && index < activeStageIndex);
                  const current = index === activeStageIndex && investigation.status !== "COMPLETED";
                  return (
                    <div
                      key={stage}
                      className={cn(
                        "border px-1.5 py-2 text-center",
                        done
                          ? "border-[#35C98A]/25 bg-[#35C98A]/5"
                          : current
                            ? "border-[#F5C96A]/40 bg-[#F5C96A]/8"
                            : "border-[#1e3044] bg-[#0b1421]",
                      )}
                    >
                      <span
                        className={cn(
                          "mx-auto block size-1.5 rounded-full",
                          done ? "bg-[#35C98A]" : current ? "bg-[#F5C96A]" : "bg-[#31465d]",
                        )}
                      />
                      <p
                        className={cn(
                          "mt-1.5 font-mono text-[7px] uppercase leading-tight tracking-[0.08em]",
                          done
                            ? "text-[#78b49a]"
                            : current
                              ? "text-[#F5C96A]"
                              : "text-[#4d647a]",
                        )}
                      >
                        {STAGE_LABELS[stage] ?? stage}
                      </p>
                    </div>
                  );
                })}
              </div>

              <div className="mt-5 border-t border-[#1b2a3e] pt-3">
                {events.length === 0 ? (
                  <p className="text-[10px] text-[#60788f]">No audit events recorded.</p>
                ) : (
                  <ol className="space-y-0">
                    {events.map((event, index) => (
                      <li key={event._id} className="relative flex gap-3 pb-3 last:pb-0">
                        <div className="flex flex-col items-center">
                          <span
                            className={cn(
                              "mt-1 size-1.5 shrink-0 rounded-full",
                              event.severity === "CRITICAL"
                                ? "bg-[#F05D67]"
                                : event.severity === "WARN"
                                  ? "bg-[#F5C96A]"
                                  : event.severity === "SUCCESS"
                                    ? "bg-[#35C98A]"
                                    : "bg-[#64B5F6]",
                            )}
                          />
                          {index < events.length - 1 && (
                            <span className="mt-1 h-full w-px flex-1 bg-[#1e3044]" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] leading-relaxed text-[#c7d3e2]">
                            {event.message}
                          </p>
                          <p className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.1em] text-[#526a81]">
                            {event.type} · {event.actor} · {formatTimestamp(event.at)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          </Panel>

          <Panel
            title={`Attack plans (${plans.length})`}
            eyebrow="Deterministic planner"
            action={
              <div className="flex items-center gap-1.5">
                <Chip tone="violet">LLM advisory only</Chip>
                <ActionButton
                  variant="ghost"
                  onClick={addAiRationale}
                  disabled={busy !== null || plans.length === 0}
                >
                  <Sparkles className="size-3" />
                  {busy === "ai" ? "Groq…" : "AI rationale"}
                </ActionButton>
              </div>
            }
            flush
          >
            <div className="divide-y divide-[#162436]">
              {plans.map((plan, index) => (
                <div key={plan._id} className="p-3.5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <span className="mt-0.5 font-mono text-[9px] text-[#526a81]">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-[11px] font-medium text-[#d7e2ee]">{plan.title}</p>
                          <SeverityBadge severity={plan.risk} />
                        </div>
                        <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.09em] text-[#60788f]">
                          {plan.category} · {plan.role.replaceAll("_", " ")} · budget {plan.maxRequests}
                        </p>
                      </div>
                    </div>
                    <ExecutionStatus status={plan.status} />
                  </div>
                  <p className="mt-2 max-w-4xl text-[10px] leading-relaxed text-[#7890a8]">
                    {plan.rationale}
                  </p>
                  {plan.aiRationale && (
                    <div className="mt-2 border-l border-[#B383F5]/50 bg-[#B383F5]/5 px-2.5 py-1.5">
                      <p className="font-mono text-[7px] uppercase tracking-[0.1em] text-[#B383F5]">
                        Groq advisory · not executed
                      </p>
                      <p className="mt-1 text-[10px] leading-relaxed text-[#b7a8cc]">
                        {plan.aiRationale}
                      </p>
                    </div>
                  )}
                  <details className="mt-2">
                    <summary className="cursor-pointer font-mono text-[8px] uppercase tracking-[0.1em] text-[#27C7B8]">
                      Fixture & validation
                    </summary>
                    <div className="mt-2 grid gap-3 border-t border-[#162436] pt-2 sm:grid-cols-2">
                      <div>
                        <p className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#526a81]">
                          Synthetic fixture
                        </p>
                        <p className="mt-1 text-[10px] leading-relaxed text-[#91A3BB]">{plan.fixture}</p>
                      </div>
                      <div>
                        <p className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#526a81]">
                          Verification strategy
                        </p>
                        <p className="mt-1 text-[10px] leading-relaxed text-[#91A3BB]">{plan.validation}</p>
                      </div>
                      <div>
                        <p className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#526a81]">
                          Expected authorized behaviour
                        </p>
                        <p className="mt-1 text-[10px] leading-relaxed text-[#91A3BB]">{plan.expected}</p>
                      </div>
                      <div>
                        <p className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#526a81]">
                          Stop conditions
                        </p>
                        <ul className="mt-1 space-y-0.5">
                          {plan.stopConditions.map((condition) => (
                            <li key={condition} className="text-[10px] text-[#91A3BB]">
                              • {condition}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </details>
                </div>
              ))}
            </div>
          </Panel>

          {executions.length > 0 && (
            <Panel title="Execution & verification" eyebrow="Control + attack assertions" flush>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left">
                  <thead>
                    <tr className="border-b border-[#1b2a3e] bg-[#0c1521]">
                      {["Test", "Status", "Requests", "Control", "Assertion"].map((header) => (
                        <th
                          key={header}
                          className="px-3 py-2 font-mono text-[8px] uppercase tracking-[0.12em] text-[#60788f]"
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {executions.map((execution) => {
                      const assertions = (execution.assertions ?? {}) as Record<string, unknown>;
                      return (
                        <tr key={execution._id} className="border-b border-[#162436] last:border-b-0">
                          <td className="px-3 py-2 font-mono text-[9px] text-[#c7d3e2]">
                            {execution.testKey}
                          </td>
                          <td className="px-3 py-2">
                            <ExecutionStatus status={execution.status} />
                          </td>
                          <td className="px-3 py-2 font-mono text-[9px] text-[#91A3BB]">
                            {execution.requestCount}
                          </td>
                          <td className="px-3 py-2 text-[9px] text-[#91A3BB]">
                            {assertions.controlPassed ? "Passed" : "Failed"}
                          </td>
                          <td className="max-w-[320px] px-3 py-2 text-[9px] leading-relaxed text-[#7890a8]">
                            {String(assertions.actual ?? "—")}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}

          {findings.length > 0 && (
            <Panel
              title={`Verified findings (${findings.length})`}
              eyebrow="Boundary violations reproduced"
              action={
                <Link to="/security/vulnerabilities">
                  <ActionButton variant="ghost">
                    Open center <ArrowRight className="size-3" />
                  </ActionButton>
                </Link>
              }
              flush
            >
              <div className="divide-y divide-[#162436]">
                {findings.map((finding) => (
                  <Link
                    key={finding._id}
                    to={`/security/vulnerabilities/${finding._id}`}
                    className="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-[#121d2d] sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-start gap-3">
                      <SeverityBadge severity={finding.severity} />
                      <div>
                        <p className="text-[11px] text-[#d7e2ee]">
                          {finding.findingId} · {finding.title}
                        </p>
                        <p className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.1em] text-[#526a81]">
                          {finding.method} {finding.path} · {finding.ownerTeam}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <FindingStatusBadge status={finding.status} />
                      <Fingerprint className="size-3 text-[#35C98A]" />
                      <span className="font-mono text-[8px] text-[#5f7692]">
                        {finding.evidenceHash.slice(0, 10)}…
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </Panel>
          )}
        </div>

        <div className="space-y-4 xl:col-span-4">
          <Panel title="Safety gate" eyebrow="Enforced server-side">
            <dl className="space-y-3">
              <KeyValue label="Safety status">
                <span className="font-mono text-[10px] text-[#35C98A]">
                  {investigation.safetyStatus}
                </span>
              </KeyValue>
              <KeyValue label="Authorized target">
                <span className="font-mono text-[10px]">https://lab.jaal.internal</span>
                <span className="mt-1 block text-[9px] text-[#60788f]">
                  Exact host allowlist · HTTPS only · /api/ path scope
                </span>
              </KeyValue>
              <KeyValue label="Request budget">
                <span className="font-mono text-[10px]">
                  {Number(stats.requestCount ?? 0)} used / {budget || "—"} approved
                </span>
                <span className="mt-1 block text-[9px] text-[#60788f]">
                  Plans request at most {plannedRequests}; destructive methods rejected.
                </span>
              </KeyValue>
              <KeyValue label="Approval">
                {pending ? (
                  <span className="font-mono text-[10px] text-[#F5C96A]">PENDING</span>
                ) : approved ? (
                  <span className="font-mono text-[10px] text-[#35C98A]">APPROVED</span>
                ) : (
                  <span className="font-mono text-[10px] text-[#91A3BB]">NOT REQUIRED / CLOSED</span>
                )}
              </KeyValue>
              <KeyValue label="Redirects">Disabled</KeyValue>
            </dl>
            <div className="mt-4 flex items-start gap-2 border border-[#1e3145] bg-[#0b1421] p-2.5">
              <LockKeyhole className="mt-0.5 size-3.5 shrink-0 text-[#27C7B8]" />
              <p className="text-[9px] leading-relaxed text-[#7890a8]">
                Scope is checked for every plan and every outbound request. The LLM cannot
                add a test, change a host or bypass the approval gate.
              </p>
            </div>
          </Panel>

          {deployment && (
            <Panel title="Deployment context" eyebrow={deployment.version}>
              <dl className="space-y-3">
                <KeyValue label="Commit">
                  <span className="font-mono text-[10px]">{deployment.commit}</span>
                </KeyValue>
                <KeyValue label="Trigger">
                  {deployment.source}
                </KeyValue>
                <KeyValue label="Priority score">
                  <span className="font-mono text-[10px] text-[#F59E55]">
                    {deployment.priorityScore}/100
                  </span>
                </KeyValue>
              </dl>
              <div className="mt-3 space-y-1.5 border-t border-[#1b2a3e] pt-3">
                {(deployment.changes as Array<{ type: string; method: string; path: string; detail: string }>).map(
                  (change, index) => (
                    <div key={`${change.path}-${index}`} className="border border-[#1e3044] bg-[#0b1421] p-2">
                      <div className="flex items-center gap-2">
                        <Chip
                          tone={
                            change.type === "ADDED"
                              ? "violet"
                              : change.type === "DEPRECATED"
                                ? "high"
                                : "teal"
                          }
                        >
                          {change.type}
                        </Chip>
                        <span className="font-mono text-[8px] text-[#91A3BB]">{change.method}</span>
                        <span className="truncate font-mono text-[8px] text-[#c7d3e2]">
                          {change.path}
                        </span>
                      </div>
                      <p className="mt-1 text-[9px] leading-relaxed text-[#60788f]">
                        {change.detail}
                      </p>
                    </div>
                  ),
                )}
              </div>
            </Panel>
          )}

          <Panel title="Agent chain" eyebrow="Current ownership">
            <div className="space-y-2">
              {[
                ["change-sentinel", "Change Sentinel"],
                ["recon-inventory", "Recon & Inventory"],
                ["attack-planner", "Attack Planner"],
                ["safe-executor", "Safe Execution"],
                ["verification", "Verification"],
                ["triage-reporting", "Triage & Reporting"],
              ].map(([key, name]) => {
                const done = investigation.status === "COMPLETED";
                const active = investigation.currentAgent === key;
                return (
                  <div key={key} className="flex items-center gap-2.5">
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        done
                          ? "bg-[#35C98A]"
                          : active
                            ? "bg-[#F5C96A]"
                            : "bg-[#31465d]",
                      )}
                    />
                    <span className="text-[10px] text-[#a6b7c9]">{name}</span>
                    <span className="ml-auto font-mono text-[8px] uppercase tracking-[0.1em] text-[#526a81]">
                      {done ? "done" : active ? "active" : "queued"}
                    </span>
                  </div>
                );
              })}
            </div>
          </Panel>

          <div className="border border-[#1b2a3e] bg-[#0d1623] p-3.5">
            <p className="flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.14em] text-[#F5C96A]">
              <Radar className="size-3" /> Synthetic lab notice
            </p>
            <p className="mt-2 text-[10px] leading-relaxed text-[#7890a8]">
              This investigation targets an in-process synthetic travel API with invented
              agencies and travellers. Results demonstrate the engine; they are not claims
              about TBO production systems.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border border-[#1b2a3e] bg-[#101827] p-3">
      <p className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#60788f]">{label}</p>
      <p className="mt-1 truncate text-[13px] font-medium text-[#d7e2ee]">{value}</p>
    </div>
  );
}

function ExecutionStatus({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
    VERIFIED: { color: "#F05D67", label: "VERIFIED", icon: <ShieldX className="size-3" /> },
    FALSE_POSITIVE: { color: "#91A3BB", label: "FALSE POSITIVE", icon: <CheckCircle2 className="size-3" /> },
    INCONCLUSIVE: { color: "#F59E55", label: "INCONCLUSIVE", icon: <Clock3 className="size-3" /> },
    READY: { color: "#64B5F6", label: "READY", icon: <Clock3 className="size-3" /> },
    BLOCKED: { color: "#F05D67", label: "BLOCKED", icon: <ShieldX className="size-3" /> },
    REJECTED_BY_SCOPE: { color: "#F05D67", label: "SCOPE BLOCK", icon: <ShieldX className="size-3" /> },
    REJECTED_BUDGET: { color: "#F59E55", label: "BUDGET BLOCK", icon: <Clock3 className="size-3" /> },
  };
  const item = map[status] ?? { color: "#91A3BB", label: status, icon: <Clock3 className="size-3" /> };
  return (
    <span
      className="inline-flex items-center gap-1 border px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.08em]"
      style={{
        color: item.color,
        borderColor: `${item.color}44`,
        backgroundColor: `${item.color}10`,
      }}
    >
      {item.icon}
      {item.label}
    </span>
  );
}
