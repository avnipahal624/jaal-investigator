import {
  ActionButton,
  Chip,
  EmptyState,
  PageHeader,
  Panel,
} from "@/components/security/ui";
import { api } from "@/convex/_generated/api";
import { formatTimestamp, relativeTime } from "@/types/dast";
import { useQuery } from "convex/react";
import { ArrowRight, FileText, Printer, ShieldCheck } from "lucide-react";
import { Link } from "react-router";

export default function ReportsPage() {
  const reports = useQuery(api.dast.reports);
  const findings = useQuery(api.dast.findings);

  return (
    <>
      <PageHeader
        eyebrow="RESPOND / REPORT CENTER"
        title="Reports"
        description="Professional investigation reports generated from persisted findings, endpoint inventory, safety telemetry and retest history. Nothing in a report is fabricated."
        actions={
          <Link to="/security/vulnerabilities">
            <ActionButton variant="ghost">
              <ShieldCheck className="size-3" /> Verified findings
            </ActionButton>
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <SmallStat label="Reports" value={reports?.length ?? 0} />
        <SmallStat label="Verified findings" value={findings?.length ?? 0} />
        <SmallStat
          label="Critical"
          value={(findings ?? []).filter((finding) => finding.severity === "CRITICAL").length}
        />
        <SmallStat
          label="Fixed"
          value={(findings ?? []).filter((finding) => finding.status === "FIXED").length}
        />
      </div>

      {!reports || reports.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon={<FileText className="size-5" />}
            title="No reports generated"
            body="A report is generated automatically when an approved investigation completes. It contains the actual verified findings and measured execution telemetry."
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
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {reports.map((report) => (
            <Panel key={report._id} className="flex flex-col" flush>
              <div className="flex items-start justify-between gap-2 border-b border-[#1b2a3e] p-4">
                <div className="flex size-9 items-center justify-center border border-[#27C7B8]/30 bg-[#27C7B8]/8">
                  <FileText className="size-4 text-[#27C7B8]" />
                </div>
                <Chip tone={report.findingCount > 0 ? "critical" : "success"}>
                  {report.findingCount > 0 ? `${report.findingCount} findings` : "clean"}
                </Chip>
              </div>
              <div className="flex-1 p-4">
                <p className="text-[12px] font-medium leading-snug text-[#d7e2ee]">
                  {report.title}
                </p>
                <p className="mt-2 text-[10px] leading-relaxed text-[#7890a8]">
                  {report.summary}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[#1b2a3e] pt-3">
                  <div>
                    <p className="font-mono text-[7px] uppercase tracking-[0.1em] text-[#526a81]">
                      Generated
                    </p>
                    <p className="mt-0.5 text-[9px] text-[#a6b7c9]">
                      {relativeTime(report.generatedAt)}
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-[7px] uppercase tracking-[0.1em] text-[#526a81]">
                      Status
                    </p>
                    <p className="mt-0.5 font-mono text-[9px] uppercase text-[#35C98A]">
                      {report.status}
                    </p>
                  </div>
                </div>
                <p className="mt-2 font-mono text-[7px] text-[#526a81]">
                  {formatTimestamp(report.generatedAt)}
                </p>
              </div>
              <div className="flex items-center justify-between border-t border-[#1b2a3e] p-3">
                <span className="flex items-center gap-1 font-mono text-[8px] uppercase tracking-[0.08em] text-[#60788f]">
                  <Printer className="size-3" /> print / pdf
                </span>
                <Link to={`/security/reports/${report._id}`}>
                  <ActionButton variant="ghost">
                    Open report <ArrowRight className="size-3" />
                  </ActionButton>
                </Link>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </>
  );
}

function SmallStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border border-[#1b2a3e] bg-[#101827] px-3 py-2.5">
      <p className="font-mono text-[8px] uppercase tracking-[0.12em] text-[#60788f]">{label}</p>
      <p className="mt-1 text-lg font-semibold text-[#F3F6FC]">{value}</p>
    </div>
  );
}
