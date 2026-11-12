import { ActionButton, Chip, PageHeader } from "@/components/security/ui";
import { MarkdownView } from "@/components/security/MarkdownView";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatTimestamp } from "@/types/dast";
import { useQuery } from "convex/react";
import {
  ArrowLeft,
  Braces,
  Download,
  FileDown,
  FileText,
  Printer,
  ShieldCheck,
} from "lucide-react";
import { Link, useParams } from "react-router";

export default function ReportDetailPage() {
  const { id } = useParams();
  const report = useQuery(
    api.dast.report,
    id ? { id: id as Id<"dastReports"> } : "skip",
  );

  if (report === undefined) {
    return <div className="py-16 text-center text-[11px] text-[#9FB3C8]">Loading report…</div>;
  }
  if (!report) {
    return (
      <div className="border border-[#24344F] bg-[#152238] p-8 text-center">
        <p className="text-sm text-[#C7D5E5]">Report not found.</p>
        <Link
          to="/security/reports"
          className="mt-3 inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[#2DD4BF]"
        >
          <ArrowLeft className="size-3" /> Back to reports
        </Link>
      </div>
    );
  }

  function download(content: string, name: string, type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const safeName = report.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  return (
    <>
      <div className="security-no-print">
        <PageHeader
          eyebrow="REPORT / VERIFIED INVESTIGATION"
          title={report.title}
          description={`${report.summary} Generated ${formatTimestamp(report.generatedAt)}.`}
          actions={
            <>
              <Link to="/security/reports">
                <ActionButton variant="ghost">
                  <ArrowLeft className="size-3" /> Reports
                </ActionButton>
              </Link>
              <ActionButton
                variant="ghost"
                onClick={() =>
                  download(report.markdown, `${safeName}.md`, "text/markdown")
                }
              >
                <FileDown className="size-3" /> Markdown
              </ActionButton>
              <ActionButton
                variant="ghost"
                onClick={() =>
                  download(
                    JSON.stringify(
                      {
                        title: report.title,
                        summary: report.summary,
                        generatedAt: new Date(report.generatedAt).toISOString(),
                        findingCount: report.findingCount,
                        metrics: report.metrics,
                        markdown: report.markdown,
                      },
                      null,
                      2,
                    ),
                    `${safeName}.json`,
                    "application/json",
                  )
                }
              >
                <Braces className="size-3" /> JSON
              </ActionButton>
              <ActionButton onClick={() => window.print()}>
                <Printer className="size-3" /> Print / save PDF
              </ActionButton>
            </>
          }
        />
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Chip tone={report.findingCount > 0 ? "critical" : "success"} dot>
            {report.findingCount} verified findings
          </Chip>
          <Chip tone="neutral">
            <FileText className="size-3" /> {report.status}
          </Chip>
          <Chip tone="teal">
            <ShieldCheck className="size-3" /> synthetic lab
          </Chip>
          <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#6B8199]">
            Report ID {report._id}
          </span>
        </div>
      </div>

      <div className="security-report-print mx-auto max-w-[900px] border border-[#24344F] bg-[#0c1521] p-6 sm:p-8">
        <div className="mb-6 flex items-center justify-between border-b border-[#1e3044] pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center border border-[#2DD4BF]/40 bg-[#2DD4BF]/10">
              <span className="font-mono text-[10px] font-bold text-[#2DD4BF]">JA</span>
            </div>
            <div>
              <p className="text-[11px] font-bold tracking-[0.22em] text-[#E5EDF5]">JAAL</p>
              <p className="font-mono text-[7px] uppercase tracking-[0.16em] text-[#7E93A8]">
                Agentic DAST · verified investigation
              </p>
            </div>
          </div>
          <div className="text-right font-mono text-[8px] uppercase tracking-[0.1em] text-[#6B8199]">
            <p>Synthetic Travel Lab</p>
            <p>{formatTimestamp(report.generatedAt)}</p>
          </div>
        </div>
        <MarkdownView markdown={report.markdown} />
        <div className="mt-8 flex items-center justify-between border-t border-[#1e3044] pt-3 font-mono text-[7px] uppercase tracking-[0.1em] text-[#6B8199]">
          <span>Owner-scoped · sanitized evidence · no external targets</span>
          <span className="flex items-center gap-1">
            <Download className="size-3" /> {safeName}.pdf via browser print
          </span>
        </div>
      </div>
    </>
  );
}
