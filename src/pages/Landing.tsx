import { useJaal } from "@/state/JaalProvider";
import { useAuth } from "@/hooks/use-auth";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  Bot,
  Braces,
  Fingerprint,
  GitBranch,
  LockKeyhole,
  Network,
  Radar,
  ShieldCheck,
  ShieldHalf,
  Sparkles,
  Waypoints,
  Workflow,
} from "lucide-react";
import { Link } from "react-router";

const AGENTS = [
  {
    icon: GitBranch,
    name: "Change Sentinel",
    body: "Diffs a deployment, finds changed endpoints and scopes the investigation to what actually moved.",
  },
  {
    icon: Radar,
    name: "Recon & Inventory",
    body: "Crawls authorized workflows with synthetic roles and classifies active, zombie and shadow APIs.",
  },
  {
    icon: Workflow,
    name: "Attack Planner",
    body: "Selects business-logic tests from endpoint purpose, role context and historical findings.",
  },
  {
    icon: ShieldCheck,
    name: "Safe Execution",
    body: "Enforces exact scope, budgets and approvals. No LLM can add a host or bypass the gate.",
  },
  {
    icon: Fingerprint,
    name: "Verification",
    body: "Replays a control and an attack assertion. A generic 200 is never treated as proof.",
  },
  {
    icon: Braces,
    name: "Triage & Reporting",
    body: "Separates technical severity from travel-business impact and seals sanitized evidence.",
  },
  {
    icon: Activity,
    name: "Retest",
    body: "Replays the original test against the fixed configuration and preserves every historical artifact.",
  },
];

const LOOP = [
  ["01", "Detect", "Deployment diff"],
  ["02", "Discover", "Role-aware probe"],
  ["03", "Understand", "API graph"],
  ["04", "Plan", "Deterministic tests"],
  ["05", "Execute", "Approved scope"],
  ["06", "Verify", "Control + attack"],
  ["07", "Report", "SHA-256 evidence"],
  ["08", "Retest", "Fixed replay"],
];

export default function Landing() {
  const { state } = useJaal();
  const { isAuthenticated } = useAuth();
  const signedIn = Boolean(state.user) || isAuthenticated;
  const securityHref = signedIn ? "/security" : "/login?returnTo=%2Fsecurity";
  const consoleHref = signedIn ? "/dashboard" : "/login?returnTo=%2Fdashboard";

  return (
    <div className="security-grid min-h-screen bg-[#080D18] text-[#F3F6FC]">
      <header className="sticky top-0 z-40 border-b border-[#1b2a3e]/90 bg-[#080D18]/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="relative flex size-8 items-center justify-center border border-[#27C7B8]/50 bg-[#27C7B8]/10 font-mono text-[10px] font-bold text-[#27C7B8]">
              JA
              <span className="absolute -right-1 -top-1 size-1.5 bg-[#F59E55]" />
            </span>
            <div>
              <p className="text-[13px] font-bold leading-none tracking-[0.24em]">JAAL</p>
              <p className="mt-1 font-mono text-[7px] uppercase tracking-[0.18em] text-[#526a81]">
                Agentic security
              </p>
            </div>
          </Link>
          <nav className="hidden items-center gap-6 font-mono text-[9px] uppercase tracking-[0.12em] text-[#7890a8] md:flex">
            <a href="#loop" className="transition-colors hover:text-[#27C7B8]">Loop</a>
            <a href="#agents" className="transition-colors hover:text-[#27C7B8]">Agents</a>
            <a href="#safety" className="transition-colors hover:text-[#27C7B8]">Safety</a>
            <Link to={consoleHref} className="transition-colors hover:text-[#27C7B8]">
              Forensic console
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              to={securityHref}
              className="inline-flex h-8 items-center gap-1.5 border border-[#27C7B8]/50 bg-[#27C7B8]/10 px-3 font-mono text-[9px] uppercase tracking-[0.12em] text-[#27C7B8] transition-colors hover:bg-[#27C7B8]/20"
            >
              <ShieldHalf className="size-3" /> Security console
            </Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(39,199,184,0.12),transparent_38%),radial-gradient(circle_at_90%_20%,rgba(179,131,245,0.08),transparent_30%)]" />
        <div className="relative mx-auto grid w-full max-w-7xl gap-10 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:pt-20">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
          >
            <span className="inline-flex items-center gap-2 border border-[#B383F5]/35 bg-[#B383F5]/8 px-2.5 py-1 font-mono text-[8px] uppercase tracking-[0.18em] text-[#B383F5]">
              <Sparkles className="size-3" /> TBO Security Hackathon 2026 · synthetic lab
            </span>
            <h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-[1.03] tracking-[-0.035em] sm:text-5xl lg:text-[62px]">
              Every deploy.
              <br />
              Every endpoint.
              <br />
              <span className="text-[#27C7B8]">Every vulnerability investigated.</span>
            </h1>
            <p className="mt-5 max-w-xl text-[14px] leading-relaxed text-[#91A3BB]">
              JAAL is an autonomous DAST engine for B2B travel. It detects release
              changes, discovers undocumented APIs, understands agency boundaries,
              plans targeted business-logic tests, executes them safely, verifies the
              violation, and keeps retesting until the fix holds.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-2.5">
              <Link
                to={securityHref}
                className="inline-flex h-10 items-center gap-2 bg-[#27C7B8] px-4 text-[11px] font-semibold text-[#041413] transition-colors hover:bg-[#4eddd2]"
              >
                Open security operations <ArrowRight className="size-4" />
              </Link>
              <Link
                to={consoleHref}
                className="inline-flex h-10 items-center gap-2 border border-[#2a3b52] px-4 font-mono text-[9px] uppercase tracking-[0.12em] text-[#91A3BB] transition-colors hover:border-[#3b5472] hover:text-[#F3F6FC]"
              >
                <BadgeCheck className="size-3.5" /> Forensic JAAL
              </Link>
            </div>
            <div className="mt-8 grid max-w-xl grid-cols-3 gap-2">
              {[
                ["7", "specialized agents"],
                ["6", "logic attack modules"],
                ["0", "external targets"],
              ].map(([value, label]) => (
                <div key={label} className="border border-[#1e3044] bg-[#0b1421]/80 px-3 py-2.5">
                  <p className="text-xl font-semibold text-[#27C7B8]">{value}</p>
                  <p className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.1em] text-[#5f7692]">
                    {label}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.12 }}
            className="relative border border-[#24364c] bg-[#0a111d]/95 shadow-[0_30px_80px_rgba(0,0,0,0.35)]"
          >
            <div className="flex items-center justify-between border-b border-[#1b2a3e] px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-[#35C98A]" />
                <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#7890a8]">
                  JAAL / DEPLOYMENT INVESTIGATION
                </span>
              </div>
              <span className="font-mono text-[7px] uppercase tracking-[0.12em] text-[#B383F5]">
                synthetic
              </span>
            </div>
            <div className="border-b border-[#1b2a3e] bg-[#0d1725] px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="flex size-6 items-center justify-center border border-[#64B5F6]/35 bg-[#64B5F6]/8">
                    <GitBranch className="size-3 text-[#64B5F6]" />
                  </span>
                  <div>
                    <p className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#5f7692]">
                      deployment detected
                    </p>
                    <p className="font-mono text-[10px] text-[#d7e2ee]">travel-platform-2026.11.1</p>
                  </div>
                </div>
                <span className="border border-[#F59E55]/35 bg-[#F59E55]/8 px-1.5 py-0.5 font-mono text-[7px] uppercase text-[#F59E55]">
                  4 changes
                </span>
              </div>
              <div className="mt-3 grid gap-1">
                {[
                  ["MODIFIED", "GET /api/bookings/:id", "#27C7B8"],
                  ["ADDED", "GET /api/internal/agency-metrics", "#B383F5"],
                  ["MODIFIED", "POST /api/refunds", "#27C7B8"],
                  ["DEPRECATED", "GET /api/legacy/bookings/:id", "#F59E55"],
                ].map(([type, path, color]) => (
                  <div
                    key={path}
                    className="flex items-center gap-2 border border-[#1b2a3e] bg-[#0a111d] px-2 py-1"
                  >
                    <span className="size-1" style={{ backgroundColor: color }} />
                    <span className="w-16 font-mono text-[6px] uppercase tracking-[0.08em]" style={{ color }}>
                      {type}
                    </span>
                    <span className="truncate font-mono text-[8px] text-[#91A3BB]">{path}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 divide-x divide-[#1b2a3e] border-b border-[#1b2a3e]">
              {[
                ["CHANGE", "complete", "#35C98A"],
                ["DISCOVERY", "12 probed", "#35C98A"],
                ["SAFETY", "approval required", "#F5C96A"],
              ].map(([label, value, color]) => (
                <div key={label} className="px-2.5 py-2">
                  <p className="font-mono text-[6px] uppercase tracking-[0.12em] text-[#4f667d]">
                    {label}
                  </p>
                  <p className="mt-0.5 text-[8px]" style={{ color }}>
                    {value}
                  </p>
                </div>
              ))}
            </div>
            <div className="px-3 py-3">
              <div className="flex items-center gap-2">
                <LockKeyhole className="size-3 text-[#F5C96A]" />
                <p className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#F5C96A]">
                  Human approval gate
                </p>
              </div>
              <p className="mt-1.5 text-[9px] leading-relaxed text-[#7890a8]">
                Discovery is read-only. Active tests stay queued until an operator
                approves the six scoped plans.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <span className="inline-flex h-6 items-center gap-1 bg-[#27C7B8] px-2 font-mono text-[7px] uppercase tracking-[0.08em] text-[#041413]">
                  <ShieldCheck className="size-2.5" /> approve & execute
                </span>
                <span className="font-mono text-[7px] uppercase tracking-[0.08em] text-[#526a81]">
                  60 request ceiling
                </span>
              </div>
            </div>
            <div className="absolute -bottom-3 -right-3 hidden border border-[#35C98A]/30 bg-[#0a111d] px-2 py-1 font-mono text-[7px] uppercase tracking-[0.1em] text-[#35C98A] sm:block">
              exact scope: lab.jaal.internal
            </div>
          </motion.div>
        </div>
      </section>

      <section id="loop" className="border-y border-[#1b2a3e] bg-[#0a111b]/80">
        <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-mono text-[8px] uppercase tracking-[0.22em] text-[#27C7B8]">
                The complete operational loop
              </p>
              <h2 className="mt-1.5 text-2xl font-semibold tracking-[-0.02em]">
                One release, continuously investigated
              </h2>
            </div>
            <p className="max-w-md text-[11px] leading-relaxed text-[#7890a8]">
              Every stage has persisted inputs, outputs, execution status, error
              handling and audit records. Nothing is an in-memory illusion.
            </p>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-8">
            {LOOP.map(([number, title, detail]) => (
              <div key={number} className="group border border-[#1e3044] bg-[#0b1421] px-2.5 py-3">
                <p className="font-mono text-[8px] text-[#27C7B8]">{number}</p>
                <p className="mt-2 text-[11px] font-medium text-[#d7e2ee]">{title}</p>
                <p className="mt-1 font-mono text-[7px] uppercase leading-relaxed tracking-[0.08em] text-[#526a81]">
                  {detail}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="agents" className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6">
        <div className="max-w-2xl">
          <p className="font-mono text-[8px] uppercase tracking-[0.22em] text-[#27C7B8]">
            Seven agents · one orchestrator
          </p>
          <h2 className="mt-1.5 text-3xl font-semibold tracking-[-0.03em]">
            Specialized work, bounded autonomy.
          </h2>
          <p className="mt-2 text-[12px] leading-relaxed text-[#91A3BB]">
            The planner reasons about business context, but execution is deterministic.
            Every active request is scope-checked, budgeted and approval-gated.
          </p>
        </div>
        <div className="mt-7 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {AGENTS.map((agent, index) => (
            <div
              key={agent.name}
              className="group border border-[#1b2a3e] bg-[#0e1725] p-4 transition-colors hover:border-[#2c455e]"
            >
              <div className="flex items-center justify-between">
                <span className="flex size-7 items-center justify-center border border-[#24364c] bg-[#0a111d]">
                  <agent.icon className="size-3.5 text-[#27C7B8]" />
                </span>
                <span className="font-mono text-[7px] uppercase tracking-[0.1em] text-[#3f566d]">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </div>
              <p className="mt-3 text-[11px] font-medium text-[#d7e2ee]">{agent.name}</p>
              <p className="mt-1.5 text-[10px] leading-relaxed text-[#7890a8]">{agent.body}</p>
            </div>
          ))}
          <div className="border border-[#27C7B8]/25 bg-[#27C7B8]/5 p-4">
            <Bot className="size-4 text-[#27C7B8]" />
            <p className="mt-3 text-[11px] font-medium text-[#5de0d4]">Orchestrator</p>
            <p className="mt-1.5 text-[10px] leading-relaxed text-[#7890a8]">
              Durable jobs, idempotency keys, leases, bounded retries and a global
              emergency stop.
            </p>
          </div>
        </div>
      </section>

      <section id="safety" className="border-y border-[#1b2a3e] bg-[#0b1320]">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="font-mono text-[8px] uppercase tracking-[0.22em] text-[#F5C96A]">
              Safety is the product
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">
              A security tool that cannot be talked into overreach.
            </h2>
            <p className="mt-3 max-w-xl text-[12px] leading-relaxed text-[#91A3BB]">
              JAAL's demonstration runs against an isolated synthetic travel lab. The
              exact host, paths, methods, request budget and test credentials are
              enforced server-side. Redirects are disabled, evidence is sanitized, and
              a human must approve active execution.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {([
                ["Exact host allowlist", LockKeyhole],
                ["Human approval", ShieldCheck],
                ["Emergency stop", ShieldHalf],
                ["SHA-256 evidence", Fingerprint],
              ] as const).map(([label, Icon]) => (
                <span
                  key={String(label)}
                  className="inline-flex items-center gap-1.5 border border-[#24364c] bg-[#0a111d] px-2.5 py-1.5 font-mono text-[8px] uppercase tracking-[0.08em] text-[#91A3BB]"
                >
                  <Icon className="size-3 text-[#27C7B8]" /> {label}
                </span>
              ))}
            </div>
          </div>
          <div className="border border-[#24364c] bg-[#080f1a]">
            <div className="border-b border-[#1b2a3e] px-4 py-3">
              <p className="font-mono text-[8px] uppercase tracking-[0.14em] text-[#60788f]">
                Authorized target
              </p>
              <p className="mt-1 font-mono text-[12px] text-[#27C7B8]">
                https://lab.jaal.internal
              </p>
            </div>
            <dl className="divide-y divide-[#162436] font-mono text-[9px]">
              {[
                ["scheme", "HTTPS only"],
                ["methods", "GET · POST"],
                ["path scope", "/api/*"],
                ["redirects", "blocked"],
                ["approval", "required before execution"],
                ["data", "synthetic travellers only"],
              ].map(([key, value]) => (
                <div key={key} className="flex items-center justify-between px-4 py-2">
                  <dt className="uppercase tracking-[0.08em] text-[#526a81]">{key}</dt>
                  <dd className="text-[#c7d3e2]">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6">
        <div className="grid gap-3 lg:grid-cols-3">
          {[
            {
              icon: Network,
              title: "Discovery without OpenAPI",
              body: "Role-aware probing and traffic observation build the inventory. Shadow and zombie classifications require evidence windows, not one missed crawl.",
            },
            {
              icon: Waypoints,
              title: "Business-logic depth",
              body: "Cross-agency booking access, credit escalation, fare tampering, refund replay, deprecated readers and undocumented metrics.",
            },
            {
              icon: Fingerprint,
              title: "Precision over noise",
              body: "A candidate only becomes verified when its control passes and the attack response demonstrably crosses the boundary. Evidence is replayable.",
            },
          ].map((item) => (
            <div key={item.title} className="border border-[#1b2a3e] bg-[#0e1725] p-5">
              <item.icon className="size-5 text-[#27C7B8]" />
              <h3 className="mt-3 text-[13px] font-semibold text-[#d7e2ee]">{item.title}</h3>
              <p className="mt-2 text-[11px] leading-relaxed text-[#7890a8]">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-[#1b2a3e] bg-[#0a111b]">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-start justify-between gap-5 px-4 py-10 sm:px-6 lg:flex-row lg:items-center">
          <div>
            <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-[#27C7B8]">
              Detect → Discover → Understand → Plan → Execute → Verify → Report → Retest
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.02em]">
              Run the synthetic travel investigation.
            </h2>
            <p className="mt-1.5 max-w-xl text-[11px] leading-relaxed text-[#7890a8]">
              Real backend events, real control assertions, real SHA-256 evidence and a
              human approval gate. The lab is clearly labelled synthetic.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to={securityHref}
              className="inline-flex h-10 items-center gap-2 bg-[#27C7B8] px-4 text-[11px] font-semibold text-[#041413] hover:bg-[#4eddd2]"
            >
              Open security operations <ArrowRight className="size-4" />
            </Link>
            <Link
              to={consoleHref}
              className="inline-flex h-10 items-center gap-2 border border-[#2a3b52] px-4 font-mono text-[9px] uppercase tracking-[0.12em] text-[#91A3BB] hover:text-[#F3F6FC]"
            >
              Forensic console
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-[#162436] px-4 py-5 sm:px-6">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-1 font-mono text-[7px] uppercase tracking-[0.14em] text-[#465d74] sm:flex-row sm:items-center sm:justify-between">
          <span>JAAL · every deploy, every endpoint, every vulnerability investigated</span>
          <span>Synthetic lab · no external scanning · no real traveller data</span>
        </div>
      </footer>
    </div>
  );
}
