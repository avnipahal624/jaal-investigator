import { Shield, CheckCircle2, AlertTriangle, Link as LinkIcon, ArrowRight, HelpCircle } from "lucide-react";
import { Link } from "react-router";

const SECTIONS = [
  {
    icon: Shield,
    title: "OTP and PIN Safety",
    body: [
      "Never share your OTP, PIN, password or banking details with anyone who calls, texts or messages you.",
      "Banks and payment apps will never ask you to read out an OTP or enter it on a screen someone else sent you.",
      "If someone asks for your credentials, stop and verify through the organisation's official app or website.",
    ],
  },
  {
    icon: AlertTriangle,
    title: "Suspicious Messages",
    body: [
      "Be cautious with messages that create urgency, fear or excitement.",
      "Watch for messages that ask you to act quickly, click a link or share personal details.",
      "If a message seems odd, do not reply. Check with the sender using a known phone number or official channel.",
    ],
  },
  {
    icon: LinkIcon,
    title: "Suspicious Links",
    body: [
      "Do not tap links in unexpected messages, even if they look familiar.",
      "Check the address carefully before you open anything.",
      "If a link led to a login page or a payment page you were not expecting, close it and report it.",
    ],
  },
  {
    icon: AlertTriangle,
    title: "Payment Requests",
    body: [
      "Be careful with any request to send money, especially to a new account, UPI ID or payment link.",
      "Verify the request independently using official contact details, not the details in the message.",
      "If money was already sent, contact your bank or payment provider as soon as possible and ask for help.",
    ],
  },
  {
    icon: Shield,
    title: "Impersonation",
    body: [
      "Scammers may pretend to be a bank, a government body, a company, a friend or a family member.",
      "Do not trust a caller or message just because they know your name or some details about you.",
      "Confirm who you are dealing with through a channel you already trust.",
    ],
  },
  {
    icon: CheckCircle2,
    title: "What to Do After Losing Money",
    body: [
      "Contact your bank or payment provider immediately and explain what happened.",
      "Ask them to help stop or reverse the transfer if that is possible.",
      "Save the message, call details, link or payment request you received.",
      "Report the incident to the appropriate official reporting channel in your area.",
      "If you are unsure what to do next, reach out to someone you trust and review the details together.",
    ],
  },
];

export default function ConsumerProtectedPage() {
  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-[var(--color-consumer-deep)] flex items-center gap-2">
          <Shield className="w-6 h-6 text-[var(--color-consumer-teal)]" />
          Stay Protected
        </h1>
        <p className="mt-1 text-[var(--color-consumer-muted)] text-base">
          Simple steps to protect yourself from online scams.
        </p>
      </header>

      {/* Grid of safety sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {SECTIONS.map((section, i) => {
          const Icon = section.icon;
          return (
            <section
              key={i}
              className="glass-strong p-5 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-start gap-3">
                <span
                  className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${
                    section.icon === Shield || section.icon === CheckCircle2
                      ? "bg-[var(--color-consumer-teal)] text-white"
                      : "bg-[var(--color-consumer-primary-soft)] text-[var(--color-consumer-primary)]"
                  }`}
                  aria-hidden="true"
                >
                  <Icon className="w-5 h-5" strokeWidth={1.85} />
                </span>
                <div>
                  <h2 className="font-semibold text-[var(--color-consumer-deep)]">
                    {section.title}
                  </h2>
                  <ul className="mt-3 space-y-2 text-sm text-[var(--color-consumer-text)] leading-relaxed">
                    {section.body.map((item, j) => (
                      <li key={j} className="flex gap-2">
                        <CheckCircle2 className="shrink-0 w-4 h-4 text-[var(--color-consumer-teal)] mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          );
        })}
      </div>

      {/* Help / FAQ section */}
      <section
        id="help"
        className="mt-8 glass p-6 shadow-sm"
      >
        <h2 className="text-lg font-semibold text-[var(--color-consumer-deep)] flex items-center gap-2">
          <HelpCircle className="w-5 h-5 text-[var(--color-consumer-primary)]" />
          Help Centre
        </h2>
        <p className="mt-2 text-sm text-[var(--color-consumer-muted)] leading-relaxed">
          JAAL is here to help you understand what you've seen and what to do
          next. Use My Reports to track what you've submitted, and report
          anything new through Report a Scam.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link
            to="/consumer/reports"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--color-consumer-glass-strong)] border border-[var(--color-consumer-border)] text-[var(--color-consumer-text)] hover:border-[var(--color-consumer-primary)] transition-colors"
          >
            <LinkIcon className="w-4 h-4" />
            My Reports
          </Link>
          <Link
            to="/consumer/report"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--color-consumer-glass-strong)] border border-[var(--color-consumer-border)] text-[var(--color-consumer-text)] hover:border-[var(--color-consumer-primary)] transition-colors"
          >
            <AlertTriangle className="w-4 h-4" />
            Report a Scam
          </Link>
        </div>
        <p className="mt-4 text-xs text-[var(--color-consumer-muted)] leading-relaxed border-t border-[var(--color-consumer-border)] pt-4">
          This page gives general safety guidance. It is not legal advice or a
          substitute for contacting your bank or the appropriate official
          reporting channel in your area.
        </p>
      </section>

      {/* Trustline */}
      <div className="mt-8 flex items-center justify-between text-xs text-[var(--color-consumer-muted)]">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-[var(--color-consumer-teal)]" />
          <span className="font-medium text-[var(--color-consumer-teal)]">
            Together for a Safer Digital India.
          </span>
        </div>
        <Link
          to="/consumer/dashboard"
          className="inline-flex items-center gap-1 text-[var(--color-consumer-muted)] hover:text-[var(--color-consumer-text)] transition-colors"
        >
          Back to home
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
