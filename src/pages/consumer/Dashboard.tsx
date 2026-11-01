import { useQuery } from "convex/react";
import { Link } from "react-router";

// Pre-computed slider offsets used to position floating consumer controls
import {
  MessageSquare,
  Phone,
  Receipt,
  LinkIcon,
  HelpCircle,
  ArrowRight,
  Clock,
  FileCheck,
  ChevronRight,
  Shield,
  Plus,
  Leaf,
  AlertTriangle,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import Assistant from "./Assistant";


export default function ConsumerDashboardPage() {
  const dashboard = useQuery(api.consumer.consumerDashboard);
  const loading = dashboard === undefined;
  const recent = dashboard?.recent ?? [];

  const formatDate = (ts?: number | null) => {
    if (!ts) return "—";
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const emptyRecent =
    recent.length === 0 &&
    (loading ? null : (
      <div className="glass p-5 text-center">
        <FileCheck className="w-6 h-6 text-[var(--color-consumer-muted)] mx-auto" />
        <p className="mt-2 text-[var(--color-consumer-muted)] text-sm">
          You have not submitted any reports yet.
        </p>
        <Link
          to="/consumer/report"
          className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-[var(--color-consumer-primary)] hover:underline"
        >
          Report a suspicious activity
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    ));

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold text-[var(--color-consumer-deep)] tracking-tight">
          Hello there! 👋
        </h1>
        <p className="text-[var(--color-consumer-muted)] text-lg leading-relaxed">
          Your digital safety starts here.
        </p>
        <p className="text-[var(--color-consumer-text-soft)] text-base">
          Report suspicious activity and understand the warning signs.
        </p>
      </header>

      {/* Two-column dashboard grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column — summary + quick actions */}
        <div className="lg:col-span-2 space-y-6">
          {/* Report summary card */}
          <section aria-labelledby="summary-title">
            <div className="glass-strong p-6 shadow-md">
              <div className="flex items-center justify-between mb-5">
                <h2
                  id="summary-title"
                  className="text-lg font-semibold text-[var(--color-consumer-deep)] flex items-center gap-2"
                >
                  <FileCheck className="w-5 h-5 text-[var(--color-consumer-primary)]" />
                  Your Report Summary
                </h2>
                <Link
                  to="/consumer/reports"
                  className="text-sm font-medium text-[var(--color-consumer-primary)] hover:underline inline-flex items-center gap-1"
                >
                  View All
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-xl bg-[var(--color-consumer-primary-soft)] p-4 text-center">
                  <p className="text-3xl font-semibold text-[var(--color-consumer-deep)]">
                    {loading ? (
                      <span className="inline-block w-10 h-6 bg-[var(--color-consumer-border)] rounded animate-pulse" />
                    ) : (
                      dashboard?.totalReports ?? 0
                    )}
                  </p>
                  <p className="mt-1 text-sm text-[var(--color-consumer-muted)]">
                    Total reports
                  </p>
                </div>
                <div className="rounded-xl bg-[var(--color-consumer-primary-soft)] p-4 text-center">
                  <p className="text-3xl font-semibold text-[var(--color-consumer-deep)]">
                    {loading ? (
                      <span className="inline-block w-10 h-6 bg-[var(--color-consumer-border)] rounded animate-pulse" />
                    ) : (
                      dashboard?.underReview ?? 0
                    )}
                  </p>
                  <p className="mt-1 text-sm text-[var(--color-consumer-muted)]">
                    Under review
                  </p>
                </div>
                <div className="rounded-xl bg-[var(--color-consumer-mint)] p-4 text-center">
                  <p className="text-3xl font-semibold text-[var(--color-consumer-deep)]">
                    {loading ? (
                      <span className="inline-block w-10 h-6 bg-[var(--color-consumer-border)] rounded animate-pulse" />
                    ) : (
                      dashboard?.completed ?? 0
                    )}
                  </p>
                  <p className="mt-1 text-sm text-[var(--color-consumer-muted)]">
                    Completed
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Report a scam CTA */}
          <section aria-labelledby="report-cta-title">
            <Link
              to="/consumer/report"
              className="group block rounded-2xl p-6 bg-gradient-to-br from-[var(--color-consumer-mint)] to-[var(--color-consumer-primary-soft)] border border-[var(--color-consumer-border)] shadow-md hover:shadow-lg transition-all"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2
                    id="report-cta-title"
                    className="text-xl font-semibold text-[var(--color-consumer-deep)] flex items-center gap-2"
                  >
                    <AlertTriangle className="w-5 h-5 text-[var(--color-consumer-teal)]" />
                    Report a Scam
                  </h2>
                  <p className="mt-1 text-[var(--color-consumer-text-soft)]">
                    Let's check if something looks suspicious.
                  </p>
                </div>
                <span className="shrink-0 w-10 h-10 rounded-xl bg-[var(--color-consumer-primary)] text-white flex items-center justify-center text-lg font-semibold shadow-md group-hover:scale-[1.05] transition-transform">
                  !
                </span>
              </div>
              <div className="mt-5 flex items-center gap-2 text-[var(--color-consumer-primary)] font-semibold hover:underline">
                <span className="group-hover:translate-x-1 transition-transform">
                  Start Reporting
                </span>
                <ArrowRight className="w-5 h-5" />
              </div>
            </Link>
          </section>

          {/* Quick actions */}
          <section>
            <h2 className="text-lg font-semibold text-[var(--color-consumer-deep)] mb-3 flex items-center gap-2">
              <Plus className="w-5 h-5 text-[var(--color-consumer-primary)]" />
              What would you like to report?
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                {
                  key: "message",
                  label: "Suspicious Message",
                  icon: MessageSquare,
                  to: "/consumer/report?category=message",
                },
                {
                  key: "call",
                  label: "Suspicious Phone Call",
                  icon: Phone,
                  to: "/consumer/report?category=call",
                },
                {
                  key: "payment",
                  label: "Payment Request",
                  icon: Receipt,
                  to: "/consumer/report?category=payment",
                },
                {
                  key: "link",
                  label: "Suspicious Link",
                  icon: LinkIcon,
                  to: "/consumer/report?category=link",
                },
                {
                  key: "other",
                  label: "Something Else",
                  icon: HelpCircle,
                  to: "/consumer/report?category=other",
                },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.key}
                    to={item.to}
                    className="group tile flex-col gap-2 py-4 text-left"
                    aria-label={item.label}
                  >
                    <span className="tile-icon" aria-hidden="true">
                      <Icon
                        className="w-5 h-5 text-[var(--color-consumer-primary)] group-hover:text-[var(--color-consumer-teal)] transition-colors"
                        strokeWidth={1.85}
                      />
                    </span>
                    <span className="tile-label text-sm">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </section>

          {/* Recent reports */}
          <section aria-labelledby="recent-title">
            <div className="flex items-center justify-between mb-3">
              <h2
                id="recent-title"
                className="text-lg font-semibold text-[var(--color-consumer-deep)] flex items-center gap-2"
              >
                <Clock className="w-5 h-5 text-[var(--color-consumer-primary)]" />
                Recent Reports
              </h2>
              <Link
                to="/consumer/reports"
                className="text-sm font-medium text-[var(--color-consumer-primary)] hover:underline inline-flex items-center gap-1"
              >
                View All
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>

            <div className="space-y-3">
              {loading ? (
                <div className="space-y-3" aria-busy="true">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="glass p-4 space-y-2 animate-pulse">
                      <div className="flex items-center justify-between">
                        <span className="h-4 w-24 bg-[var(--color-consumer-border)] rounded" />
                        <span className="h-4 w-16 bg-[var(--color-consumer-border)] rounded" />
                      </div>
                      <div className="flex gap-2">
                        <span className="h-3 flex-1 bg-[var(--color-consumer-border)] rounded" />
                        <span className="h-3 w-16 bg-[var(--color-consumer-border)] rounded" />
                      </div>
                    </div>
                  ))}
                  <span className="sr-only">Loading recent reports…</span>
                </div>
              ) : (
                emptyRecent ?? (
                  <div className="space-y-3">
                    {recent.slice(0, 5).map((report) => (
                      <Link
                        key={report._id}
                        to={`/consumer/reports/${report._id}`}
                        className="glass block p-4 hover:shadow-md transition-shadow text-left"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-[var(--color-consumer-deep)]">
                              {report.caseId ?? "—"}
                            </p>
                            <p className="text-sm text-[var(--color-consumer-muted)] mt-0.5">
                              {report.category ?? "Other"}
                            </p>
                          </div>
                          <span className="text-xs text-[var(--color-consumer-muted)] whitespace-nowrap">
                            {formatDate(report.createdAt)}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <span className="chip">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--color-consumer-teal)]" />
                            {report.status === "completed"
                              ? "Completed"
                              : report.status === "active"
                              ? "Open"
                              : report.status ?? "Open"}
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )
              )}
            </div>
          </section>
        </div>

        {/* Right column — safety tips + help */}
        <div className="space-y-6">
          {/* Safety tips */}
          <section aria-labelledby="tips-title">
            <div className="glass-strong p-6 shadow-md">
              <h2
                id="tips-title"
                className="text-lg font-semibold text-[var(--color-consumer-deep)] mb-4 flex items-center gap-2"
              >
                <Leaf className="w-5 h-5 text-[var(--color-consumer-teal)]" />
                Safety Tips
              </h2>
              <ul className="space-y-3 text-sm">
                {[
                  {
                    title: "Never share your OTP, PIN or banking details",
                    detail:
                      "Legitimate organisations will never ask for these.",
                  },
                  {
                    title: "Be careful with urgent messages",
                    detail:
                      "Scammers often create pressure to make you act quickly.",
                  },
                  {
                    title: "Avoid clicking suspicious links",
                    detail:
                      "Check the address before you tap or paste anything.",
                  },
                  {
                    title: "Verify payment requests independently",
                    detail:
                      "Use official contact details to confirm any payment.",
                  },
                ].map((tip, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-[var(--color-consumer-teal)] text-white flex items-center justify-center text-[10px] font-bold">
                      ✓
                    </span>
                    <div>
                      <p className="font-medium text-[var(--color-consumer-text)]">
                        {tip.title}
                      </p>
                      <p className="text-[var(--color-consumer-muted)] text-xs leading-relaxed mt-0.5">
                        {tip.detail}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              <Link
                to="/consumer/protected"
                className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-[var(--color-consumer-teal)] hover:underline"
              >
                See more safety tips
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </section>

          {/* Need help */}
          <section aria-labelledby="help-title">
            <div className="glass p-6 shadow-sm">
              <h2
                id="help-title"
                className="text-lg font-semibold text-[var(--color-consumer-deep)] mb-2 flex items-center gap-2"
              >
                <HelpCircle className="w-5 h-5 text-[var(--color-consumer-primary)]" />
                Need Help?
              </h2>
              <p className="text-sm text-[var(--color-consumer-muted)] leading-relaxed">
                Find simple answers and learn how to stay safe online.
              </p>
              <Link
                to="/consumer/protected#help"
                className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-[var(--color-consumer-primary)] hover:underline"
              >
                Visit Help Centre
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </section>

          {/* Trustline */}
          <div className="flex items-center gap-2 text-xs text-[var(--color-consumer-muted)] justify-end mt-2">
            <Shield className="w-4 h-4 text-[var(--color-consumer-teal)]" />
            <span className="font-medium text-[var(--color-consumer-teal)]">
              Together for a Safer Digital India.
            </span>
          </div>
        </div>
      </div>

      {/* JAAL Safety Assistant — floating chat (fixed-positioned, no layout impact) */}
      <Assistant />
    </div>
  );
}
