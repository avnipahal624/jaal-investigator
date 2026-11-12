import {
  ActionButton,
  Chip,
  ConfirmDialog,
  FindingStatusBadge,
  KeyValue,
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
  const [confirmAction, setConfirmAction] = useState<"execute" | "deny" | null>(null);

  if (detail === undefined) {
    return <div className="py-16 text-center text-[11px] text-[#9FB3C8]">Loading investigation…</div>;
  }
  if (!detail) {
    return (
      <div className="border border-[#24344F] bg-[#152238] p-8 text-center">
        <p className="text-sm text-[#C7D5E5]">Investigation not found.</p>
        <Link
          to="/security/investigations"
          className="mt-3 inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[#2DD4BF]"
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
            <Panel className="border-[#F5B942]/35 bg-[#141a20]" flush>
              <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center border border-[#F5B942]/40 bg-[#F5B942]/10">
                    <ShieldAlert className="size-5 text-[#F5B942]" />
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-[#F5B942]">
                      Human approval required before active testing
                    </p>
                    <p className="mt-1 max-w-lg text-[10px] leading-relaxed text-[#b7a579]">
                      {plans.length} test plans are bound to a SHA-256 plan/scope digest. The
                      execution agent will only use GET/POST against{" "}
                      <span className="font-mono">lab.jaal.internal</span>, within the request
                      budget, and will stop on any control failure. Approval expires in 30 minutes
                      and can be consumed once.
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <ActionButton
                    variant="ghost"
                    onClick={() => setConfirmAction("deny")}
                    disabled={busy !== null}
                  >
                    <XCircle className="size-3" /> Deny
                  </ActionButton>
                  <ActionButton
                    onClick={() => setConfirmAction("execute")}
                    disabled={busy !== null}
                  >
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
            <Panel className="border-[#34D399]/30" flush>
              <div className="flex items-center justify-between gap-4 p-4">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="size-5 text-[#34D399]" />
                  <div>
                    <p className="text-[12px] text-[#d7e2ee]">Approval recorded</p>
                    <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#7E93A8]">
                      {approved.decidedBy} · {relativeTime(approved.decidedAt)}
                    </p>
                    <p className="mt-1 font-mono text-[8px] text-[#7E93A8]">
                      Plan digest {approved.planDigest?.slice(0, 16) ?? "unavailable"} ·{" "}
                      {approved.expiresAt ? `expires ${formatTimestamp(approved.expiresAt)}` : "no expiry"}
                    </p>
                  </div>
                </div>
                <ActionButton
                  onClick={() => setConfirmAction("execute")}
                  disabled={busy !== null}
                >
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
                          ? "border-[#34D399]/25 bg-[#34D399]/5"
                          : current
                            ? "border-[#F5B942]/40 bg-[#F5B942]/8"
                            : "border-[#1e3044] bg-[#0F1B2D]",
                      )}
                    >
                      <span
                        className={cn(
                          "mx-auto block size-1.5 rounded-full",
                          done ? "bg-[#34D399]" : current ? "bg-[#F5B942]" : "bg-[#31465d]",
                        )}
                      />
                      <p
                        className={cn(
                          "mt-1.5 font-mono text-[7px] uppercase leading-tight tracking-[0.08em]",
                          done
                            ? "text-[#78b49a]"
                            : current
                              ? "text-[#F5B942]"
                              : "text-[#4d647a]",
                        )}
                      >
                        {STAGE_LABELS[stage] ?? stage}
                      </p>
                    </div>
                  );
                })}
              </div>

              <div className="mt-5 border-t border-[#24344F] pt-3">
                {events.length === 0 ? (
                  <p className="text-[10px] text-[#7E93A8]">No audit events recorded.</p>
                ) : (
                  <ol className="space-y-0">
                    {events.map((event, index) => (
                      <li key={event._id} className="relative flex gap-3 pb-3 last:pb-0">
                        <div className="flex flex-col items-center">
                          <span
                            className={cn(
                              "mt-1 size-1.5 shrink-0 rounded-full",
                              event.severity === "CRITICAL"
                                ? "bg-[#F87171]"
                                : event.severity === "WARN"
                                  ? "bg-[#F5B942]"
                                  : event.severity === "SUCCESS"
                                    ? "bg-[#34D399]"
                                    : "bg-[#64B5F6]",
                            )}
                          />
                          {index < events.length - 1 && (
                            <span className="mt-1 h-full w-px flex-1 bg-[#1e3044]" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] leading-relaxed text-[#C7D5E5]">
                            {event.message}
                          </p>
                          <p className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.1em] text-[#6B8199]">
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
            <div className="divide-y divide-[#1B2C45]">
              {plans.map((plan, index) => (
                <div key={plan._id} className="p-3.5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <span className="mt-0.5 font-mono text-[9px] text-[#6B8199]">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-[11px] font-medium text-[#d7e2ee]">{plan.title}</p>
                          <SeverityBadge severity={plan.risk} />
                        </div>
                        <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.09em] text-[#7E93A8]">
                          {plan.category} · {plan.role.replaceAll("_", " ")} · budget {plan.maxRequests}
                        </p>
                      </div>
                    </div>
                    <ExecutionStatus status={plan.status} />
                  </div>
                  <p className="mt-2 max-w-4xl text-[10px] leading-relaxed text-[#9FB3C8]">
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
                    <summary className="cursor-pointer font-mono text-[8px] uppercase tracking-[0.1em] text-[#2DD4BF]">
                      Fixture & validation
                    </summary>
                    <div className="mt-2 grid gap-3 border-t border-[#1B2C45] pt-2 sm:grid-cols-2">
                      <div>
                        <p className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#6B8199]">
                          Synthetic fixture
                        </p>
                        <p className="mt-1 text-[10px] leading-relaxed text-[#9FB3C8]">{plan.fixture}</p>
                      </div>
                      <div>
                        <p className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#6B8199]">
                          Verification strategy
                        </p>
                        <p className="mt-1 text-[10px] leading-relaxed text-[#9FB3C8]">{plan.validation}</p>
                      </div>
                      <div>
                        <p className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#6B8199]">
                          Expected authorized behaviour
                        </p>
                        <p className="mt-1 text-[10px] leading-relaxed text-[#9FB3C8]">{plan.expected}</p>
                      </div>
                      <div>
                        <p className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#6B8199]">
                          Stop conditions
                        </p>
                        <ul className="mt-1 space-y-0.5">
                          {plan.stopConditions.map((condition) => (
                            <li key={condition} className="text-[10px] text-[#9FB3C8]">
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
                    <tr className="border-b border-[#24344F] bg-[#0c1521]">
                      {["Test", "Status", "Requests", "Control", "Assertion"].map((header) => (
                        <th
                          key={header}
                          className="px-3 py-2 font-mono text-[8px] uppercase tracking-[0.12em] text-[#7E93A8]"
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
                        <tr key={execution._id} className="border-b border-[#1B2C45] last:border-b-0">
                          <td className="px-3 py-2 font-mono text-[9px] text-[#C7D5E5]">
                            {execution.testKey}
                          </td>
                          <td className="px-3 py-2">
                            <ExecutionStatus status={execution.status} />
                          </td>
                          <td className="px-3 py-2 font-mono text-[9px] text-[#9FB3C8]">
                            {execution.requestCount}
                          </td>
                          <td className="px-3 py-2 text-[9px] text-[#9FB3C8]">
                            {assertions.controlPassed ? "Passed" : "Failed"}
                          </td>
                          <td className="max-w-[320px] px-3 py-2 text-[9px] leading-relaxed text-[#9FB3C8]">
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
              <div className="divide-y divide-[#1B2C45]">
                {findings.map((finding) => (
                  <Link
                    key={finding._id}
                    to={`/security/vulnerabilities/${finding._id}`}
                    className="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-[#1B2C45] sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-start gap-3">
                      <SeverityBadge severity={finding.severity} />
                      <div>
                        <p className="text-[11px] text-[#d7e2ee]">
                          {finding.findingId} · {finding.title}
                        </p>
                        <p className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.1em] text-[#6B8199]">
                          {finding.method} {finding.path} · {finding.ownerTeam}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <FindingStatusBadge status={finding.status} />
                      <Fingerprint className="size-3 text-[#34D399]" />
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
                <span className="font-mono text-[10px] text-[#34D399]">
                  {investigation.safetyStatus}
                </span>
              </KeyValue>
              <KeyValue label="Authorized target">
                <span className="font-mono text-[10px]">https://lab.jaal.internal</span>
                <span className="mt-1 block text-[9px] text-[#7E93A8]">
                  Exact host allowlist · HTTPS only · /api/ path scope
                </span>
              </KeyValue>
              <KeyValue label="Request budget">
                <span className="font-mono text-[10px]">
                  {Number(stats.requestCount ?? 0)} used / {budget || "—"} approved
                </span>
                <span className="mt-1 block text-[9px] text-[#7E93A8]">
                  Plans request at most {plannedRequests}; destructive methods rejected.
                </span>
              </KeyValue>
              <KeyValue label="Approval">
                {pending ? (
                  <span className="font-mono text-[10px] text-[#F5B942]">PENDING</span>
                ) : approved ? (
                  <span className="font-mono text-[10px] text-[#34D399]">APPROVED</span>
                ) : (
                  <span className="font-mono text-[10px] text-[#9FB3C8]">CONSUMED / CLOSED</span>
                )}
                <span className="mt-1 block font-mono text-[8px] text-[#7E93A8]">
                  {(pending ?? approved)?.planDigest?.slice(0, 20) ?? "no active digest"}
                </span>
              </KeyValue>
              <KeyValue label="Redirects">Disabled</KeyValue>
            </dl>
            <div className="mt-4 flex items-start gap-2 border border-[#2A3B55] bg-[#0F1B2D] p-2.5">
              <LockKeyhole className="mt-0.5 size-3.5 shrink-0 text-[#2DD4BF]" />
              <p className="text-[9px] leading-relaxed text-[#9FB3C8]">
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
                  <span className="font-mono text-[10px] text-[#F5B942]">
                    {deployment.priorityScore}/100
                  </span>
                </KeyValue>
              </dl>
              <div className="mt-3 space-y-1.5 border-t border-[#24344F] pt-3">
                {(deployment.changes as Array<{ type: string; method: string; path: string; detail: string }>).map(
                  (change, index) => (
                    <div key={`${change.path}-${index}`} className="border border-[#1e3044] bg-[#0F1B2D] p-2">
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
                        <span className="font-mono text-[8px] text-[#9FB3C8]">{change.method}</span>
                        <span className="truncate font-mono text-[8px] text-[#C7D5E5]">
                          {change.path}
                        </span>
                      </div>
                      <p className="mt-1 text-[9px] leading-relaxed text-[#7E93A8]">
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
                          ? "bg-[#34D399]"
                          : active
                            ? "bg-[#F5B942]"
                            : "bg-[#31465d]",
                      )}
                    />
                    <span className="text-[10px] text-[#a6b7c9]">{name}</span>
                    <span className="ml-auto font-mono text-[8px] uppercase tracking-[0.1em] text-[#6B8199]">
                      {done ? "done" : active ? "active" : "queued"}
                    </span>
                  </div>
                );
              })}
            </div>
          </Panel>

          <div className="border border-[#24344F] bg-[#0F1B2D] p-3.5">
            <p className="flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.14em] text-[#F5B942]">
              <Radar className="size-3" /> Synthetic lab notice
            </p>
            <p className="mt-2 text-[10px] leading-relaxed text-[#9FB3C8]">
              This investigation targets an in-process synthetic travel API with invented
              agencies and travellers. Results demonstrate the engine; they are not claims
              about TBO production systems.
            </p>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmAction !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null);
        }}
        tone={confirmAction === "deny" ? "danger" : "primary"}
        title={
          confirmAction === "deny"
            ? "Deny active testing?"
            : pending
              ? "Approve and execute this locked plan?"
              : "Execute the approved plan?"
        }
        description={
          confirmAction === "deny"
            ? "The pending approval is denied and no active test request will be sent. This decision is audited."
            : "This action consumes the approval and sends only the locked GET/POST tests to lab.jaal.internal. It cannot be replayed."
        }
        details={
          <div className="grid gap-1.5">
            <span><strong>{plans.length}</strong> locked plans · budget <strong>{plannedRequests}</strong> requests</span>
            <span>Scope: HTTPS · lab.jaal.internal · /api/ · redirects disabled</span>
            <span>Digest: <code>{pending?.planDigest?.slice(0, 24) ?? approved?.planDigest?.slice(0, 24) ?? "unavailable"}</code></span>
          </div>
        }
        confirmLabel={confirmAction === "deny" ? "Deny investigation" : "Approve & execute"}
        busy={busy !== null}
        onConfirm={() => {
          const action = confirmAction;
          setConfirmAction(null);
          if (action === "deny") void reject();
          else void runApproved();
        }}
      />
    </>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border border-[#24344F] bg-[#152238] p-3">
      <p className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#7E93A8]">{label}</p>
      <p className="mt-1 truncate text-[13px] font-medium text-[#d7e2ee]">{value}</p>
    </div>
  );
}

function ExecutionStatus({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
    VERIFIED: { color: "#F87171", label: "VERIFIED", icon: <ShieldX className="size-3" /> },
    FALSE_POSITIVE: { color: "#9FB3C8", label: "FALSE POSITIVE", icon: <CheckCircle2 className="size-3" /> },
    INCONCLUSIVE: { color: "#F5B942", label: "INCONCLUSIVE", icon: <Clock3 className="size-3" /> },
    READY: { color: "#64B5F6", label: "READY", icon: <Clock3 className="size-3" /> },
    BLOCKED: { color: "#F87171", label: "BLOCKED", icon: <ShieldX className="size-3" /> },
    REJECTED_BY_SCOPE: { color: "#F87171", label: "SCOPE BLOCK", icon: <ShieldX className="size-3" /> },
    REJECTED_BUDGET: { color: "#F5B942", label: "BUDGET BLOCK", icon: <Clock3 className="size-3" /> },
  };
  const item = map[status] ?? { color: "#9FB3C8", label: status, icon: <Clock3 className="size-3" /> };
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
