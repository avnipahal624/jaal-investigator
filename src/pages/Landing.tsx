import { Button } from "@/components/ui/button";
import { useJaal } from "@/state/JaalProvider";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  Binary,
  Bot,
  ExternalLink,
  Fingerprint,
  FileSignature,
  ScanLine,
  ShieldAlert,
  Siren,
  Terminal,
  Users,
} from "lucide-react";
import { Link } from "react-router";

const fadeUp = {
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.45, ease: "easeOut" as const },
};

const FEATURES = [
  {
    icon: ScanLine,
    title: "Kill-chain tracking",
    body: "Five scam stages from first contact to exploitation — each one detected from actual message content, never advanced by hand.",
    tone: "text-jcyan",
  },
  {
    icon: ShieldAlert,
    title: "Tactic detection",
    body: "Authority impersonation, fear, urgency, payment pressure, isolation and remote-access asks surface the moment they appear.",
    tone: "text-jamber",
  },
  {
    icon: Fingerprint,
    title: "Evidence integrity",
    body: "Every identifier is sealed with a real SHA-256 hash in your browser. Re-verify later — mismatches are shown honestly.",
    tone: "text-jgreen",
  },
  {
    icon: FileSignature,
    title: "Structured reports",
    body: "Transcript, tactics, stages, identifiers, hashes and timeline assembled into an exportable JSON and printable report.",
    tone: "text-jteal",
  },
  {
    icon: Bot,
    title: "AI-decoy console",
    body: "A scripted decoy holds the line with contextual replies — asking for websites, departments, case references and UPI handles.",
    tone: "text-jcyan",
  },
  {
    icon: Terminal,
    title: "Live event stream",
    body: "Logs, OSINT-style pattern scans and a terminal event stream track every extraction, detection and hash as it happens.",
    tone: "text-jamber",
  },
];

const KILL_CHAIN = [
  { n: "01", label: "Initial contact", icon: Terminal, note: "Unsolicited message opens the channel" },
  { n: "02", label: "Authority claim", icon: BadgeCheck, note: "Police, regulator or government impersonated" },
  { n: "03", label: "Fear tactic", icon: Siren, note: "Arrest, freeze or legal threat" },
  { n: "04", label: "Payment request", icon: Binary, note: "Deposit or UPI transfer demanded" },
  { n: "05", label: "Exploitation", icon: ShieldAlert, note: "Proof-of-payment or device access" },
];

const SCENARIOS = [
  { id: "JAAL-001", title: "Digital Arrest Scam", cat: "Digital arrest", live: true },
  { id: "JAAL-002", title: "Fake Telecom Refund", cat: "UPI/payment", live: false },
  { id: "JAAL-003", title: "Bank KYC Phishing", cat: "Phishing", live: false },
  { id: "JAAL-004", title: "Remote Job Deposit", cat: "Job scam", live: false },
];

export default function Landing() {
  const { state } = useJaal();
  const signedIn = Boolean(state.user);
  const primaryHref = signedIn ? "/dashboard" : "/login?returnTo=%2Fdashboard";

  return (
    <div className="jaal-grid min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-jborder/60 bg-jsurface/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="relative flex size-8 items-center justify-center border border-jcyan/60 bg-jcyan/10 font-mono text-xs font-bold text-jcyan">
              JA
              <span className="absolute -right-1 -top-1 size-1.5 bg-jamber jaal-pulse" />
            </span>
            <span className="text-sm font-bold tracking-[0.35em] text-jtext">JAAL</span>
          </Link>
          <nav className="hidden items-center gap-6 text-xs text-jmuted md:flex">
            <a href="#workflow" className="transition-colors hover:text-jcyan">Workflow</a>
            <a href="#killchain" className="transition-colors hover:text-jcyan">Kill-chain</a>
            <a href="#evidence" className="transition-colors hover:text-jcyan">Evidence</a>
            <a href="#scenarios" className="transition-colors hover:text-jcyan">Scenarios</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              to="/auth"
              className="border border-[var(--color-consumer-primary)]/60 bg-[var(--color-consumer-primary)]/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[var(--color-consumer-primary)] transition-colors hover:bg-[var(--color-consumer-primary)]/20"
            >
              Report a scam
            </Link>
            <Link
              to="/auth"
              className="hidden border border-jborder/70 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-jmuted transition-colors hover:border-jcyan/50 hover:text-jcyan sm:block"
            >
              Account sign-in
            </Link>
            <Link
              to={primaryHref}
              className="border border-jcyan/50 bg-jcyan/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-jcyan transition-colors hover:bg-jcyan/20"
            >
              {signedIn ? "Open console" : "Enter console"}
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="jaal-scanlines pointer-events-none absolute inset-0 opacity-60" />
        <div className="relative mx-auto grid w-full max-w-6xl gap-10 px-4 pb-16 pt-16 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:pt-24">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
          >
            <span className="inline-flex items-center gap-2 border border-jamber/40 bg-jamber/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-jamber">
              <span className="size-1.5 bg-jamber jaal-pulse" /> simulation mode ·
              synthetic data only
            </span>

            <h1 className="mt-6 text-4xl font-bold leading-[1.05] tracking-tight text-jtext sm:text-5xl lg:text-6xl">
              Every message
              <br />
              is a <span className="text-jcyan">clue.</span>
            </h1>
            <p className="mt-4 max-w-lg text-lg leading-relaxed text-jmuted">
              Turn the scammer into the evidence. JAAL runs a controlled decoy
              conversation, watches the scam kill-chain unfold live, extracts
              suspicious identifiers and seals each one with a SHA-256 integrity
              hash.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button
                asChild
                className="h-11 cursor-pointer gap-2 bg-jcyan px-5 font-semibold text-background hover:bg-jcyan/85"
              >
                <Link to={primaryHref}>
                  {signedIn ? "Open the console" : "Start the simulation"}{" "}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Link
                to="/auth"
                className="flex h-11 items-center gap-2 bg-[var(--color-consumer-primary)] px-5 font-semibold text-white transition-colors hover:bg-[var(--color-consumer-primary)]/85"
              >
                <Users className="size-4" /> I'm a normal person — Report a scam
              </Link>
              <a
                href="#workflow"
                className="flex h-11 items-center gap-2 border border-jborder/70 px-4 font-mono text-[11px] uppercase tracking-wider text-jmuted transition-colors hover:border-jcyan/50 hover:text-jcyan"
              >
                See the workflow
              </a>
            </div>

            <dl className="mt-10 grid max-w-lg grid-cols-3 gap-3">
              {[
                ["5", "kill-chain stages"],
                ["6", "tactic patterns"],
                ["SHA-256", "browser-side hashing"],
              ].map(([v, k]) => (
                <div key={k} className="border border-jborder/60 bg-jsurface/70 px-3 py-2.5">
                  <dt className="font-mono text-lg font-semibold text-jcyan">{v}</dt>
                  <dd className="mt-0.5 font-mono text-[9px] uppercase tracking-widest text-jmuted">
                    {k}
                  </dd>
                </div>
              ))}
            </dl>
          </motion.div>

          {/* Console preview */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="jaal-panel jaal-hud relative overflow-hidden"
          >
            <div className="flex items-center justify-between border-b border-jborder/60 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="size-1.5 bg-jred jaal-pulse" />
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-jred">
                  JAAL-001 · live
                </span>
              </div>
              <span className="font-mono text-[9px] uppercase tracking-widest text-jmuted">
                digital arrest scam
              </span>
            </div>

            <div className="space-y-2 p-3">
              <div className="border-l-2 border-jred/70 bg-jred/[0.05] px-2.5 py-1.5">
                <p className="font-mono text-[9px] uppercase tracking-widest text-jred/90">
                  suspect · 09:14
                </p>
                <p className="text-[12px] leading-snug text-jtext/90">
                  A parcel under your Aadhaar contains contraband. This is
                  Inspector Anand Kumar, Cyber Crime Division…
                </p>
              </div>
              <div className="border-l-2 border-jcyan/70 bg-jcyan/[0.05] px-2.5 py-1.5">
                <p className="font-mono text-[9px] uppercase tracking-widest text-jcyan">
                  jaal decoy · 09:15
                </p>
                <p className="text-[12px] leading-snug text-jtext/90">
                  Which department is issuing this notice? Send me your official
                  website and case reference.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {[
                  ["authority ✓", "text-jcyan border-jcyan/50"],
                  ["fear ✓", "text-jamber border-jamber/50"],
                  ["urgency ✓", "text-jamber border-jamber/50"],
                ].map(([label, tone]) => (
                  <span
                    key={label}
                    className={cn(
                      "border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider",
                      tone,
                    )}
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>

            <div className="border-t border-jborder/60 px-3 py-2 font-mono text-[10px] leading-relaxed">
              <p className="text-jmuted/70">[09:15:02] Message received</p>
              <p className="text-jamber">[09:15:02] Tactic detected: Fear and threat</p>
              <p className="text-jcyan">[09:15:03] Identifier extracted: UPI ID</p>
              <p className="text-jgreen">[09:15:03] SHA-256 hash generated ▌</p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Two experiences */}
      <section id="experiences" className="border-t border-jborder/60 bg-jsurface/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
          <motion.div {...fadeUp} className="text-center">
            <p className="jaal-label">Choose your experience</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-jtext sm:text-3xl">
              Two ways to use JAAL
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-jmuted">
              JAAL serves two audiences. Pick the one that fits what you need
              right now.
            </p>
          </motion.div>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {/* Normal People */}
            <motion.div
              {...fadeUp}
              className="jaal-panel relative overflow-hidden p-6 transition-colors hover:border-[var(--color-consumer-primary)]/60"
            >
              <span className="inline-flex items-center gap-1.5 border border-[var(--color-consumer-primary)]/50 bg-[var(--color-consumer-primary)]/10 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-[var(--color-consumer-primary)]">
                <span className="size-1.5 bg-[var(--color-consumer-primary)] jaal-pulse" /> Normal People
              </span>
              <Users className="mt-4 size-6 text-[var(--color-consumer-primary)]" />
              <h3 className="mt-3 text-lg font-semibold text-jtext">
                Report a scam in plain language
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-jmuted">
                Worried about a suspicious message? Describe what happened in
                everyday words. JAAL checks for warning signs and gives you
                practical next steps — no jargon, no judgment.
              </p>
              <ul className="mt-4 flex flex-col gap-1.5 text-[13px] text-jmuted">
                <li>• 3-step report in plain language</li>
                <li>• Clear warning signs, explained</li>
                <li>• Practical advice for staying safe</li>
              </ul>
              <Link
                to="/auth"
                className="mt-5 inline-flex h-11 items-center gap-2 bg-[var(--color-consumer-primary)] px-5 font-semibold text-white transition-colors hover:bg-[var(--color-consumer-primary)]/85"
              >
                Report a scam <ArrowRight className="size-4" />
              </Link>
            </motion.div>

            {/* Investigator */}
            <motion.div
              {...fadeUp}
              className="jaal-panel relative overflow-hidden p-6 transition-colors hover:border-jcyan/50"
            >
              <span className="inline-flex items-center gap-1.5 border border-jcyan/50 bg-jcyan/10 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-jcyan">
                <span className="size-1.5 bg-jcyan jaal-pulse" /> Investigator
              </span>
              <Terminal className="mt-4 size-6 text-jcyan" />
              <h3 className="mt-3 text-lg font-semibold text-jtext">
                Forensic investigation console
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-jmuted">
                Run controlled decoy conversations, track the scam kill-chain
                live, extract suspicious identifiers and seal evidence with
                SHA-256 integrity hashes.
              </p>
              <ul className="mt-4 flex flex-col gap-1.5 text-[13px] text-jmuted">
                <li>• Kill-chain & tactic detection</li>
                <li>• Evidence locker with SHA-256</li>
                <li>• Structured forensic reports</li>
              </ul>
              <Link
                to={primaryHref}
                className="mt-5 inline-flex h-11 items-center gap-2 bg-jcyan px-5 font-semibold text-background transition-colors hover:bg-jcyan/85"
              >
                Open the console <ArrowRight className="size-4" />
              </Link>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Workflow */}
      <section id="workflow" className="border-t border-jborder/60 bg-jsurface/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <motion.div {...fadeUp}>
            <p className="jaal-label">How JAAL works</p>
            <h2 className="mt-2 max-w-2xl text-2xl font-bold tracking-tight text-jtext sm:text-3xl">
              From a suspicious conversation to a sealed evidence file
            </h2>
          </motion.div>

          <div className="mt-8 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[
              {
                step: "01",
                title: "Seed the decoy",
                body: "Start a scripted simulation or paste a transcript. Everything runs locally — no real people are ever contacted.",
              },
              {
                step: "02",
                title: "Run the conversation",
                body: "The decoy replies with contextual questions: official website, department, case reference, UPI handle.",
              },
              {
                step: "03",
                title: "Detect & extract",
                body: "Tactics, kill-chain stages and identifiers are derived from message content and land in the evidence locker in real time.",
              },
              {
                step: "04",
                title: "Verify & report",
                body: "Hash each item, verify integrity (including deliberate mismatch demos), then export the structured report.",
              },
            ].map((s) => (
              <motion.div
                key={s.step}
                {...fadeUp}
                className="jaal-panel relative p-4 transition-colors hover:border-jcyan/50"
              >
                <p className="font-mono text-xs font-semibold text-jcyan">{s.step}</p>
                <h3 className="mt-2 text-sm font-semibold text-jtext">{s.title}</h3>
                <p className="mt-1.5 text-[12px] leading-relaxed text-jmuted">{s.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Kill-chain */}
      <section id="killchain" className="border-t border-jborder/60">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <motion.div {...fadeUp}>
            <p className="jaal-label">Scam kill-chain</p>
            <h2 className="mt-2 max-w-2xl text-2xl font-bold tracking-tight text-jtext sm:text-3xl">
              Five stages, detected as the scam unfolds
            </h2>
            <p className="mt-2 max-w-xl text-sm text-jmuted">
              Each stage activates only when a message actually matches its
              pattern — the timeline is evidence, not decoration.
            </p>
          </motion.div>

          <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {KILL_CHAIN.map((s, i) => (
              <motion.li
                key={s.n}
                {...fadeUp}
                transition={{ duration: 0.4, delay: i * 0.06 }}
                className="jaal-panel relative p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="flex size-8 items-center justify-center border border-jamber/50 bg-jamber/10 text-jamber">
                    <s.icon className="size-4" />
                  </span>
                  <span className="font-mono text-lg font-semibold text-jcyan/70">
                    {s.n}
                  </span>
                </div>
                <h3 className="mt-3 text-[13px] font-semibold text-jtext">{s.label}</h3>
                <p className="mt-1 text-[11px] leading-relaxed text-jmuted">{s.note}</p>
                {i < KILL_CHAIN.length - 1 && (
                  <span className="absolute -right-2 top-1/2 hidden h-px w-3 bg-jcyan/40 lg:block" />
                )}
              </motion.li>
            ))}
          </ol>
        </div>
      </section>

      {/* Features */}
      <section id="evidence" className="border-t border-jborder/60 bg-jsurface/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <motion.div {...fadeUp}>
            <p className="jaal-label">Investigation toolkit</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-jtext sm:text-3xl">
              A forensics console, not a chat app
            </h2>
          </motion.div>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <motion.div
                key={f.title}
                {...fadeUp}
                className="jaal-panel p-4 transition-colors hover:border-jcyan/50"
              >
                <f.icon className={cn("size-5", f.tone)} />
                <h3 className="mt-3 text-sm font-semibold text-jtext">{f.title}</h3>
                <p className="mt-1.5 text-[12px] leading-relaxed text-jmuted">{f.body}</p>
              </motion.div>
            ))}
          </div>

          {/* Honesty note */}
          <motion.div
            {...fadeUp}
            className="mt-6 flex gap-3 border border-jamber/40 bg-jamber/[0.07] p-4"
          >
            <Fingerprint className="mt-0.5 size-4 shrink-0 text-jamber" />
            <p className="text-[12px] leading-relaxed text-jmuted">
              <span className="text-jamber">Integrity, honestly stated:</span>{" "}
              a hash proves stored content has not changed since recording. It
              does not prove an identifier is genuine, that anyone is a
              criminal, or that evidence is legally admissible. JAAL labels
              everything it extracts as an <em>unverified lead</em>.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Scenarios */}
      <section id="scenarios" className="border-t border-jborder/60">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <motion.div {...fadeUp} className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="jaal-label">Demo scenarios</p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-jtext sm:text-3xl">
                Synthetic cases, ready to investigate
              </h2>
              <p className="mt-2 max-w-xl text-sm text-jmuted">
                Four seeded investigations with fabricated identifiers — none of
                them describe real people, numbers or accounts.
              </p>
            </div>
            <Link
              to="/investigations"
              className="flex items-center gap-1.5 border border-jcyan/50 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-jcyan transition-colors hover:bg-jcyan/10"
            >
              Browse cases <ExternalLink className="size-3" />
            </Link>
          </motion.div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {SCENARIOS.map((s) => (
              <motion.div key={s.id} {...fadeUp} className="jaal-panel jaal-hud relative p-4">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] tracking-wider text-jcyan">
                    {s.id}
                  </span>
                  {s.live ? (
                    <span className="flex items-center gap-1.5 border border-jcyan/50 bg-jcyan/10 px-1.5 py-px font-mono text-[8px] uppercase tracking-widest text-jcyan">
                      <span className="size-1 bg-jcyan jaal-pulse" /> live demo
                    </span>
                  ) : (
                    <span className="border border-jborder/60 px-1.5 py-px font-mono text-[8px] uppercase tracking-widest text-jmuted">
                      seeded
                    </span>
                  )}
                </div>
                <h3 className="mt-2 text-sm font-semibold text-jtext">{s.title}</h3>
                <p className="mt-1 font-mono text-[9px] uppercase tracking-widest text-jmuted">
                  {s.cat}
                </p>
                <Link
                  to={primaryHref}
                  className="mt-3 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-jcyan hover:text-jtext"
                >
                  Investigate <ArrowRight className="size-3" />
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-jborder/60 bg-jsurface/60">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-6 px-4 py-14 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-jtext sm:text-3xl">
              Open the console. Run the decoy.
            </h2>
            <p className="mt-2 max-w-xl text-sm text-jmuted">
              Simulation access is instant — no account required. Account
              sign-in is available when you want a persistent workspace.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              asChild
              className="h-11 cursor-pointer gap-2 bg-jcyan px-5 font-semibold text-background hover:bg-jcyan/85"
            >
              <Link to={primaryHref}>
                <Terminal className="size-4" /> {signedIn ? "Open console" : "Enter simulation"}
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-11 cursor-pointer gap-2 border-jborder/70 bg-jsurface px-5 text-jmuted hover:border-jcyan/50 hover:text-jcyan"
            >
              <Link to="/auth">Account sign-in</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-jborder/60">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex size-7 items-center justify-center border border-jcyan/50 bg-jcyan/10 font-mono text-[10px] font-bold text-jcyan">
              JA
            </span>
            <div>
              <p className="text-xs font-bold tracking-[0.3em] text-jtext">JAAL</p>
              <p className="font-mono text-[9px] uppercase tracking-widest text-jmuted">
                every message is a clue
              </p>
            </div>
          </div>
          <p className="max-w-xl font-mono text-[9px] uppercase leading-relaxed tracking-widest text-jmuted/70">
            JAAL is a simulation and education tool. All conversations, phone
            numbers, UPI IDs and URLs shown are synthetic demo values. No real
            scammers are contacted and no external persons are traced.
          </p>
        </div>
      </footer>
    </div>
  );
}
