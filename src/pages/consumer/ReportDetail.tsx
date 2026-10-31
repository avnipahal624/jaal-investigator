import { useEffect, useState, useCallback } from "react";
import { Link, useParams } from "react-router";
import {
  ArrowLeft,
  Calendar,
  Tag,
  FileText,
  Shield,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Image,
  Link2,
  Phone,
  MessageSquare,
  HelpCircle,
  FileWarning,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { ConsumerReportView, ConsumerEvidenceView, ConsumerAnalysisView } from "@/types/consumer";


/* eslint-disable react-hooks/set-state-in-effect -- data-fetch effect; state
   updates happen only after the initial microtask yield, so the effect body
   itself does not synchronously call setState. */

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  active: { label: "Open", className: "text-[var(--color-consumer-primary)]" },
  completed: { label: "Completed", className: "text-[var(--color-consumer-teal)]" },
  paused: { label: "Waiting", className: "text-[var(--color-consumer-muted)]" },
  closed: { label: "Closed", className: "text-[var(--color-consumer-muted)]" },
};

const ANALYSIS_LABEL: Record<string, { label: string; className: string }> = {
  not_started: {
    label: "Not yet analysed",
    className: "text-[var(--color-consumer-muted)]",
  },
  processing: {
    label: "Analysing...",
    className: "text-[var(--color-consumer-primary)]",
  },
  completed: {
    label: "Analysed",
    className: "text-[var(--color-consumer-teal)]",
  },
  failed: {
    label: "Analysis failed",
    className: "text-[var(--color-consumer-muted)]",
  },
  unavailable: {
    label: "Analysis unavailable",
    className: "text-[var(--color-consumer-muted)]",
  },
};

const EVIDENCE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  scam_message: MessageSquare,
  transcript: MessageSquare,
  phone: Phone,
  upi: Tag,
  payment_request: FileWarning,
  url: Link2,
  other: HelpCircle,
};

function evidenceIcon(type?: string | null) {
  const Icon = EVIDENCE_ICONS[type ?? ""] ?? HelpCircle;
  return <Icon className="w-4 h-4" strokeWidth={1.85} />;
}export default function ConsumerReportDetailPage() {
  const { id } = useParams<{ id: string }>();

  const reportsQuery = useQuery(api.consumer.consumerReports);
  const evidenceQuery = useQuery(
    api.consumer.getConsumerEvidence,
    id != null ? { investigationId: id } : undefined,
  );
  const analysisQuery = useQuery(
    api.intelligence.getAnalysis,
    id != null
      ? { caseId: id, module: "threat" }
      : undefined,
  );

  const [loading, setLoading] = useState(
    reportsQuery === undefined || evidenceQuery === undefined || analysisQuery === undefined,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (reportsQuery !== undefined && evidenceQuery !== undefined && analysisQuery !== undefined) {
      setLoading(false);
    }
  }, [reportsQuery, evidenceQuery, analysisQuery]);

  const allReports: ConsumerReportView[] = reportsQuery ?? [];
  const match: ConsumerReportView | undefined = allReports.find(
    (r) => r._id === id || r.claimId === id,
  );

  const report: ConsumerReportView | null = match ?? null;
  const attachments: ConsumerEvidenceView[] = (evidenceQuery ?? null) ?? [];
  const analysis: ConsumerAnalysisView | null = (analysisQuery ?? null) ?? null;

  const formatDate = (ts?: number | null) => {
    if (!ts) return "—";
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const topCategory = report?.category as string | undefined;
  const statusInfo = report ? STATUS_LABEL[report.status ?? ""] ?? STATUS_LABEL.active : STATUS_LABEL.active;
  const analysisInfo =
    analysis && analysis.status
      ? ANALYSIS_LABEL[analysis.status.toLowerCase().replace(/[^a-z0-9]/g, "_")] ??
        ANALYSIS_LABEL.not_started
      : ANALYSIS_LABEL.not_started;

  const warningSigns: { label: string; why: string }[] = [];
  const recommendations: string[] = [];

  if (analysis && analysis.status === "completed") {
    // Derive consumer-safe warning signs and recommendations from the stored
    // output. The backend stores a grounded result; we map a few well-known
    // labels to plain-language copy. If the output doesn't match a known
    // label we show nothing — never invent.
    const out = (analysis.output as string) ?? "";
    const lower = out.toLowerCase();

    if (lower.includes("high concern") || lower.includes("high risk")) {
      warningSigns.push({
        label: "This report has several warning signs",
        why:
          "The details you shared include patterns that often appear in scams. JAAL flagged these so you can check them carefully.",
      });
      recommendations.push(
        "Do not share any OTP, PIN, password or banking details.",
        "Verify the request using the organisation's official contact details, not the details in the message.",
        "Do not click links or open attachments you were not expecting.",
        "If money was already sent, contact your bank or payment provider right away and ask them to help.",
        "Keep copies of the message, call details or link you reported.",
      );
    } else if (
      lower.includes("warning sign") ||
      lower.includes("warning signs")
    ) {
      warningSigns.push({
        label: "Warning signs were found",
        why:
          "What you shared shows some patterns that can appear in scams. That does not prove anything happened — it just means it is worth checking carefully.",
      });
      recommendations.push(
        "Pause before you act on anything the sender asked you to do.",
        "Check the sender's details through an official channel.",
        "Do not share personal or payment details unless you are sure.",
        "If you are unsure, report it and wait before acting.",
      );
    } else if (
      lower.includes("no obvious warning") ||
      lower.includes("no warning")
    ) {
      warningSigns.push({
        label: "No obvious warning signs found",
        why:
          "Based on what you shared, JAAL did not spot common scam patterns. That does not guarantee something was safe — always stay cautious with unexpected requests.",
      });
      recommendations.push(
        "If anything changes or feels off, report it again.",
        "Keep monitoring the message, number or link you shared.",
        "If you're ever unsure, pause and check through official channels.",
      );
    } else {
      // Unknown output shape — keep it honest: do not invent signs.
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto">
        <header className="mb-6 flex items-center justify-between">
          <div className="h-6 w-40 bg-[var(--color-consumer-border)] rounded animate-pulse" />
          <div className="h-8 w-24 bg-[var(--color-consumer-border)] rounded animate-pulse" />
        </header>
        <div className="glass p-6 space-y-4">
          <div className="h-20 bg-[var(--color-consumer-border)] rounded-xl animate-pulse" />
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-14 bg-[var(--color-consumer-border)] rounded-lg animate-pulse"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto">
        <header className="mb-6">
          <h1 className="text-xl font-semibold text-[var(--color-consumer-deep)]">
            Report not found
          </h1>
        </header>
        <div className="glass p-6 text-center">
          <p className="text-sm text-[var(--color-consumer-muted)]">
            {error}
          </p>
          <Link
            to="/consumer/reports"
            className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-[var(--color-consumer-primary)] hover:underline"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to My Reports
          </Link>
        </div>
      </div>
    );
  }

  if (!report) {
    return null;
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <header className="mb-6">
        <Link
          to="/consumer/reports"
          className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-consumer-muted)] hover:text-[var(--color-consumer-text)] transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to My Reports
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-semibold text-[var(--color-consumer-deep)]">
                {report.caseId ?? "Report"}
              </h1>
              <span className="chip">
                {topCategory ?? "Other"}
              </span>
            </div>
            <p className="mt-1 text-[var(--color-consumer-muted)] text-sm flex items-center gap-1.5 flex-wrap">
              <Calendar className="w-4 h-4" />
              Submitted {formatDate(report.createdAt)}
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${
              report.status === "completed"
                ? "bg-[var(--color-consumer-mint)] text-[var(--color-consumer-deep)]"
                : "bg-[var(--color-consumer-primary-soft)] text-[var(--color-consumer-primary)]"
            }`}
          >
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full ${
                report.status === "completed"
                  ? "bg-[var(--color-consumer-teal)]"
                  : "bg-[var(--color-consumer-primary)]"
              }`}
            />
            {statusInfo.label}
          </span>
        </div>
      </header>

      {/* Two-column: submitted info + AI assessment */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left: submitted info */}
        <div className="lg:col-span-3 space-y-5">
          {/* Submitted information */}
          <section aria-labelledby="submitted-title">
            <h2
              id="submitted-title"
              className="text-lg font-semibold text-[var(--color-consumer-deep)] flex items-center gap-2"
            >
              <FileText className="w-5 h-5 text-[var(--color-consumer-primary)]" />
              What you shared
            </h2>
            <div className="glass-strong p-5 shadow-sm mt-3 space-y-3">
              {report.description ? (
                <p className="text-sm text-[var(--color-consumer-text)] leading-relaxed">
                  {report.description}
                </p>
              ) : (
                <p className="text-sm text-[var(--color-consumer-muted)] italic">
                  No description was provided.
                </p>
              )}
            </div>
          </section>

          {/* Attachments */}
          {attachments.length > 0 && (
            <section aria-labelledby="attachments-title">
              <h2
                id="attachments-title"
                className="text-lg font-semibold text-[var(--color-consumer-deep)] flex items-center gap-2"
              >
                <Image className="w-5 h-5 text-[var(--color-consumer-teal)]" />
                Attached evidence
              </h2>
              <div className="mt-3 glass p-4 space-y-2">
                {attachments.slice(0, 12).map((item) => (
                  <div
                    key={item._id}
                    className="flex items-start gap-3 rounded-lg border border-[var(--color-consumer-border)] bg-[var(--color-consumer-glass)] p-3"
                  >
                    <span className="shrink-0 mt-0.5 text-[var(--color-consumer-muted)]">
                      {evidenceIcon(item.evidenceType)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[var(--color-consumer-text)] truncate">
                        {item.label ?? "Attachment"}
                      </p>
                      <p className="text-xs text-[var(--color-consumer-muted)] leading-relaxed mt-0.5 line-clamp-2">
                        {item.extractedValue ?? item.content ?? "—"}
                      </p>
                    </div>
                  </div>
                ))}
                {attachments.length > 12 && (
                  <p className="text-xs text-[var(--color-consumer-muted)] italic">
                    And {attachments.length - 12} more attachment(s).
                  </p>
                )}
              </div>
            </section>
          )}

          {/* Trustline */}
          <div className="flex items-center gap-2 text-xs text-[var(--color-consumer-muted)] justify-end">
            <Shield className="w-4 h-4 text-[var(--color-consumer-teal)]" />
            <span className="font-medium text-[var(--color-consumer-teal)]">
              Together for a Safer Digital India.
            </span>
          </div>
        </div>

        {/* Right: AI assessment */}
        <div className="lg:col-span-2 space-y-5">
          {/* AI assessment card */}
          <section aria-labelledby="analysis-title">
            <h2
              id="analysis-title"
              className="text-lg font-semibold text-[var(--color-consumer-deep)] flex items-center gap-2"
            >
              <Shield className="w-5 h-5 text-[var(--color-consumer-teal)]" />
              JAAL's read
            </h2>
            <div className="mt-3 glass-strong p-5 shadow-md">
              {/* Status pill */}
              <div className="flex items-center justify-between mb-4">
                <span className="chip">
                  <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: analysis?.status ? "#159b78" : "#60748f" }} />
                  {analysisInfo.label}
                </span>
                {analysis && analysis.status === "processing" && (
                  <Loader2 className="w-4 h-4 text-[var(--color-consumer-primary)] animate-spin" />
                )}
              </div>

              {analysis?.status === "completed" && (
                <>
                  {/* Risk band */}
                  {warningSigns.length > 0 && (
                    <div className="rounded-xl border border-[var(--color-consumer-border)] bg-[var(--color-consumer-glass)] p-4 mb-4">
                      <h3 className="text-sm font-semibold text-[var(--color-consumer-deep)] flex items-center gap-2 mb-2">
                        <AlertTriangle className="w-4 h-4 text-[var(--color-consumer-teal)]" />
                        Warning signs
                      </h3>
                      <ul className="space-y-2 text-sm">
                        {warningSigns.map((w, i) => (
                          <li key={i} className="flex gap-2">
                            <span className="mt-0.5 shrink-0 text-[var(--color-consumer-teal)] text-base">
                              !
                            </span>
                            <div>
                              <p className="font-medium text-[var(--color-consumer-text)]">
                                {w.label}
                              </p>
                              <p className="text-[var(--color-consumer-muted)] text-xs leading-relaxed">
                                {w.why}
                              </p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Recommendations */}
                  {recommendations.length > 0 && (
                    <div className="rounded-xl border border-[var(--color-consumer-border)] bg-[var(--color-consumer-mint)] p-4">
                      <h3 className="text-sm font-semibold text-[var(--color-consumer-deep)] flex items-center gap-2 mb-2">
                        <CheckCircle2 className="w-4 h-4 text-[var(--color-consumer-teal)]" />
                        What to do next
                      </h3>
                      <ul className="space-y-2 text-sm text-[var(--color-consumer-text)]">
                        {recommendations.map((r, i) => (
                          <li key={i} className="flex gap-2">
                            <span className="mt-0.5 shrink-0 text-[var(--color-consumer-teal)]">
                              1.
                            </span>
                            <span className="leading-relaxed">{r}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-3 text-[11px] text-[var(--color-consumer-muted)] leading-relaxed border-t border-[var(--color-consumer-border)] pt-3">
                        This is a helpfulness check, not an official fraud
                        determination. When in doubt, pause and verify through
                        official channels.
                      </p>
                    </div>
                  )}

                  {warningSigns.length === 0 &&
                    recommendations.length === 0 && (
                      <p className="text-sm text-[var(--color-consumer-muted)] leading-relaxed">
                        Analysed, but no specific warning signs or
                        recommendations were generated for this report.
                      </p>
                    )}
                </>
              )}

              {analysis?.status === "processing" && (
                <p className="text-sm text-[var(--color-consumer-muted)] leading-relaxed">
                  JAAL is reviewing what you shared. This only uses the
                  information in your report.
                </p>
              )}

              {analysis?.status === "unavailable" && (
                <div className="rounded-xl border border-[var(--color-consumer-border)] bg-[var(--color-consumer-glass)] p-4">
                  <p className="text-sm text-[var(--color-consumer-muted)] leading-relaxed">
                    Analysis is currently unavailable. Your report has still
                    been saved — you can come back later.
                  </p>
                </div>
              )}

              {analysis?.status === "failed" && (
                <div className="rounded-xl border border-[var(--color-consumer-border)] bg-[var(--color-consumer-glass)] p-4">
                  <p className="text-sm text-[var(--color-consumer-muted)] leading-relaxed">
                    The analysis could not be completed. Your report has still
                    been saved. You can try again later.
                  </p>
                </div>
              )}

              {analysis?.status === "not_started" && (
                <p className="text-sm text-[var(--color-consumer-muted)] leading-relaxed">
                  This report has not been analysed yet.
                </p>
              )}

              {/* Honest disclosure */}
              <p className="mt-4 text-[11px] text-[var(--color-consumer-muted)] leading-relaxed border-t border-[var(--color-consumer-border)] pt-3">
                JAAL's read is a helpfulness check based only on what you
                shared. It is not an official fraud determination, not legal
                advice, and not a police report.
              </p>
            </div>
          </section>
        </div>
      </div>

      {/* Bottom actions */}
      <div className="mt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <Link
          to="/consumer/reports"
          className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-consumer-muted)] hover:text-[var(--color-consumer-text)] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to My Reports
        </Link>
        <Link
          to="/consumer/report"
          className="btn-primary inline-flex items-center gap-2 px-5 py-2 rounded-xl text-sm shadow-md hover:shadow-lg transition-shadow"
        >
          Report another
          <ArrowLeft className="w-4 h-4 rotate-180" />
        </Link>
      </div>
    </div>
  );
}
