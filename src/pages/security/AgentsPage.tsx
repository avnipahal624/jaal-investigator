import {
  ActionButton,
  Chip,
  LoadingState,
  PageHeader,
  Panel,
} from "@/components/security/ui";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { formatDuration, relativeTime } from "@/types/dast";
import { useMutation, useQuery } from "convex/react";
import {
  Activity,
  Bot,
  Clock3,
  FileText,
  Fingerprint,
  GitBranch,
  Pause,
  Play,
  Radar,
  ShieldAlert,
  ShieldCheck,
  Square,
  Terminal,
  Workflow,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";

const AGENT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "change-sentinel": GitBranch,
  "recon-inventory": Radar,
  "attack-planner": Workflow,
  "safe-executor": ShieldCheck,
  verification: Fingerprint,
  "triage-reporting": FileText,
  retest: Activity,
};

const STATUS_TONE: Record<string, string> = {
  IDLE: "text-[#7E93A8] border-[#2A3B55] bg-[#1B2C45]",
  QUEUED: "text-[#9FB3C8] border-[#2A3B55] bg-[#1B2C45]",
  RUNNING: "text-[#2DD4BF] border-[#2DD4BF]/40 bg-[#2DD4BF]/8",
  WAITING_FOR_APPROVAL: "text-[#F5B942] border-[#F5B942]/40 bg-[#F5B942]/8",
  PAUSED: "text-[#F5B942] border-[#F5B942]/40 bg-[#F5B942]/8",
  COMPLETED: "text-[#34D399] border-[#34D399]/40 bg-[#34D399]/8",
  FAILED: "text-[#F87171] border-[#F87171]/40 bg-[#F87171]/8",
  CANCELLED: "text-[#9FB3C8] border-[#2A3B55] bg-[#1B2C45]",
};

export default function AgentsPage() {
  const agents = useQuery(api.dast.agents);
  const investigations = useQuery(api.dast.investigations);
  const control = useMutation(api.dast.setAgentControl);
  const [busy, setBusy] = useState<string | null>(null);

  async function run(key: string, action: "PAUSE" | "RESUME" | "CANCEL") {
    setBusy(`${key}:${action}`);
    try {
      await control({ key, action });
      toast.success(`Agent ${action.toLowerCase()} recorded`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Agent control failed");
    } finally {
      setBusy(null);
    }
  }

  const pending =
    investigations?.filter((investigation) => investigation.status === "WAITING_FOR_APPROVAL") ?? [];

  if (agents === undefined) {
    return <LoadingState label="Loading agent state and approval queue" />;
  }

  return (
    <>
      <PageHeader
        eyebrow="ORCHESTRATION / SEVEN AGENTS"
        title="Agent control center"
        description="Every agent has a persisted definition, status, current task, execution duration and audit trail. Controls are enforced by the backend, not just the interface."
        actions={
          <Link to="/security/investigations">
            <ActionButton>
              <Play className="size-3" /> Open investigations
            </ActionButton>
          </Link>
        }
      />

      <Panel className="mb-4" flush>
        <div className="flex flex-col items-stretch gap-2 p-4 lg:flex-row lg:items-center">
          <div className="flex items-center gap-3 border border-[#2DD4BF]/35 bg-[#2DD4BF]/7 px-4 py-3 lg:w-[230px]">
            <div className="flex size-9 items-center justify-center border border-[#2DD4BF]/40 bg-[#2DD4BF]/10">
              <Bot className="size-4 text-[#2DD4BF]" />
            </div>
            <div>
              <p className="text-[12px] font-semibold text-[#5EEAD4]">Orchestrator</p>
              <p className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#7E93A8]">
                durable job + approval state
              </p>
            </div>
          </div>
          <div className="hidden h-px flex-1 bg-gradient-to-r from-[#2DD4BF]/50 to-[#2A3B55] lg:block" />
          <div className="grid flex-1 grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-7">
            {(agents ?? []).map((agent) => {
              const Icon = AGENT_ICONS[agent.key] ?? Bot;
              return (
                <div
                  key={agent.key}
                  className="flex items-center gap-2 border border-[#2A3B55] bg-[#0F1B2D] px-2 py-2"
                >
                  <Icon className="size-3 shrink-0 text-[#2DD4BF]" />
                  <div className="min-w-0">
                    <p className="truncate text-[8px] text-[#C7D5E5]">
                      {agent.name.split(" ")[0]}
                    </p>
                    <p className="truncate font-mono text-[7px] uppercase tracking-[0.06em] text-[#6B8199]">
                      {agent.status.replaceAll("_", " ")}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Panel>

      {pending.length > 0 && (
        <div className="mb-4 border border-[#F5B942]/35 bg-[#F5B942]/6 p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-[#F5B942]" />
              <div>
                <p className="text-[11px] font-medium text-[#F5B942]">
                  {pending.length} investigation{pending.length > 1 ? "s" : ""} waiting for approval
                </p>
                <p className="mt-0.5 text-[10px] text-[#F5B942]">
                  The execution agent is paused at the safety gate. No active test runs
                  until an operator approves the plan.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {pending.slice(0, 3).map((investigation) => (
                <Link key={investigation._id} to={`/security/investigations/${investigation._id}`}>
                  <ActionButton variant="ghost">
                    {investigation.caseId} <ShieldCheck className="size-3" />
                  </ActionButton>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(agents ?? []).map((agent, index) => {
          const Icon = AGENT_ICONS[agent.key] ?? Bot;
          return (
            <Panel key={agent._id} className="relative" flush>
              <div className="flex items-start justify-between gap-3 border-b border-[#24344F] p-4">
                <div className="flex items-start gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center border border-[#2A3B55] bg-[#0F1B2D]">
                    <Icon className="size-4 text-[#2DD4BF]" />
                  </div>
                  <div>
                    <p className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#6B8199]">
                      Agent {String(index + 1).padStart(2, "0")}
                    </p>
                    <p className="mt-0.5 text-[12px] font-semibold text-[#E5EDF5]">{agent.name}</p>
                  </div>
                </div>
                <span
                  className={cn(
                    "border px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.08em]",
                    STATUS_TONE[agent.status] ?? STATUS_TONE.IDLE,
                  )}
                >
                  {agent.status.replaceAll("_", " ")}
                </span>
              </div>
              <div className="p-4">
                <p className="min-h-[42px] text-[10px] leading-relaxed text-[#9FB3C8]">
                  {agent.purpose}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[#24344F] pt-3">
                  <div>
                    <p className="font-mono text-[7px] uppercase tracking-[0.1em] text-[#6B8199]">
                      Current task
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[9px] text-[#C7D5E5]">
                      {agent.currentTask ?? "Idle — no task assigned"}
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-[7px] uppercase tracking-[0.1em] text-[#6B8199]">
                      Last execution
                    </p>
                    <p className="mt-0.5 text-[9px] text-[#C7D5E5]">
                      {agent.lastRunAt ? relativeTime(agent.lastRunAt) : "Never"}
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-[7px] uppercase tracking-[0.1em] text-[#6B8199]">
                      Duration
                    </p>
                    <p className="mt-0.5 font-mono text-[9px] text-[#C7D5E5]">
                      {formatDuration(agent.durationMs)}
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-[7px] uppercase tracking-[0.1em] text-[#6B8199]">
                      Result
                    </p>
                    <p
                      className={cn(
                        "mt-0.5 text-[9px]",
                        agent.success === true
                          ? "text-[#34D399]"
                          : agent.success === false
                            ? "text-[#F87171]"
                            : "text-[#7E93A8]",
                      )}
                    >
                      {agent.success === true ? "Success" : agent.success === false ? "Failed" : "Not run"}
                    </p>
                  </div>
                </div>
                {agent.error && (
                  <p className="mt-2 border border-[#F87171]/25 bg-[#F87171]/6 px-2 py-1.5 font-mono text-[8px] text-[#F87171]">
                    {agent.error}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-[#24344F] pt-3">
                  {agent.lastInvestigationId && (
                    <Link to={`/security/investigations/${agent.lastInvestigationId}`}>
                      <ActionButton variant="ghost">
                        <Terminal className="size-3" /> Logs
                      </ActionButton>
                    </Link>
                  )}
                  {agent.paused ? (
                    <ActionButton
                      variant="ghost"
                      onClick={() => run(agent.key, "RESUME")}
                      disabled={busy !== null}
                    >
                      <Play className="size-3" /> Resume
                    </ActionButton>
                  ) : (
                    <ActionButton
                      variant="ghost"
                      onClick={() => run(agent.key, "PAUSE")}
                      disabled={busy !== null}
                    >
                      <Pause className="size-3" /> Pause
                    </ActionButton>
                  )}
                  <ActionButton
                    variant="danger"
                    onClick={() => run(agent.key, "CANCEL")}
                    disabled={busy !== null}
                  >
                    <Square className="size-3" /> Cancel
                  </ActionButton>
                  {agent.paused && (
                    <Chip tone="high" className="ml-auto">
                      Scheduling paused
                    </Chip>
                  )}
                </div>
              </div>
            </Panel>
          );
        })}
      </div>

      {!agents?.length && (
        <div className="border border-[#24344F] bg-[#152238] p-8 text-center">
          <Bot className="mx-auto size-6 text-[#6B8199]" />
          <p className="mt-2 text-[12px] text-[#C7D5E5]">No agent definitions yet.</p>
          <p className="mt-1 text-[10px] text-[#7E93A8]">
            Initialize the synthetic lab to register the seven agents.
          </p>
          <Link to="/security" className="mt-3 inline-block">
            <ActionButton>Go to overview</ActionButton>
          </Link>
        </div>
      )}

      <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
        {[
          {
            icon: Clock3,
            label: "Bounded scheduling",
            text: "Jobs carry leases and attempt counts; no unbounded agent loop can run.",
          },
          {
            icon: ShieldCheck,
            label: "Approval gate",
            text: "Execution refuses to start unless the approval row is APPROVED.",
          },
          {
            icon: XCircle,
            label: "Emergency stop",
            text: "The policy check runs before every execution and blocks new tests.",
          },
        ].map((item) => (
          <div key={item.label} className="flex gap-3 border border-[#24344F] bg-[#0F1B2D] p-3">
            <item.icon className="mt-0.5 size-4 shrink-0 text-[#2DD4BF]" />
            <div>
              <p className="text-[11px] text-[#C7D5E5]">{item.label}</p>
              <p className="mt-0.5 text-[10px] leading-relaxed text-[#7E93A8]">{item.text}</p>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
