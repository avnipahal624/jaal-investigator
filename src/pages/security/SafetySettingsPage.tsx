import {
  ActionButton,
  Chip,
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
  ShieldCheck,
  ShieldOff,
  Terminal,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const ACTORS = [
  ["agency-a-admin", "Agency A admin", "AG-A", "AGENCY_ADMIN"],
  ["agency-b-admin", "Agency B admin", "AG-B", "AGENCY_ADMIN"],
  ["agency-a-subagent", "Agency A sub-agent", "AG-A", "SUB_AGENT"],
  ["platform-admin", "Platform admin", "—", "PLATFORM_ADMIN"],
];

export default function SafetySettingsPage() {
  const safety = useQuery(api.dast.safety);
  const updatePolicy = useMutation(api.dast.updatePolicy);
  const setEmergencyStop = useMutation(api.dast.setEmergencyStop);
  const setLabMode = useMutation(api.dast.setLabMode);
  const resetLab = useMutation(api.dast.resetLab);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({
    maxRequestsPerRun: 60,
    maxConcurrency: 2,
    rateLimitPerMinute: 30,
    approvalRequired: true,
    zombieWindowDays: 30,
  });

  useEffect(() => {
    if (safety?.policy) {
      setForm({
        maxRequestsPerRun: safety.policy.maxRequestsPerRun,
        maxConcurrency: safety.policy.maxConcurrency,
        rateLimitPerMinute: safety.policy.rateLimitPerMinute,
        approvalRequired: safety.policy.approvalRequired,
        zombieWindowDays: safety.policy.zombieWindowDays,
      });
    }
  }, [safety?.policy]);

  if (!safety) {
    return (
      <div className="py-16 text-center text-[11px] text-[#7890a8]">
        Initialize the synthetic lab to configure safety controls.
      </div>
    );
  }

  const { application, target, policy, lab, audit } = safety;

  async function savePolicy() {
    setBusy("save");
    try {
      await updatePolicy(form);
      toast.success("Safety policy saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save policy");
    } finally {
      setBusy(null);
    }
  }

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
    if (!window.confirm("Delete all DAST investigations, findings and evidence for this operator? Original JAAL records are untouched.")) {
      return;
    }
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
        actions={
          <ActionButton onClick={savePolicy} disabled={busy !== null}>
            <Save className="size-3" /> {busy === "save" ? "Saving…" : "Save policy"}
          </ActionButton>
        }
      />

      {policy?.emergencyStop && (
        <div className="mb-4 flex items-center gap-3 border border-[#F05D67]/45 bg-[#F05D67]/10 px-4 py-3">
          <ShieldOff className="size-5 text-[#F05D67]" />
          <div>
            <p className="text-[12px] font-semibold text-[#F05D67]">Emergency stop is engaged</p>
            <p className="text-[10px] text-[#b98b8f]">
              New and queued active tests are refused until the stop is released.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-8">
          <Panel title="Authorized target" eyebrow="Exact allowlist" flush>
            <div className="grid gap-0 md:grid-cols-3">
              <div className="border-b border-[#1b2a3e] p-3 md:border-b-0 md:border-r">
                <p className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#60788f]">
                  Base URL
                </p>
                <p className="mt-1 font-mono text-[10px] text-[#27C7B8]">
                  {target?.baseUrl ?? application.baseUrl}
                </p>
                <p className="mt-1 text-[9px] text-[#60788f]">
                  {application.transport === "IN_PROCESS_LAB"
                    ? "In-process synthetic lab transport"
                    : application.transport}
                </p>
              </div>
              <div className="border-b border-[#1b2a3e] p-3 md:border-b-0 md:border-r">
                <p className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#60788f]">
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
                <p className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#60788f]">
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
            <div className="flex items-start gap-2 border-t border-[#1b2a3e] bg-[#0b1421] px-3 py-2.5">
              <LockKeyhole className="mt-0.5 size-3.5 shrink-0 text-[#35C98A]" />
              <p className="text-[9px] leading-relaxed text-[#7890a8]">
                Only HTTPS, host <span className="font-mono">lab.jaal.internal</span> and
                paths under <span className="font-mono">/api/</span> are authorized. Any
                other host, scheme or path is rejected before dispatch. External targets
                cannot be registered in this demonstration.
              </p>
            </div>
          </Panel>

          <Panel title="Execution limits" eyebrow="Request safety">
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
                onChange={(value) =>
                  setForm((current) => ({ ...current, maxConcurrency: value }))
                }
                hint="Per-target active test slots"
              />
              <NumberField
                label="Rate limit / minute"
                value={form.rateLimitPerMinute}
                min={1}
                max={120}
                onChange={(value) =>
                  setForm((current) => ({ ...current, rateLimitPerMinute: value }))
                }
                hint="Adaptive backoff applies"
              />
              <NumberField
                label="Zombie window (days)"
                value={form.zombieWindowDays}
                min={1}
                max={365}
                onChange={(value) =>
                  setForm((current) => ({ ...current, zombieWindowDays: value }))
                }
                hint="No legitimate traffic threshold"
              />
              <div className="border border-[#24364c] bg-[#0b1421] p-2.5">
                <p className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#60788f]">
                  Redirects
                </p>
                <p className="mt-1 font-mono text-[11px] text-[#F05D67]">DISABLED</p>
                <p className="mt-0.5 text-[8px] text-[#526a81]">
                  A redirect cannot escape the allowlist.
                </p>
              </div>
              <div className="border border-[#24364c] bg-[#0b1421] p-2.5">
                <p className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#60788f]">
                  Destructive methods
                </p>
                <p className="mt-1 font-mono text-[11px] text-[#F05D67]">REJECTED</p>
                <p className="mt-0.5 text-[8px] text-[#526a81]">GET and POST only.</p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#1b2a3e] pt-3">
              <label className="flex items-center gap-2 text-[10px] text-[#a6b7c9]">
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.approvalRequired}
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      approvalRequired: !current.approvalRequired,
                    }))
                  }
                  className={cn(
                    "relative h-4 w-8 border transition-colors",
                    form.approvalRequired
                      ? "border-[#35C98A]/50 bg-[#35C98A]/20"
                      : "border-[#2a3b52] bg-[#172235]",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 size-2.5 transition-all",
                      form.approvalRequired
                        ? "left-[17px] bg-[#35C98A]"
                        : "left-0.5 bg-[#60788f]",
                    )}
                  />
                </button>
                Require human approval for active tests
              </label>
              <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#526a81]">
                {form.approvalRequired ? "gate enabled" : "pre-approved lab only"}
              </span>
            </div>
          </Panel>

          <Panel title="Emergency stop" eyebrow="Global circuit breaker" flush>
            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center border",
                    policy?.emergencyStop
                      ? "border-[#F05D67]/50 bg-[#F05D67]/10"
                      : "border-[#24364c] bg-[#0b1421]",
                  )}
                >
                  <Power
                    className={cn(
                      "size-5",
                      policy?.emergencyStop ? "text-[#F05D67]" : "text-[#60788f]",
                    )}
                  />
                </div>
                <div>
                  <p className="text-[11px] font-medium text-[#d7e2ee]">
                    {policy?.emergencyStop ? "Stop is engaged" : "Stop is released"}
                  </p>
                  <p className="mt-0.5 max-w-lg text-[9px] leading-relaxed text-[#7890a8]">
                    Engaging the stop cancels queued investigations and refuses new
                    execution. Running workers check cancellation before each test.
                  </p>
                </div>
              </div>
              <ActionButton
                variant={policy?.emergencyStop ? "ghost" : "danger"}
                onClick={toggleStop}
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
                <AlertTriangle className="mt-0.5 size-4 text-[#F5C96A]" />
                <div>
                  <p className="text-[11px] text-[#d7e2ee]">
                    Lab mode:{" "}
                    <span className="font-mono text-[#F5C96A]">{lab?.mode ?? "—"}</span>
                  </p>
                  <p className="mt-0.5 max-w-lg text-[9px] leading-relaxed text-[#7890a8]">
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
                  className="flex items-start gap-2.5 border-b border-[#162436] px-4 py-2.5 last:border-b-0"
                >
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
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] leading-relaxed text-[#c7d3e2]">{event.message}</p>
                    <p className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.08em] text-[#526a81]">
                      {event.type} · {event.actor} · {formatTimestamp(event.at)}
                    </p>
                  </div>
                </div>
              ))}
              {audit.length === 0 && (
                <p className="p-4 text-[10px] text-[#60788f]">No audit events yet.</p>
              )}
            </div>
          </Panel>
        </div>

        <div className="space-y-4 xl:col-span-4">
          <Panel title="Test identities" eyebrow="Synthetic only">
            <div className="space-y-2">
              {ACTORS.map(([id, label, agency, role]) => (
                <div key={id} className="border border-[#1e3145] bg-[#0b1421] px-2.5 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-[10px] text-[#c7d3e2]">
                      <Users className="size-3 text-[#27C7B8]" /> {label}
                    </span>
                    <span className="font-mono text-[8px] text-[#60788f]">{agency}</span>
                  </div>
                  <p className="mt-1 font-mono text-[7px] uppercase tracking-[0.08em] text-[#526a81]">
                    {id} · {role}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-start gap-2 border-t border-[#1b2a3e] pt-3">
              <KeyRound className="mt-0.5 size-3.5 shrink-0 text-[#60788f]" />
              <p className="text-[9px] leading-relaxed text-[#60788f]">
                Test credentials are synthetic actor identifiers, never production
                secrets. No passwords or tokens are stored.
              </p>
            </div>
          </Panel>

          <Panel title="Safety posture" eyebrow="Implemented controls" flush>
            <div className="divide-y divide-[#162436]">
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
                  <span className="text-[10px] text-[#a6b7c9]">{label}</span>
                  {enabled ? (
                    <CheckCircle2 className="size-3.5 text-[#35C98A]" />
                  ) : (
                    <span className="font-mono text-[8px] uppercase tracking-[0.08em] text-[#60788f]">
                      off
                    </span>
                  )}
                </div>
              ))}
            </div>
          </Panel>

          <div className="border border-[#1b2a3e] bg-[#0d1623] p-3">
            <p className="flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.12em] text-[#27C7B8]">
              <Globe2 className="size-3" /> No external scanning
            </p>
            <p className="mt-2 text-[10px] leading-relaxed text-[#7890a8]">
              This deployment is deliberately limited to the isolated synthetic lab. It
              cannot be pointed at an arbitrary host from the interface.
            </p>
            <p className="mt-2 font-mono text-[8px] uppercase tracking-[0.08em] text-[#526a81]">
              Authorized by {target?.authorizedBy ?? "operator"} ·{" "}
              {relativeTime(target?.createdAt)}
            </p>
          </div>

          <Panel title="Danger zone" eyebrow="Reversible demo reset">
            <p className="text-[10px] leading-relaxed text-[#7890a8]">
              Delete this operator's DAST applications, investigations, findings,
              evidence and reports. The original JAAL forensic cases and reports are not
              touched.
            </p>
            <ActionButton
              variant="danger"
              onClick={reset}
              disabled={busy !== null}
              className="mt-3 w-full"
            >
              <RotateCcw className="size-3" />
              {busy === "reset" ? "Resetting…" : "Reset DAST workspace"}
            </ActionButton>
          </Panel>
        </div>
      </div>
    </>
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
    <label className="border border-[#24364c] bg-[#0b1421] p-2.5">
      <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#60788f]">
        {label}
      </span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1 h-7 w-full border border-[#2a3b52] bg-[#080f1a] px-2 font-mono text-[11px] text-[#F3F6FC] focus:border-[#27C7B8]/60 focus:outline-none"
      />
      <span className="mt-1 block text-[8px] text-[#526a81]">{hint}</span>
    </label>
  );
}
