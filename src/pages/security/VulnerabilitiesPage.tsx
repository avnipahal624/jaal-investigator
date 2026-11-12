import {
  ActionButton,
  ConfirmDialog,
  EmptyState,
  FindingStatusBadge,
  MethodBadge,
  PageHeader,
  SeverityBadge,
} from "@/components/security/ui";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { relativeTime, SEVERITY_ORDER } from "@/types/dast";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowRight,
  Fingerprint,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";

export default function VulnerabilitiesPage() {
  const findings = useQuery(api.dast.findings);
  const retestAll = useMutation(api.dast.retestAll);
  const [severity, setSeverity] = useState("ALL");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (findings ?? []).filter((finding) => {
      if (severity !== "ALL" && finding.severity !== severity) return false;
      if (
        term &&
        !`${finding.findingId} ${finding.title} ${finding.path} ${finding.category} ${finding.ownerTeam}`
          .toLowerCase()
          .includes(term)
      ) {
        return false;
      }
      return true;
    });
  }, [findings, severity, query]);

  const counts = useMemo(() => {
    const all = findings ?? [];
    return {
      total: all.length,
      critical: all.filter((finding) => finding.severity === "CRITICAL").length,
      verified: all.filter((finding) => finding.status === "VERIFIED").length,
      fixed: all.filter((finding) => finding.status === "FIXED").length,
    };
  }, [findings]);

  async function retest() {
    setBusy(true);
    try {
      const result = await retestAll({ confirmed: true });
      toast.success(
        `Retest complete · ${result.fixed} fixed · ${result.stillVulnerable} still vulnerable`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Retest failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="RESPOND / VERIFIED FINDINGS"
        title="Vulnerability center"
        description="Only candidates that passed an independent control + attack assertion appear here. Every row carries sanitized evidence, a SHA-256 hash, an owner and a retest history."
        actions={
          <ActionButton
            variant="ghost"
            onClick={() => setConfirmOpen(true)}
            disabled={busy || !findings?.length}
          >
            <RefreshCw className={cn("size-3", busy && "animate-spin")} />
            {busy ? "Retesting…" : "Apply fix & retest all"}
          </ActionButton>
        }
      />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {[
          ["Verified findings", counts.total, "text-[#E5EDF5]"],
          ["Critical", counts.critical, "text-[#F87171]"],
          ["Currently verified", counts.verified, "text-[#F5B942]"],
          ["Fixed by retest", counts.fixed, "text-[#34D399]"],
        ].map(([label, value, tone]) => (
          <div key={String(label)} className="border border-[#24344F] bg-[#152238] px-3 py-2.5">
            <p className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#7E93A8]">
              {label}
            </p>
            <p className={cn("mt-1 text-xl font-semibold tabular-nums", String(tone))}>{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 border border-[#24344F] bg-[#152238]">
        <div className="flex flex-col gap-2 border-b border-[#24344F] p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#6B8199]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search finding, endpoint or owner…"
              className="h-8 w-full border border-[#2A3B55] bg-[#0F1B2D] pl-8 pr-3 text-[11px] text-[#d7e2ee] placeholder:text-[#4d647a] focus:border-[#2DD4BF]/60 focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {["ALL", ...SEVERITY_ORDER].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setSeverity(value)}
                className={cn(
                  "border px-2 py-1 font-mono text-[8px] uppercase tracking-[0.08em]",
                  severity === value
                    ? "border-[#2DD4BF]/50 bg-[#2DD4BF]/10 text-[#2DD4BF]"
                    : "border-[#2A3B55] text-[#9FB3C8] hover:text-[#E5EDF5]",
                )}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        {!findings || findings.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<ShieldCheck className="size-5" />}
              title="No verified findings yet"
              body="This is the honest state before execution. Run an investigation, approve its plans, and only reproducible boundary violations will appear here."
              action={
                <Link to="/security/investigations">
                  <ActionButton>
                    Open investigations <ArrowRight className="size-3" />
                  </ActionButton>
                </Link>
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-left">
              <thead>
                <tr className="border-b border-[#24344F] bg-[#0c1521]">
                  {[
                    "Finding",
                    "Vulnerability",
                    "Severity",
                    "Endpoint",
                    "Business impact",
                    "Verification",
                    "Owner",
                    "Status",
                    "Discovered",
                  ].map((header) => (
                    <th
                      key={header}
                      className="whitespace-nowrap px-3 py-2 font-mono text-[8px] uppercase tracking-[0.11em] text-[#7E93A8]"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((finding) => (
                  <tr
                    key={finding._id}
                    className="border-b border-[#1B2C45] transition-colors last:border-b-0 hover:bg-[#1B2C45]"
                  >
                    <td className="px-3 py-2.5">
                      <Link
                        to={`/security/vulnerabilities/${finding._id}`}
                        className="font-mono text-[9px] text-[#2DD4BF] hover:text-[#5EEAD4]"
                      >
                        {finding.findingId}
                      </Link>
                    </td>
                    <td className="max-w-[260px] px-3 py-2.5">
                      <Link
                        to={`/security/vulnerabilities/${finding._id}`}
                        className="block truncate text-[10px] text-[#d7e2ee] hover:text-white"
                      >
                        {finding.title}
                      </Link>
                      <p className="mt-0.5 truncate font-mono text-[8px] uppercase tracking-[0.06em] text-[#6B8199]">
                        {finding.category}
                      </p>
                    </td>
                    <td className="px-3 py-2.5">
                      <SeverityBadge severity={finding.severity} />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <MethodBadge method={finding.method} />
                        <span className="max-w-[150px] truncate font-mono text-[8px] text-[#9FB3C8]">
                          {finding.path}
                        </span>
                      </div>
                    </td>
                    <td className="max-w-[230px] px-3 py-2.5 text-[9px] leading-relaxed text-[#9FB3C8]">
                      <span className="line-clamp-2">{finding.businessImpact}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1 font-mono text-[8px] uppercase tracking-[0.06em] text-[#34D399]">
                        <ShieldX className="size-3" /> {finding.status}
                      </span>
                      <p className="mt-0.5 font-mono text-[7px] text-[#6B8199]">
                        {(finding.confidence * 100).toFixed(0)}% confidence
                      </p>
                    </td>
                    <td className="max-w-[150px] px-3 py-2.5 text-[9px] text-[#9FB3C8]">
                      <span className="line-clamp-2">{finding.ownerTeam}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <FindingStatusBadge status={finding.status} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[8px] text-[#6B8199]">
                      {relativeTime(finding.discoveredAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && (
              <p className="p-6 text-center text-[11px] text-[#7E93A8]">
                No findings match the current filters.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
        {[
          { icon: Fingerprint, label: "Evidence integrity", text: "Recompute the SHA-256 from the sanitized exchange and compare it with the recorded hash." },
          { icon: ShieldAlert, label: "Business impact", text: "Technical severity is stored separately from the travel-specific business consequence." },
          { icon: RefreshCw, label: "Retest evidence", text: "Retests replay the original approved test against the fixed lab configuration." },
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

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Apply the fixed configuration and retest?"
        description="This switches the synthetic lab to FIXED and replays every verified finding. Only a passing control with no violation becomes FIXED. No external target is contacted."
        details={
          <span>
            {counts.total} verified finding(s) will be replayed with fresh sanitized evidence.
          </span>
        }
        confirmLabel="Apply fix & retest"
        busy={busy}
        onConfirm={() => {
          setConfirmOpen(false);
          void retest();
        }}
      />
    </>
  );
}
