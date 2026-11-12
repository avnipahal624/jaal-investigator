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
import { sha256Hex } from "@/utils/hash";
import { formatTimestamp, relativeTime } from "@/types/dast";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  CheckCircle2,
  Clipboard,
  Download,
  FileText,
  Fingerprint,
  RefreshCw,
  ShieldCheck,
  ShieldX,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";

export default function FindingDetailPage() {
  const { id } = useParams();
  const detail = useQuery(
    api.dast.finding,
    id ? { id: id as Id<"dastFindings"> } : "skip",
  );
  const retest = useMutation(api.dast.retestFinding);
  const [busy, setBusy] = useState(false);
  const [verification, setVerification] = useState<null | "match" | "mismatch" | "checking">(null);

  if (detail === undefined) {
    return <div className="py-16 text-center text-[11px] text-[#7890a8]">Loading finding…</div>;
  }
  if (!detail) {
    return (
      <div className="border border-[#1b2a3e] bg-[#101827] p-8 text-center">
        <p className="text-sm text-[#c7d3e2]">Finding not found.</p>
        <Link
          to="/security/vulnerabilities"
          className="mt-3 inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[#27C7B8]"
        >
          <ArrowLeft className="size-3" /> Back to vulnerability center
        </Link>
      </div>
    );
  }

  const { finding, evidence, retests, report } = detail;
  const primaryEvidence = evidence.find((row) => row.type === "HTTP_EXCHANGE") ?? evidence[0];
  const reproduction = (finding.reproduction ?? []) as Array<{
    step: number;
    action: string;
    expected: string;
    actual: string;
  }>;

  async function verifyEvidence() {
    if (!primaryEvidence) return;
    setVerification("checking");
    try {
      const recomputed = await sha256Hex(primaryEvidence.content);
      const match = recomputed === primaryEvidence.sha256;
      setVerification(match ? "match" : "mismatch");
      if (match) toast.success("SHA-256 matches the recorded evidence");
      else toast.error("Evidence hash does not match — treat this record as tampered");
    } catch {
      setVerification("mismatch");
      toast.error("Could not compute SHA-256");
    }
  }

  async function runRetest() {
    setBusy(true);
    try {
      const result = await retest({ id: finding._id });
      toast.success(`${result.findingId}: ${result.outcome}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Retest failed");
    } finally {
      setBusy(false);
    }
  }

  function downloadTicket() {
    const ticket = `# ${finding.title}

**Severity:** ${finding.severity}
**Finding:** ${finding.findingId}
**Owner:** ${finding.ownerTeam}
**Affected endpoint:** \`${finding.method} ${finding.path}\`
**Application:** Synthetic Travel Security Lab
**Deployment:** ${finding.deploymentVersion}

## Evidence
- SHA-256: \`${finding.evidenceHash}\`
- Confidence: ${(finding.confidence * 100).toFixed(0)}%
- Verification: ${finding.status}

## Business impact
${finding.businessImpact}

## Reproduction
${reproduction.map((step) => `${step.step}. ${step.action}\n   Expected: ${step.expected}\n   Actual: ${step.actual}`).join("\n")}

## Sanitized response
\`\`\`json
${finding.responseEvidence}
\`\`\`

## Root cause
${finding.rootCause}

## Recommended remediation
${finding.remediation}

## Acceptance criteria
- A control request from the owning agency still succeeds.
- A request from a different agency is refused with 403/404 and returns no traveller fields.
- A regression test using two synthetic agencies passes in CI.
`;
    const blob = new Blob([ticket], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${finding.findingId}-ticket.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader
        eyebrow={`VULNERABILITY / ${finding.findingId}`}
        title={finding.title}
        description={finding.businessImpact}
        actions={
          <>
            <Link to="/security/vulnerabilities">
              <ActionButton variant="ghost">
                <ArrowLeft className="size-3" /> All findings
              </ActionButton>
            </Link>
            <ActionButton variant="ghost" onClick={downloadTicket}>
              <Download className="size-3" /> Ticket draft
            </ActionButton>
            {report && (
              <Link to={`/security/reports/${report._id}`}>
                <ActionButton variant="ghost">
                  <FileText className="size-3" /> Full report
                </ActionButton>
              </Link>
            )}
            <ActionButton onClick={runRetest} disabled={busy || finding.status === "FIXED"}>
              <RefreshCw className={`size-3 ${busy ? "animate-spin" : ""}`} />
              {busy ? "Retesting…" : finding.status === "FIXED" ? "Fixed" : "Retest"}
            </ActionButton>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SeverityBadge severity={finding.severity} />
        <FindingStatusBadge status={finding.status} />
        <Chip tone="neutral">{finding.category}</Chip>
        <div className="flex items-center gap-1.5">
          <MethodBadge method={finding.method} />
          <span className="font-mono text-[10px] text-[#c7d3e2]">{finding.path}</span>
        </div>
        <span className="ml-auto font-mono text-[8px] uppercase tracking-[0.1em] text-[#526a81]">
          {finding.deploymentVersion} · discovered {relativeTime(finding.discoveredAt)}
        </span>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-8">
          <div className="grid gap-2.5 sm:grid-cols-3">
            <div className="border border-[#1b2a3e] bg-[#101827] p-3">
              <p className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#60788f]">
                Business severity
              </p>
              <p className="mt-1 text-lg font-semibold text-[#F05D67]">{finding.severity}</p>
            </div>
            <div className="border border-[#1b2a3e] bg-[#101827] p-3">
              <p className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#60788f]">
                Technical severity
              </p>
              <p className="mt-1 text-lg font-semibold text-[#F59E55]">
                {finding.technicalSeverity}
              </p>
            </div>
            <div className="border border-[#1b2a3e] bg-[#101827] p-3">
              <p className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#60788f]">
                Verification confidence
              </p>
              <p className="mt-1 text-lg font-semibold text-[#35C98A]">
                {(finding.confidence * 100).toFixed(0)}%
              </p>
            </div>
          </div>

          <Panel title="Business impact" eyebrow="Triage">
            <p className="text-[12px] leading-relaxed text-[#c7d3e2]">{finding.businessImpact}</p>
            <div className="mt-4 grid gap-3 border-t border-[#1b2a3e] pt-4 sm:grid-cols-2">
              <KeyValue label="Owner">{finding.ownerTeam}</KeyValue>
              <KeyValue label="Affected roles">
                {finding.affectedRoles.map((role) => role.replaceAll("_", " ")).join(", ")}
              </KeyValue>
              <KeyValue label="Expected behaviour">{finding.expected}</KeyValue>
              <KeyValue label="Actual behaviour">{finding.actual}</KeyValue>
            </div>
          </Panel>

          <Panel title="Reproduction" eyebrow="Deterministic control + attack">
            <ol className="space-y-3">
              {reproduction.map((step) => (
                <li key={step.step} className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center border border-[#24364c] bg-[#0b1421] font-mono text-[9px] text-[#27C7B8]">
                    {step.step}
                  </span>
                  <div>
                    <p className="text-[11px] leading-relaxed text-[#d7e2ee]">{step.action}</p>
                    <p className="mt-1 font-mono text-[9px] text-[#526a81]">
                      expected: {step.expected}
                    </p>
                    <p className="font-mono text-[9px] text-[#91A3BB]">actual: {step.actual}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-4 border border-[#F05D67]/25 bg-[#F05D67]/5 p-3">
              <p className="flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.12em] text-[#F05D67]">
                <ShieldX className="size-3" /> Why this is verified
              </p>
              <p className="mt-1.5 text-[10px] leading-relaxed text-[#b98b8f]">
                The control request succeeded, the attack request crossed the stated
                security boundary, and the evidence is a deterministic synthetic-lab
                response — not an LLM opinion. A generic 200 alone would not have been
                accepted.
              </p>
            </div>
          </Panel>

          <Panel
            title="Sanitized evidence"
            eyebrow="SHA-256 integrity"
            action={
              <ActionButton
                variant="ghost"
                onClick={verifyEvidence}
                disabled={!primaryEvidence || verification === "checking"}
              >
                <Fingerprint className="size-3" />
                {verification === "checking" ? "Hashing…" : "Verify hash"}
              </ActionButton>
            }
          >
            <div className="mb-3 flex flex-col gap-2 border border-[#1e3145] bg-[#0b1421] p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-2">
                <Fingerprint className="size-4 shrink-0 text-[#35C98A]" />
                <code className="truncate font-mono text-[9px] text-[#91A3BB]">
                  {finding.evidenceHash}
                </code>
              </div>
              <div className="flex items-center gap-2">
                {verification === "match" && (
                  <Chip tone="success" dot>
                    Integrity verified
                  </Chip>
                )}
                {verification === "mismatch" && (
                  <Chip tone="critical" dot>
                    Hash mismatch
                  </Chip>
                )}
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(finding.evidenceHash);
                    toast.success("Hash copied");
                  }}
                  className="text-[#60788f] hover:text-[#F3F6FC]"
                  aria-label="Copy hash"
                >
                  <Clipboard className="size-3.5" />
                </button>
              </div>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <div>
                <p className="mb-1 font-mono text-[8px] uppercase tracking-[0.12em] text-[#60788f]">
                  Request (sanitized)
                </p>
                <pre className="max-h-[260px] overflow-auto border border-[#1e3145] bg-[#080f1a] p-3 font-mono text-[9px] leading-relaxed text-[#9fb4c9]">
                  {finding.requestEvidence}
                </pre>
              </div>
              <div>
                <p className="mb-1 font-mono text-[8px] uppercase tracking-[0.12em] text-[#60788f]">
                  Response (sanitized)
                </p>
                <pre className="max-h-[260px] overflow-auto border border-[#1e3145] bg-[#080f1a] p-3 font-mono text-[9px] leading-relaxed text-[#9fb4c9]">
                  {finding.responseEvidence}
                </pre>
              </div>
            </div>
            <p className="mt-2 font-mono text-[8px] uppercase tracking-[0.1em] text-[#526a81]">
              Email, PNR, authorization and cookie fields are redacted. Only synthetic
              traveller records are present.
            </p>
          </Panel>

          <Panel title="Remediation" eyebrow="Owner action">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#F59E55]">
                  Root cause hypothesis
                </p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-[#c7d3e2]">
                  {finding.rootCause}
                </p>
              </div>
              <div>
                <p className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#35C98A]">
                  Recommended fix
                </p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-[#c7d3e2]">
                  {finding.remediation}
                </p>
              </div>
            </div>
          </Panel>
        </div>

        <div className="space-y-4 xl:col-span-4">
          <Panel title="Finding record" eyebrow="Provenance">
            <dl className="space-y-3">
              <KeyValue label="Finding ID">
                <span className="font-mono text-[10px] text-[#27C7B8]">{finding.findingId}</span>
              </KeyValue>
              <KeyValue label="Discovered">{formatTimestamp(finding.discoveredAt)}</KeyValue>
              <KeyValue label="Verified">{formatTimestamp(finding.verifiedAt)}</KeyValue>
              <KeyValue label="Deployment">{finding.deploymentVersion}</KeyValue>
              <KeyValue label="Retest status">{finding.retestStatus}</KeyValue>
            </dl>
          </Panel>

          <Panel title={`Retest history (${retests.length})`} eyebrow="Fixed-config replay">
            {retests.length === 0 ? (
              <div className="text-[10px] leading-relaxed text-[#60788f]">
                No retest yet. The retest button switches the synthetic lab to its fixed
                configuration and replays the original approved test.
              </div>
            ) : (
              <div className="space-y-2">
                {retests.map((retestRow) => (
                  <div key={retestRow._id} className="border border-[#1e3145] bg-[#0b1421] p-2.5">
                    <div className="flex items-center justify-between">
                      <span
                        className={
                          retestRow.outcome === "FIXED"
                            ? "text-[#35C98A]"
                            : "text-[#F05D67]"
                        }
                      >
                        {retestRow.outcome === "FIXED" ? (
                          <span className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.08em]">
                            <CheckCircle2 className="size-3" /> Fixed
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.08em]">
                            <XCircle className="size-3" /> Still vulnerable
                          </span>
                        )}
                      </span>
                      <span className="font-mono text-[8px] text-[#526a81]">
                        {relativeTime(retestRow.completedAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-[9px] leading-relaxed text-[#7890a8]">
                      {retestRow.detail}
                    </p>
                    {retestRow.evidenceHash && (
                      <p className="mt-1 truncate font-mono text-[7px] text-[#526a81]">
                        SHA-256 {retestRow.evidenceHash}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Evidence artifacts" eyebrow="Chain of custody" flush>
            <div className="divide-y divide-[#162436]">
              {evidence.map((row) => (
                <div key={row._id} className="px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#60788f]">
                      {row.type.replaceAll("_", " ")}
                    </span>
                    <ShieldCheck className="size-3 text-[#35C98A]" />
                  </div>
                  <p className="mt-1 text-[10px] text-[#c7d3e2]">{row.label}</p>
                  <p className="mt-0.5 truncate font-mono text-[7px] text-[#526a81]">
                    {row.sha256}
                  </p>
                </div>
              ))}
            </div>
          </Panel>

          <div className="border border-[#1b2a3e] bg-[#0d1623] p-3">
            <p className="flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.12em] text-[#F5C96A]">
              <ShieldX className="size-3" /> Scoped disclosure
            </p>
            <p className="mt-2 text-[10px] leading-relaxed text-[#7890a8]">
              This finding was reproduced only against JAAL's isolated synthetic travel
              lab. It is not a claim about any production TBO endpoint.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
