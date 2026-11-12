import {
  ActionButton,
  Chip,
  EmptyState,
  PageHeader,
  Panel,
} from "@/components/security/ui";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import {
  formatDuration,
  INVESTIGATION_STATUS_META,
  relativeTime,
  STAGE_LABELS,
} from "@/types/dast";
import { useMutation, useQuery } from "convex/react";
import {
  Activity,
  ArrowRight,
  Clock3,
  GitBranch,
  Layers3,
  ShieldAlert,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

export default function InvestigationsPage() {
  const rows = useQuery(api.dast.investigations);
  const bootstrap = useQuery(api.dast.bootstrap);
  const trigger = useMutation(api.dast.triggerDeployment);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    try {
      const result = await trigger();
      if (result?.investigationId) {
        navigate(`/security/investigations/${result.investigationId}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start investigation");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="INVESTIGATIONS / PIPELINE"
        title="Live investigations"
        description="Each row is a persistent investigation record: deployment diff, inventory discovery, deterministic plan, safety gate, execution, verification and report."
        actions={
          <ActionButton onClick={start} disabled={busy}>
            <GitBranch className="size-3" />
            {busy ? "Creating…" : "Trigger deployment"}
          </ActionButton>
        }
      />

      {!bootstrap ? (
        <div className="text-[11px] text-[#7890a8]">Loading security workspace…</div>
      ) : !rows || rows.length === 0 ? (
        <EmptyState
          icon={<Activity className="size-5" />}
          title="No investigations yet"
          body="Trigger the synthetic deployment to diff the travel API, discover its endpoints and create the first scoped investigation. Nothing executes until you approve it."
          action={
            <ActionButton onClick={start} disabled={busy}>
              <GitBranch className="size-3" /> Trigger deployment
            </ActionButton>
          }
        />
      ) : (
        <div className="space-y-2.5">
          {rows.map((row) => {
            const meta =
              INVESTIGATION_STATUS_META[row.status] ?? INVESTIGATION_STATUS_META.QUEUED;
            const stats = (row.stats ?? {}) as Record<string, unknown>;
            const plans = Number(stats.plans ?? 0);
            const endpoints = Number(stats.endpoints ?? 0);
            const requests = Number(stats.requestCount ?? 0);
            return (
              <Link
                key={row._id}
                to={`/security/investigations/${row._id}`}
                className="group block border border-[#1b2a3e] bg-[#101827] transition-colors hover:border-[#2c455e]"
              >
                <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <div
                      className="mt-0.5 flex size-9 shrink-0 items-center justify-center border"
                      style={{
                        borderColor: `${meta.color}55`,
                        backgroundColor: `${meta.color}12`,
                      }}
                    >
                      {row.status === "COMPLETED" ? (
                        <ShieldCheck className="size-4" style={{ color: meta.color }} />
                      ) : row.status === "WAITING_FOR_APPROVAL" ? (
                        <ShieldAlert className="size-4" style={{ color: meta.color }} />
                      ) : (
                        <Activity className="size-4" style={{ color: meta.color }} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[10px] text-[#27C7B8]">{row.caseId}</span>
                        <span
                          className="border px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.1em]"
                          style={{
                            color: meta.color,
                            borderColor: `${meta.color}55`,
                            backgroundColor: `${meta.color}10`,
                          }}
                        >
                          {meta.label}
                        </span>
                        <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#526a81]">
                          {row.trigger}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-[12px] font-medium text-[#d7e2ee]">
                        {row.title}
                      </p>
                      <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-[#7890a8]">
                        {row.summary || `Current stage: ${STAGE_LABELS[row.stage] ?? row.stage}`}
                      </p>
                    </div>
                  </div>
                  <div className="grid shrink-0 grid-cols-4 gap-3 border-t border-[#1b2a3e] pt-3 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
                    <Mini label="Endpoints" value={endpoints} />
                    <Mini label="Plans" value={plans} />
                    <Mini label="Requests" value={requests} />
                    <Mini
                      label="Deploy→verify"
                      value={
                        stats.deployToVerifiedMs
                          ? formatDuration(Number(stats.deployToVerifiedMs))
                          : "—"
                      }
                    />
                  </div>
                  <div className="flex shrink-0 items-center justify-between gap-4 lg:flex-col lg:items-end">
                    <span className="flex items-center gap-1 font-mono text-[8px] uppercase tracking-[0.1em] text-[#526a81]">
                      <Clock3 className="size-3" /> {relativeTime(row.startedAt)}
                    </span>
                    <span className="flex items-center gap-1 font-mono text-[8px] uppercase tracking-[0.12em] text-[#27C7B8]">
                      Open record <ArrowRight className="size-3" />
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 border-t border-[#162436] px-4 py-2">
                  {["CHANGE_DETECTION", "DISCOVERY", "PLANNING", "SAFETY_REVIEW", "EXECUTION", "VERIFICATION", "REPORTING"].map(
                    (stage, index) => {
                      const stageIndex = [
                        "CHANGE_DETECTION",
                        "DISCOVERY",
                        "PLANNING",
                        "SAFETY_REVIEW",
                        "EXECUTION",
                        "VERIFICATION",
                        "REPORTING",
                      ].indexOf(row.stage);
                      const done = index < stageIndex || row.status === "COMPLETED";
                      const current = index === stageIndex && row.status !== "COMPLETED";
                      return (
                        <div key={stage} className="flex min-w-0 flex-1 items-center gap-1.5">
                          <span
                            className={cn(
                              "size-1.5 shrink-0 rounded-full",
                              done
                                ? "bg-[#35C98A]"
                                : current
                                  ? "bg-[#F5C96A]"
                                  : "bg-[#26384f]",
                            )}
                          />
                          <span
                            className={cn(
                              "hidden truncate font-mono text-[7px] uppercase tracking-[0.08em] sm:block",
                              done
                                ? "text-[#6e8a7d]"
                                : current
                                  ? "text-[#F5C96A]"
                                  : "text-[#415970]",
                            )}
                          >
                            {STAGE_LABELS[stage]}
                          </span>
                          {index < 6 && <span className="h-px flex-1 bg-[#1e3044]" />}
                        </div>
                      );
                    },
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
        {[
          { icon: Workflow, label: "Durable records", text: "Job, plan, approval and execution rows survive worker restarts." },
          { icon: Layers3, label: "Evidence-bound", text: "Every verified finding links to a SHA-256 sealed HTTP exchange." },
          { icon: ShieldCheck, label: "Approval-gated", text: "Active tests stop at WAITING_FOR_APPROVAL until an operator approves." },
        ].map((item) => (
          <div key={item.label} className="flex gap-3 border border-[#1b2a3e] bg-[#0d1623] p-3">
            <item.icon className="mt-0.5 size-4 shrink-0 text-[#27C7B8]" />
            <div>
              <p className="text-[11px] text-[#c7d3e2]">{item.label}</p>
              <p className="mt-0.5 text-[10px] leading-relaxed text-[#60788f]">{item.text}</p>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function Mini({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-14">
      <p className="font-mono text-[7px] uppercase tracking-[0.1em] text-[#526a81]">{label}</p>
      <p className="mt-0.5 text-[12px] font-medium text-[#c7d3e2]">{value}</p>
    </div>
  );
}
