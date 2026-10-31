import { useQuery } from "convex/react";
import { useState } from "react";
import { Link } from "react-router";
import { ArrowRight, Inbox } from "lucide-react";
import { api } from "@/convex/_generated/api";

export default function ConsumerReportsPage() {
  const reportsQuery = useQuery(api.consumer.consumerReports);
  const [filter, setFilter] = useState<"all" | "open" | "completed">("all");

  const loading = reportsQuery === undefined;
  const reports = reportsQuery ?? [];

  const filtered =
    filter === "all"
      ? reports
      : filter === "open"
      ? reports.filter((r) => r.status !== "completed")
      : reports.filter((r) => r.status === "completed");

  const formatDate = (ts?: number | null) => {
    if (!ts) return "—";
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const empty = loading ? (
    <div className="glass p-8 text-center space-y-2" aria-busy="true">
      <div className="h-5 w-32 mx-auto bg-[var(--color-consumer-border)] rounded animate-pulse" />
      <div className="h-4 w-48 mx-auto bg-[var(--color-consumer-border)] rounded animate-pulse" />
      <span className="sr-only">Loading your reports…</span>
    </div>
  ) : reports.length === 0 ? (
    <div className="glass p-8 text-center">
      <Inbox className="w-8 h-8 text-[var(--color-consumer-muted)] mx-auto" />
      <p className="mt-3 text-[var(--color-consumer-muted)] text-sm">
        You haven't submitted any reports yet.
      </p>
      <Link
        to="/consumer/report"
        className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-[var(--color-consumer-primary)] hover:underline"
      >
        Report a suspicious activity
        <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  ) : filtered.length === 0 ? (
    <div className="glass p-6 text-center">
      <p className="text-sm text-[var(--color-consumer-muted)]">
        No reports match this filter.
      </p>
    </div>
  ) : (
    <div className="space-y-3">
      {filtered.map((report) => (
        <Link
          key={report._id}
          to={`/consumer/reports/${report._id}`}
          className="glass block p-4 hover:shadow-md transition-shadow text-left"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-sm font-semibold text-[var(--color-consumer-deep)]">
                  {report.caseId ?? "—"}
                </span>
                <span className="chip text-[11px]">
                  {report.category ?? "Other"}
                </span>
              </div>
              <p className="mt-1 text-sm text-[var(--color-consumer-text)] truncate max-w-prose">
                {report.title ?? "Report"}
              </p>
            </div>
            <div className="shrink-0 text-right flex flex-col items-end gap-1">
              <span className="text-xs text-[var(--color-consumer-muted)]">
                {formatDate(report.createdAt)}
              </span>
              <span
                className={`inline-flex items-center gap-1 text-xs font-medium ${
                  report.status === "completed"
                    ? "text-[var(--color-consumer-teal)]"
                    : "text-[var(--color-consumer-primary)]"
                }`}
              >
                <span
                  className={`inline-block w-1.5 h-1.5 rounded-full ${
                    report.status === "completed"
                      ? "bg-[var(--color-consumer-teal)]"
                      : "bg-[var(--color-consumer-primary)]"
                  }`}
                />
                {report.status === "completed" ? "Completed" : "Open"}
              </span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-[var(--color-consumer-deep)]">
          My Reports
        </h1>
        <p className="mt-1 text-[var(--color-consumer-muted)]">
          View and track the suspicious activities you've reported.
        </p>
      </header>

      {/* Filter tabs */}
      <div
        className="flex items-center gap-2 mb-5"
        role="tablist"
        aria-label="Report filter"
      >
        {(["all", "open", "completed"] as const).map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={filter === f}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === f
                ? "bg-[var(--color-consumer-primary)] text-white shadow-sm"
                : "bg-[var(--color-consumer-glass-strong)] text-[var(--color-consumer-muted)] border border-[var(--color-consumer-border)] hover:text-[var(--color-consumer-text)]"
            }`}
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "All" : f === "open" ? "Open" : "Completed"}
          </button>
        ))}
      </div>

      <div className="glass p-5 shadow-sm">{empty}</div>
    </div>
  );
}
