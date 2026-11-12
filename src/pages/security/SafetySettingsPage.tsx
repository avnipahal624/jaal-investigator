import {
  ActionButton,
  Chip,
  ConfirmDialog,
  LoadingState,
  PageHeader,
  Panel,
} from "@/components/security/ui";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { formatTimestamp, relativeTime } from "@/types/dast";
import { useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  CheckCircle2,
  Globe2,
  KeyRound,
  LockKeyhole,
  Power,
  RotateCcw,
  Save,
  ShieldOff,
  Users,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const ACTORS = [
  ["agency-a-admin", "Agency A admin", "AG-A", "AGENCY_ADMIN"],
  ["agency-b-admin", "Agency B admin", "AG-B", "AGENCY_ADMIN"],
  ["agency-a-subagent", "Agency A sub-agent", "AG-A", "SUB_AGENT"],
  ["platform-admin", "Platform admin", "—", "PLATFORM_ADMIN"],
];

export default function SafetySettingsPage() {
  const safety = useQuery(api.dast.safety);
  const setEmergencyStop = useMutation(api.dast.setEmergencyStop);
  const setLabMode = useMutation(api.dast.setLabMode);
  const resetLab = useMutation(api.dast.resetLab);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<"reset" | "stop" | null>(null);

  if (safety === undefined) {
    return <LoadingState label="Loading safety policy and audit history" />;
  }

  if (!safety) {
    return (
      <div className="py-16 text-center text-[11px] text-[#9FB3C8]">
        Initialize the synthetic lab to configure safety controls.
      </div>
    );
  }

  const { application, target, policy, lab, audit } = safety;

  async function toggleStop() {
    setBusy("stop");
    try {
      const next = !policy?.emergencyStop;
      await setEmergencyStop({ enabled: next });
      toast.success(next ? "Emergency stop engaged" : "Emergency stop released");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change emergency stop");
    } finally {
      setBusy(null);
    }
  }

  async function switchMode() {
    setBusy("mode");
    try {
      const next = lab?.mode === "FIXED" ? "VULNERABLE" : "FIXED";
      await setLabMode({ mode: next });
      toast.success(`Synthetic lab set to ${next}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change lab mode");
    } finally {
      setBusy(null);
    }
  }

  async function reset() {
    setBusy("reset");
    try {
      await resetLab();
      toast.success("DAST workspace reset");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="CONTROL / SAFETY ENFORCEMENT"
        title="Safety & settings"
        description="Scope, budgets, approvals and emergency stop are server-side policy. The interface cannot grant an exception the backend does not allow."
      />

      {policy?.emergencyStop && (
        <div className="mb-4 flex items-center gap-3 border border-[#F87171]/45 bg-[#F87171]/10 px-4 py-3">
          <ShieldOff className="size-5 text-[#F87171]" />
          <div>
            <p className="text-[12px] font-semibold text-[#F87171]">Emergency stop is engaged</p>
            <p className="text-[10px] text-[#F87171]">
              New and queued active tests are refused until the stop is released.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-8">
          <Panel title="Authorized target" eyebrow="Exact allowlist" flush>
            <div className="grid gap-0 md:grid-cols-3">
              <div className="border-b border-[#24344F] p-3 md:border-b-0 md:border-r">
                <p className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#7E93A8]">
                  Base URL
                </p>
                <p className="mt-1 font-mono text-[10px] text-[#2DD4BF]">
                  {target?.baseUrl ?? application.baseUrl}
                </p>
                <p className="mt-1 text-[9px] text-[#7E93A8]">
                  {application.transport === "IN_PROCESS_LAB"
                    ? "In-process synthetic lab transport"
                    : application.transport}
                </p>
              </div>
              <div className="border-b border-[#24344F] p-3 md:border-b-0 md:border-r">
                <p className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#7E93A8]">
                  Allowed hosts
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {(target?.allowedHosts ?? []).map((host) => (
                    <Chip key={host} tone="teal">
                      {host}
                    </Chip>
                  ))}
                </div>
              </div>
              <div className="p-3">
                <p className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#7E93A8]">
                  Allowed paths
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {(target?.allowedPaths ?? []).map((path) => (
                    <Chip key={path} tone="neutral">
                      {path}*
                    </Chip>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2 border-t border-[#24344F] bg-[#0F1B2D] px-3 py-2.5">
              <LockKeyhole className="mt-0.5 size-3.5 shrink-0 text-[#34D399]" />
              <p className="text-[9px] leading-relaxed text-[#9FB3C8]">
                Only HTTPS, host <span className="font-mono">lab.jaal.internal</span> and
                paths under <span className="font-mono">/api/</span> are authorized. Any
                other host, scheme or path is rejected before dispatch. External targets
                cannot be registered in this demonstration.
              </p>
            </div>
          </Panel>

          <PolicyEditor key={policy?.updatedAt ?? 0} policy={policy} />

          <Panel title="Emergency stop" eyebrow="Global circuit breaker" flush>
            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center border",
                    policy?.emergencyStop
                      ? "border-[#F87171]/50 bg-[#F87171]/10"
                      : "border-[#2A3B55] bg-[#0F1B2D]",
                  )}
                >
                  <Power
                    className={cn(
                      "size-5",
                      policy?.emergencyStop ? "text-[#F87171]" : "text-[#7E93A8]",
                    )}
                  />
                </div>
                <div>
                  <p className="text-[11px] font-medium text-[#E5EDF5]">
                    {policy?.emergencyStop ? "Stop is engaged" : "Stop is released"}
                  </p>
                  <p className="mt-0.5 max-w-lg text-[9px] leading-relaxed text-[#9FB3C8]">
                    Engaging the stop cancels queued investigations and refuses new
                    execution. Running workers check cancellation before each test.
                  </p>
                </div>
              </div>
              <ActionButton
                variant={policy?.emergencyStop ? "ghost" : "danger"}
                onClick={() => setConfirmAction("stop")}
                disabled={busy !== null}
              >
                <Power className="size-3" />
                {policy?.emergencyStop ? "Release stop" : "Engage emergency stop"}
              </ActionButton>
            </div>
          </Panel>

          <Panel title="Synthetic lab configuration" eyebrow="Vulnerable / fixed" flush>
            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 size-4 text-[#F5B942]" />
                <div>
                  <p className="text-[11px] text-[#E5EDF5]">
                    Lab mode:{" "}
                    <span className="font-mono text-[#F5B942]">{lab?.mode ?? "—"}</span>
                  </p>
                  <p className="mt-0.5 max-w-lg text-[9px] leading-relaxed text-[#9FB3C8]">
                    VULNERABLE intentionally contains the six planted business-logic
                    flaws. FIXED applies all remediations so the retest agent can prove
                    absence of the original violation.
                  </p>
                </div>
              </div>
              <ActionButton variant="ghost" onClick={switchMode} disabled={busy !== null}>
                <RotateCcw className="size-3" />
                Switch to {lab?.mode === "FIXED" ? "vulnerable" : "fixed"}
              </ActionButton>
            </div>
          </Panel>

          <Panel title="Audit log" eyebrow="Append-only safety events" flush>
            <div className="max-h-[320px] overflow-y-auto">
              {audit.map((event) => (
                <div
                  key={event._id}
                  className="flex items-start gap-2.5 border-b border-[#1B2C45] px-4 py-2.5 last:border-b-0"
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
                    <p className="text-[10px] leading-relaxed text-[#C7D5E5]">{event.message}</p>
                    <p className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.08em] text-[#6B8199]">
                      {event.type} · {event.actor} · {formatTimestamp(event.at)}
                    </p>
                  </div>
                </div>
              ))}
              {audit.length === 0 && (
                <p className="p-4 text-[10px] text-[#7E93A8]">No audit events yet.</p>
              )}
            </div>
          </Panel>
        </div>

        <div className="space-y-4 xl:col-span-4">
          <Panel title="Test identities" eyebrow="Synthetic only">
            <div className="space-y-2">
              {ACTORS.map(([id, label, agency, role]) => (
                <div key={id} className="border border-[#2A3B55] bg-[#0F1B2D] px-2.5 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-[10px] text-[#C7D5E5]">
                      <Users className="size-3 text-[#2DD4BF]" /> {label}
                    </span>
                    <span className="font-mono text-[8px] text-[#7E93A8]">{agency}</span>
                  </div>
                  <p className="mt-1 font-mono text-[7px] uppercase tracking-[0.08em] text-[#6B8199]">
                    {id} · {role}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-start gap-2 border-t border-[#24344F] pt-3">
              <KeyRound className="mt-0.5 size-3.5 shrink-0 text-[#7E93A8]" />
              <p className="text-[9px] leading-relaxed text-[#7E93A8]">
                Test credentials are synthetic actor identifiers, never production
                secrets. No passwords or tokens are stored.
              </p>
            </div>
          </Panel>

          <Panel title="Safety posture" eyebrow="Implemented controls" flush>
            <div className="divide-y divide-[#1B2C45]">
              {[
                ["Exact target allowlist", true],
                ["HTTPS only", true],
                ["Path scope enforcement", true],
                ["Per-plan request budget", true],
                ["Human approval gate", Boolean(policy?.approvalRequired)],
                ["Emergency stop", Boolean(policy?.emergencyStop)],
                ["Redirect blocking", true],
                ["Sanitized evidence", true],
                ["SHA-256 integrity", true],
                ["Owner-scoped access", true],
              ].map(([label, enabled]) => (
                <div key={String(label)} className="flex items-center justify-between px-3 py-2">
                  <span className="text-[10px] text-[#C7D5E5]">{label}</span>
                  {enabled ? (
                    <CheckCircle2 className="size-3.5 text-[#34D399]" />
                  ) : (
                    <span className="font-mono text-[8px] uppercase tracking-[0.08em] text-[#7E93A8]">
                      off
                    </span>
                  )}
                </div>
              ))}
            </div>
          </Panel>

          <div className="border border-[#24344F] bg-[#0F1B2D] p-3">
            <p className="flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.12em] text-[#2DD4BF]">
              <Globe2 className="size-3" /> No external scanning
            </p>
            <p className="mt-2 text-[10px] leading-relaxed text-[#9FB3C8]">
              This deployment is deliberately limited to the isolated synthetic lab. It
              cannot be pointed at an arbitrary host from the interface.
            </p>
            <p className="mt-2 font-mono text-[8px] uppercase tracking-[0.08em] text-[#6B8199]">
              Authorized by {target?.authorizedBy ?? "operator"} ·{" "}
              {relativeTime(target?.createdAt)}
            </p>
          </div>

          <Panel title="Danger zone" eyebrow="Reversible demo reset">
            <p className="text-[10px] leading-relaxed text-[#9FB3C8]">
              Delete this operator's DAST applications, investigations, findings,
              evidence and reports. The original JAAL forensic cases and reports are not
              touched.
            </p>
            <ActionButton
              variant="danger"
              onClick={() => setConfirmAction("reset")}
              disabled={busy !== null}
              className="mt-3 w-full"
            >
              <RotateCcw className="size-3" />
              {busy === "reset" ? "Resetting…" : "Reset DAST workspace"}
            </ActionButton>
          </Panel>
        </div>
      </div>

      <ConfirmDialog
        open={confirmAction !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null);
        }}
        tone="danger"
        title={
          confirmAction === "reset"
            ? "Reset this operator's DAST workspace?"
            : policy?.emergencyStop
              ? "Release the emergency stop?"
              : "Engage the emergency stop?"
        }
        description={
          confirmAction === "reset"
            ? "This deletes only dast* records for this operator: applications, investigations, findings, evidence and reports. The original JAAL forensic cases are not touched."
            : policy?.emergencyStop
              ? "Releasing the stop allows new approved tests to run. Existing cancellations remain cancelled."
              : "All queued and awaiting-approval investigations are cancelled, approved gates expire, and new execution is refused."
        }
        confirmLabel={
          confirmAction === "reset"
            ? "Reset DAST workspace"
            : policy?.emergencyStop
              ? "Release stop"
              : "Engage emergency stop"
        }
        busy={busy !== null}
        onConfirm={() => {
          const action = confirmAction;
          setConfirmAction(null);
          if (action === "reset") void reset();
          else void toggleStop();
        }}
      />
    </>
  );
}

type PolicyShape = {
  maxRequestsPerRun: number;
  maxConcurrency: number;
  rateLimitPerMinute: number;
  zombieWindowDays: number;
};

function PolicyEditor({ policy }: { policy: PolicyShape | null }) {
  const updatePolicy = useMutation(api.dast.updatePolicy);
  const [busy, setBusy] = useState(false);
  // Initialised once per policy version via the parent `key`; no effect-driven
  // state mirroring, so the editor cannot race a reactive policy update.
  const [form, setForm] = useState<PolicyShape>({
    maxRequestsPerRun: policy?.maxRequestsPerRun ?? 60,
    maxConcurrency: policy?.maxConcurrency ?? 2,
    rateLimitPerMinute: policy?.rateLimitPerMinute ?? 30,
    zombieWindowDays: policy?.zombieWindowDays ?? 30,
  });

  async function save() {
    setBusy(true);
    try {
      await updatePolicy(form);
      toast.success("Safety policy saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save policy");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title="Execution limits"
      eyebrow="Request safety"
      action={
        <ActionButton onClick={save} disabled={busy}>
          <Save className="size-3" /> {busy ? "Saving…" : "Save policy"}
        </ActionButton>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <NumberField
          label="Max requests / run"
          value={form.maxRequestsPerRun}
          min={1}
          max={200}
          onChange={(value) =>
            setForm((current) => ({ ...current, maxRequestsPerRun: value }))
          }
          hint="Hard ceiling across all plans"
        />
        <NumberField
          label="Max concurrency"
          value={form.maxConcurrency}
          min={1}
          max={5}
          onChange={(value) => setForm((current) => ({ ...current, maxConcurrency: value }))}
          hint="Active-run ceiling; the in-process lab is serial"
        />
        <NumberField
          label="Rate limit / minute"
          value={form.rateLimitPerMinute}
          min={1}
          max={120}
          onChange={(value) =>
            setForm((current) => ({ ...current, rateLimitPerMinute: value }))
          }
          hint="Recorded policy; no external network in this lab"
        />
        <NumberField
          label="Zombie window (days)"
          value={form.zombieWindowDays}
          min={1}
          max={365}
          onChange={(value) => setForm((current) => ({ ...current, zombieWindowDays: value }))}
          hint="No legitimate traffic threshold"
        />
        <div className="border border-[#2A3B55] bg-[#0F1B2D] p-2.5">
          <p className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#7E93A8]">
            Redirects
          </p>
          <p className="mt-1 font-mono text-[11px] text-[#F87171]">DISABLED</p>
          <p className="mt-0.5 text-[8px] text-[#6B8199]">A redirect cannot escape the allowlist.</p>
        </div>
        <div className="border border-[#2A3B55] bg-[#0F1B2D] p-2.5">
          <p className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#7E93A8]">
            Destructive methods
          </p>
          <p className="mt-1 font-mono text-[11px] text-[#F87171]">REJECTED</p>
          <p className="mt-0.5 text-[8px] text-[#6B8199]">GET and POST only.</p>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#24344F] pt-3">
        <div className="flex items-center gap-2 text-[10px] text-[#C7D5E5]">
          <LockKeyhole className="size-3.5 text-[#34D399]" />
          Human approval for active tests
          <Chip tone="success">Mandatory</Chip>
        </div>
        <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#7E93A8]">
          cannot be disabled
        </span>
      </div>
    </Panel>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  hint: string;
}) {
  return (
    <label className="border border-[#2A3B55] bg-[#0F1B2D] p-2.5">
      <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#7E93A8]">
        {label}
      </span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1 h-7 w-full border border-[#2A3B55] bg-[#0A1526] px-2 font-mono text-[11px] text-[#E5EDF5] focus:border-[#2DD4BF]/60 focus:outline-none"
      />
      <span className="mt-1 block text-[8px] text-[#6B8199]">{hint}</span>
    </label>
  );
}
