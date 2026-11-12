import {
  ActionButton,
  Chip,
  EmptyState,
  PageHeader,
  Panel,
} from "@/components/security/ui";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { formatTimestamp, relativeTime } from "@/types/dast";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowRight,
  CheckCircle2,
  GitBranch,
  GitCommitHorizontal,
  Radar,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Timer,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

type Change = {
  type: string;
  method: string;
  path: string;
  detail: string;
  priority: number;
};

export default function DeploymentsPage() {
  const deployments = useQuery(api.dast.deployments);
  const investigations = useQuery(api.dast.investigations);
  const trigger = useMutation(api.dast.triggerDeployment);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  async function deploy() {
    setBusy(true);
    try {
      const result = await trigger();
      if (result?.investigationId) {
        navigate(`/security/investigations/${result.investigationId}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not trigger deployment");
    } finally {
      setBusy(false);
    }
  }

  const latest = deployments?.[0] ?? null;
  const changes = (latest?.changes ?? []) as Change[];

  return (
    <>
      <PageHeader
        eyebrow="DETECT / DEPLOYMENT INTELLIGENCE"
        title="Deployment intelligence"
        description="Change Sentinel diffs release manifests, prioritizes affected endpoints and creates a scoped investigation instead of scanning the entire application."
        actions={
          <ActionButton onClick={deploy} disabled={busy}>
            <GitBranch className="size-3" />
            {busy ? "Receiving…" : "Send synthetic deployment"}
          </ActionButton>
        }
      />

      {!deployments || deployments.length === 0 ? (
        <EmptyState
          icon={<Rocket className="size-5" />}
          title="No deployments registered"
          body="Initialize the lab and send a deployment webhook. The baseline deployment is recorded first; the changed release is diffed against it."
          action={
            <Link to="/security">
              <ActionButton>Go to overview</ActionButton>
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
          <div className="space-y-3">
            {deployments.map((deployment) => {
              const deploymentChanges = (deployment.changes ?? []) as Change[];
              const investigation = investigations?.find(
                (row) => row._id === deployment.investigationId,
              );
              return (
                <Panel key={deployment._id} flush>
                  <div className="flex flex-col gap-3 border-b border-[#24344F] p-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "flex size-9 shrink-0 items-center justify-center border",
                          deployment.status === "BASELINE"
                            ? "border-[#2A3B55] bg-[#1B2C45] text-[#9FB3C8]"
                            : deployment.status === "INVESTIGATED"
                              ? "border-[#34D399]/35 bg-[#34D399]/8 text-[#34D399]"
                              : "border-[#2DD4BF]/35 bg-[#2DD4BF]/8 text-[#2DD4BF]",
                        )}
                      >
                        {deployment.status === "BASELINE" ? (
                          <GitCommitHorizontal className="size-4" />
                        ) : (
                          <Rocket className="size-4" />
                        )}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-mono text-[10px] text-[#d7e2ee]">
                            {deployment.version}
                          </p>
                          <Chip
                            tone={
                              deployment.status === "INVESTIGATED"
                                ? "success"
                                : deployment.status === "BASELINE"
                                  ? "neutral"
                                  : "teal"
                            }
                          >
                            {deployment.status}
                          </Chip>
                        </div>
                        <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.1em] text-[#7E93A8]">
                          {deployment.commit} · {deployment.source} ·{" "}
                          {relativeTime(deployment.receivedAt)}
                        </p>
                        <p className="mt-1 font-mono text-[8px] text-[#6B8199]">
                          {formatTimestamp(deployment.receivedAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {deployment.status !== "BASELINE" && (
                        <span className="flex items-center gap-1 font-mono text-[8px] uppercase tracking-[0.1em] text-[#F5B942]">
                          <Timer className="size-3" /> priority {deployment.priorityScore}
                        </span>
                      )}
                      {investigation && (
                        <Link to={`/security/investigations/${investigation._id}`}>
                          <ActionButton variant="ghost">
                            {investigation.caseId} <ArrowRight className="size-3" />
                          </ActionButton>
                        </Link>
                      )}
                    </div>
                  </div>

                  {deploymentChanges.length === 0 ? (
                    <div className="flex items-center gap-2 px-4 py-3 text-[10px] text-[#7E93A8]">
                      <CheckCircle2 className="size-3.5 text-[#34D399]" />
                      Baseline manifest recorded. No changes to diff yet.
                    </div>
                  ) : (
                    <div className="divide-y divide-[#1B2C45]">
                      {deploymentChanges.map((change, index) => (
                        <div
                          key={`${change.path}-${index}`}
                          className="flex flex-col gap-1.5 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="flex min-w-0 items-start gap-2">
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
                            <div className="min-w-0">
                              <p className="truncate font-mono text-[9px] text-[#C7D5E5]">
                                {change.method} {change.path}
                              </p>
                              <p className="mt-0.5 text-[9px] leading-relaxed text-[#7E93A8]">
                                {change.detail}
                              </p>
                            </div>
                          </div>
                          <span className="shrink-0 font-mono text-[8px] text-[#6B8199]">
                            P{change.priority}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </Panel>
              );
            })}
          </div>

          <div className="space-y-4">
            <Panel title="Change summary" eyebrow="Latest release">
              {!latest || changes.length === 0 ? (
                <p className="text-[10px] leading-relaxed text-[#7E93A8]">
                  Send the synthetic deployment to compare the baseline against a release
                  that adds a shadow route and changes two authorization contracts.
                </p>
              ) : (
                <div className="space-y-3">
                  {[
                    ["Added endpoints", changes.filter((change) => change.type === "ADDED").length],
                    ["Modified contracts", changes.filter((change) => change.type === "MODIFIED").length],
                    ["Deprecated routes", changes.filter((change) => change.type === "DEPRECATED").length],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="flex items-center justify-between">
                      <span className="text-[10px] text-[#9FB3C8]">{label}</span>
                      <span className="font-mono text-[12px] text-[#d7e2ee]">{value}</span>
                    </div>
                  ))}
                  <div className="border-t border-[#24344F] pt-3">
                    <p className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#7E93A8]">
                      Affected business flows
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {Array.from(
                        new Set(
                          changes.map((change) =>
                            change.path.includes("refund")
                              ? "refund"
                              : change.path.includes("booking")
                                ? "booking"
                                : change.path.includes("metrics")
                                  ? "agency-credit"
                                  : "platform",
                          ),
                        ),
                      ).map((flow) => (
                        <Chip key={flow} tone="neutral">
                          {flow}
                        </Chip>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </Panel>

            <Panel title="Why scoped?" eyebrow="Not a full scan">
              <div className="space-y-3 text-[10px] leading-relaxed text-[#9FB3C8]">
                <div className="flex items-start gap-2">
                  <Radar className="mt-0.5 size-3.5 shrink-0 text-[#2DD4BF]" />
                  <p>
                    Only changed endpoints and their directly dependent business flows are
                    prioritized. Unchanged routes stay in inventory but do not receive
                    redundant active tests.
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <RefreshCw className="mt-0.5 size-3.5 shrink-0 text-[#64B5F6]" />
                  <p>
                    Deployment IDs are idempotent. Replaying the same webhook returns the
                    existing investigation instead of creating duplicates.
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-[#34D399]" />
                  <p>
                    Discovery remains read-only until the human approval gate. No payload
                    is sent to an external host.
                  </p>
                </div>
              </div>
            </Panel>

            <div className="border border-[#24344F] bg-[#0F1B2D] p-3">
              <p className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#F5B942]">
                Synthetic release
              </p>
              <p className="mt-1.5 text-[10px] leading-relaxed text-[#9FB3C8]">
                The release webhook is generated by the isolated lab. It is not connected
                to a real CI/CD pipeline or TBO infrastructure.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
