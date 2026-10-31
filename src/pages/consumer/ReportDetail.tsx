import { useQuery } from "convex/react";
import { Link, useParams } from "react-router";
import type { Id } from "@/convex/_generated/dataModel";
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

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  active: { label: "Open", className: "text-[var(--color-consumer-primary)]" },
  completed: {
    label: "Completed",
    className: "text-[var(--color-consumer-teal)]",
  },
  archived: { label: "Archived", className: "text-[var(--color-consumer-muted)]" },
};

const ANALYSIS_LABEL: Record<string, string> = {
  PROCESSING: "Analysing...",
  COMPLETED: "Analysed",
  FAILED: "Analysis failed",
  UNAVAILABLE: "Analysis unavailable",
};

/** Map an AI finding category to a plain-language warning-sign title. */
const FINDING_TITLE: Record<string, string> = {
  SOCIAL_ENGINEERING: "Tries to manipulate you",
  PSYCHOLOGICAL_MANIPULATION: "Uses pressure, fear or urgency",
  FINANCIAL_MANIPULATION: "Asks for money or payment",
  INFORMATION_EXTRACTION: "Asks for personal or account details",
  CONVERSATION_BEHAVIOUR: "Unusual communication pattern",
};

const EVIDENCE_ICONS: Record<
  string,
  React.ComponentType<{ className?: string; strokeWidth?: number }>
> = {
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
}

/** Defensive extraction of the consumer-facing assessment from AI output. */
function readThreatOutput(output: unknown): {
  overview: string | null;
  findings: { title: string; severity: string; explanation: string; action: string }[];
  steps: string[];
} {
  if (!output || typeof output !== "object") {
    return { overview: null, findings: [], steps: [] };
  }
  const o = output as {
    overview?: unknown;
    findings?: unknown;
    recommendedSteps?: unknown;
  };
  const overview = typeof o.overview === "string" ? o.overview : null;
  const findings = Array.isArray(o.findings)
    ? o.findings
        .filter((f): f is Record<string, unknown> => !!f && typeof f === "object")
        .map((f) => ({
          title:
            typeof f.tactic === "string" && f.tactic
              ? f.tactic
              : (FINDING_TITLE[String(f.category ?? "")] ?? "Warning sign"),
          severity: typeof f.severity === "string" ? f.severity : "",
          explanation:
            typeof f.explanation === "string" ? f.explanation : "",
          action:
            typeof f.recommendedAction === "string" ? f.recommendedAction : "",
        }))
        .filter((f) => f.explanation)
    : [];
  const steps = Array.isArray(o.recommendedSteps)
    ? o.recommendedSteps.filter((s): s is string => typeof s === "string")
    : [];
  return { overview, findings, steps };
}

export default function ConsumerReportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const reportId = id as Id<"investigations"> | undefined;

  const reportsQuery = useQuery(api.consumer.consumerReports);
  const evidenceQuery = useQuery(
    api.consumer.getConsumerEvidence,
    reportId ? { investigationId: reportId } : "skip",
  );

  const report = reportsQuery?.find((r) => r._id === id) ?? null;
  const caseId = report?.caseId ?? null;
  const analysisQuery = useQuery(
    api.intelligence.getAnalysis,
    caseId ? { caseId, module: "threat" } : "skip",
  );

  const loading = reportsQuery === undefined;
  const attachments = evidenceQuery ?? [];
  const analysis = analysisQuery ?? null;
  const threat = readThreatOutput(analysis?.output);

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

  const statusInfo = report
    ? STATUS_LABEL[report.status] ?? STATUS_LABEL.active
    : STATUS_LABEL.active;

  const analysisLabel = analysis
    ? ANALYSIS_LABEL[analysis.status] ?? "Not yet analysed"
    : "Not yet analysed";

  // Overall assessment label based on grounded findings severity.
  const overallAssessment =
    analysis?.status === "COMPLETED"
      ? threat.findings.some((f) => f.severity.toLowerCase() === "high")
        ? "High Concern"
        : threat.findings.length > 0
        ? "Warning Signs Found"
        : "No Obvious Warning Signs"
      : analysis?.status === "UNAVAILABLE" || analysis?.status === "FAILED"
      ? "Unable to Assess"
      : null;

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto" aria-busy="true">
        <header className="mb-6">
          <div className="h-6 w-40 bg-[var(--color-consumer-border)] rounded animate-pulse" />
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
        <span className="sr-only">Loading report…</span>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="max-w-2xl mx-auto">
        <header className="mb-6">
          <h1 className="text-xl font-semibold text-[var(--color-consumer-deep)]">
            Report not found
          </h1>
        </header>
        <div className="glass p-6 text-center">
          <p className="text-sm text-[var(--color-consumer-muted)]">
            We couldn't find this report. It may have been removed, or it
            doesn't belong to your account.
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
              <span className="chip">{report.category ?? "Other"}</span>
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
          <section aria-labelledby="submitted-title">
            <h2
              id="submitted-title"
              className="text-lg font-semibold text-[var(--color-consumer-deep)] flex items-center gap-2"
            >
              <FileText className="w-5 h-5 text-[var(--color-consumer-primary)]" />
              What you shared
            </h2>
            <div className="glass-strong p-5 shadow-sm mt-3 space-y-3">
              <p className="text-sm text-[var(--color-consumer-text)] leading-relaxed">
                {report.description || "No description was provided."}
              </p>
            </div>
          </section>

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

          <div className="flex items-center gap-2 text-xs text-[var(--color-consumer-muted)] justify-end">
            <Shield className="w-4 h-4 text-[var(--color-consumer-teal)]" />
            <span className="font-medium text-[var(--color-consumer-teal)]">
              Together for a Safer Digital India.
            </span>
          </div>
        </div>

        {/* Right: AI assessment */}
        <div className="lg:col-span-2 space-y-5">
          <section aria-labelledby="analysis-title">
            <h2
              id="analysis-title"
              className="text-lg font-semibold text-[var(--color-consumer-deep)] flex items-center gap-2"
            >
              <Shield className="w-5 h-5 text-[var(--color-consumer-teal)]" />
              JAAL's read
            </h2>
            <div className="mt-3 glass-strong p-5 shadow-md">
              <div className="flex items-center justify-between mb-4">
                <span className="chip">
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full"
                    style={{
                      background: analysis?.status === "COMPLETED" ? "#159b78" : "#60748f",
                    }}
                  />
                  {analysisLabel}
                </span>
                {analysis?.status === "PROCESSING" && (
                  <Loader2 className="w-4 h-4 text-[var(--color-consumer-primary)] animate-spin" />
                )}
              </div>

              {overallAssessment && (
                <div className="rounded-xl border border-[var(--color-consumer-border)] bg-[var(--color-consumer-glass)] p-4 mb-4">
                  <p className="text-sm font-semibold text-[var(--color-consumer-deep)]">
                    Overall assessment
                  </p>
                  <p className="mt-1 text-[var(--color-consumer-text)] text-sm leading-relaxed">
                    {overallAssessment}
                  </p>
                  {threat.overview && (
                    <p className="mt-2 text-[var(--color-consumer-muted)] text-xs leading-relaxed">
                      {threat.overview}
                    </p>
                  )}
                </div>
              )}

              {analysis?.status === "COMPLETED" && threat.findings.length > 0 && (
                <div className="rounded-xl border border-[var(--color-consumer-border)] bg-[var(--color-consumer-glass)] p-4 mb-4">
                  <h3 className="text-sm font-semibold text-[var(--color-consumer-deep)] flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-[var(--color-consumer-teal)]" />
                    Warning signs
                  </h3>
                  <ul className="space-y-3 text-sm">
                    {threat.findings.map((f, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="mt-0.5 shrink-0 text-[var(--color-consumer-teal)] text-base">
                          !
                        </span>
                        <div>
                          <p className="font-medium text-[var(--color-consumer-text)]">
                            {f.title}
                          </p>
                          <p className="text-[var(--color-consumer-muted)] text-xs leading-relaxed">
                            {f.explanation}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {analysis?.status === "COMPLETED" && threat.steps.length > 0 && (
                <div className="rounded-xl border border-[var(--color-consumer-border)] bg-[var(--color-consumer-mint)] p-4">
                  <h3 className="text-sm font-semibold text-[var(--color-consumer-deep)] flex items-center gap-2 mb-2">
                    <CheckCircle2 className="w-4 h-4 text-[var(--color-consumer-teal)]" />
                    What to do next
                  </h3>
                  <ul className="space-y-2 text-sm text-[var(--color-consumer-text)]">
                    {threat.steps.map((r, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="mt-0.5 shrink-0 text-[var(--color-consumer-teal)]">
                          {i + 1}.
                        </span>
                        <span className="leading-relaxed">{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {analysis?.status === "PROCESSING" && (
                <p className="text-sm text-[var(--color-consumer-muted)] leading-relaxed">
                  JAAL is reviewing what you shared. This only uses the
                  information in your report.
                </p>
              )}

              {(analysis?.status === "UNAVAILABLE" ||
                analysis?.status === "FAILED") && (
                <div className="rounded-xl border border-[var(--color-consumer-border)] bg-[var(--color-consumer-glass)] p-4">
                  <p className="text-sm text-[var(--color-consumer-muted)] leading-relaxed">
                    Analysis is currently unavailable, but your report has
                    still been saved. You can check back later.
                  </p>
                </div>
              )}

              {(!analysis || analysis.status === undefined) && (
                <p className="text-sm text-[var(--color-consumer-muted)] leading-relaxed">
                  This report has not been analysed yet.
                </p>
              )}

              {analysis?.limitations && analysis.limitations.length > 0 && (
                <ul className="mt-4 space-y-1 text-[11px] text-[var(--color-consumer-muted)] leading-relaxed border-t border-[var(--color-consumer-border)] pt-3">
                  {analysis.limitations.map((l, i) => (
                    <li key={i}>• {l}</li>
                  ))}
                </ul>
              )}

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
