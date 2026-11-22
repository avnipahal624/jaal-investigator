import { useJaal } from "@/state/JaalProvider";
import { useAuth } from "@/hooks/use-auth";
import { motion } from "framer-motion";
import {
  ArrowRight,
  AudioLines,
  BadgeCheck,
  BookOpenCheck,
  CheckCheck,
  ClipboardList,
  Clock3,
  FileSearch,
  FileText,
  Fingerprint,
  GitBranch,
  LockKeyhole,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  Waypoints,
} from "lucide-react";
import { Link } from "react-router";

const CAPABILITIES = [
  {
    icon: MessageSquareText,
    title: "Read the conversation",
    body: "Keep suspicious messages together, advance a labeled synthetic scammer conversation, and see the kill-chain stage as pressure builds.",
  },
  {
    icon: Waypoints,
    title: "Connect the evidence",
    body: "Follow source messages, extracted links, phone numbers and payment identifiers on a board that explains why each relationship exists.",
  },
  {
    icon: AudioLines,
    title: "Review the recording",
    body: "Attach a call recording to a case, inspect the timestamped transcript and accept, correct or dismiss proposed findings.",
  },
  {
    icon: Clock3,
    title: "Reconstruct the timeline",
    body: "Separate when an event happened from when JAAL learned about it. Unknown times stay unknown instead of becoming invented facts.",
  },
  {
    icon: ClipboardList,
    title: "Decide what to do now",
    body: "Get case-specific next steps based on what was actually requested, answered or already shared — then mark progress yourself.",
  },
  {
    icon: FileText,
    title: "Export a reviewed report",
    body: "Edit the narrative, exclude weak or sensitive material, keep source references, and export a report that reads outside the console.",
  },
];

const WORKFLOW = [
  ["01", "Capture", "Message, recording, or synthetic scenario"],
  ["02", "Interpret", "Tactics, indicators and uncertainty"],
  ["03", "Review", "A person accepts or rejects each finding"],
  ["04", "Connect", "Evidence board and chronological timeline"],
  ["05", "Act", "Case-specific safety and verification steps"],
  ["06", "Report", "Reviewed narrative, sources and exclusions"],
];

export default function Landing() {
  const { state } = useJaal();
  const { isAuthenticated } = useAuth();
  const signedIn = Boolean(state.user) || isAuthenticated;
  const dashboardHref = signedIn ? "/dashboard" : "/login?returnTo=%2Fdashboard";
  const newCaseHref = signedIn ? "/investigations/new" : "/login?returnTo=%2Finvestigations%2Fnew";

  return (
    <div className="metal-page relative min-h-screen overflow-hidden text-[#F3F8FF]">
      <header className="metal-glass sticky top-0 z-40 border-b backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="jaal-logo-metal relative flex size-9 items-center justify-center rounded-sm font-mono text-[10px] font-bold">
              JA
              <span className="absolute -right-1 -top-1 size-1.5 bg-[#F59E55]" />
            </span>
            <div>
              <p className="text-[13px] font-bold leading-none tracking-[0.24em]">JAAL</p>
              <p className="mt-1 font-mono text-[7px] uppercase tracking-[0.18em] text-[#6F89A6]">
                Scam investigation
              </p>
            </div>
          </Link>
          <nav className="hidden items-center gap-6 font-mono text-[9px] uppercase tracking-[0.12em] text-[#8DA6C2] md:flex">
            <a href="#workflow" className="transition-colors hover:text-[#6FD7FF]">Workflow</a>
            <a href="#capabilities" className="transition-colors hover:text-[#6FD7FF]">Capabilities</a>
            <a href="#trust" className="transition-colors hover:text-[#6FD7FF]">Evidence rules</a>
            <Link to={dashboardHref} className="transition-colors hover:text-[#6FD7FF]">
              Console
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              to={dashboardHref}
              className="metal-button-ghost inline-flex h-8 items-center gap-1.5 rounded-sm px-3 font-mono text-[9px] uppercase tracking-[0.12em]"
            >
              <FileSearch className="size-3" /> Open console
            </Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(54,137,255,0.18),transparent_40%),radial-gradient(circle_at_88%_16%,rgba(111,215,255,0.12),transparent_34%)]" />
        <div className="metal-floor opacity-60" />
        <div className="metal-orb pointer-events-none absolute right-[7%] top-[20%] hidden size-28 opacity-70 lg:block" />
        <div className="relative mx-auto grid w-full max-w-7xl gap-10 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pt-20">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
          >
            <span className="metal-chip inline-flex items-center gap-2 rounded-full px-3 py-1 font-mono text-[8px] uppercase tracking-[0.18em]">
              <Sparkles className="size-3" /> Voice-first scam investigation
            </span>
            <h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-[1.03] tracking-[-0.035em] sm:text-5xl lg:text-[62px]">
              Turn a suspicious
              <br />
              conversation into
              <br />
              <span className="metal-text">a case you can explain.</span>
            </h1>
            <p className="mt-5 max-w-xl text-[14px] leading-relaxed text-[#A9BFD6]">
              JAAL brings messages, recorded calls, extracted indicators, tactic findings,
              evidence links and safe next steps into one investigated case. Every claim
              keeps its source. Every finding keeps its review state.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-2.5">
              <Link
                to={newCaseHref}
                className="metal-button inline-flex h-10 items-center gap-2 rounded-sm px-5 text-[11px] font-semibold"
              >
                Start an investigation <ArrowRight className="size-4" />
              </Link>
              <Link
                to={dashboardHref}
                className="metal-button-ghost inline-flex h-10 items-center gap-2 rounded-sm px-4 font-mono text-[9px] uppercase tracking-[0.12em]"
              >
                <BadgeCheck className="size-3.5" /> Open case console
              </Link>
            </div>
            <div className="mt-8 grid max-w-xl grid-cols-3 gap-2">
              {[
                ["5", "scenario arcs"],
                ["3", "evidence views"],
                ["100%", "source-linked"],
              ].map(([value, label]) => (
                <div key={label} className="metal-card rounded-sm px-3 py-2.5">
                  <p className="metal-text text-xl font-semibold">{value}</p>
                  <p className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.1em] text-[#7E96B5]">
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
            className="metal-surface metal-tilt relative rounded-md"
          >
            <div className="flex items-center justify-between border-b border-[#153454] px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-[#35C98A]" />
                <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#8DA6C2]">
                  JAAL / CASE WORKSPACE
                </span>
              </div>
              <span className="font-mono text-[7px] uppercase tracking-[0.12em] text-[#F5C96A]">
                simulation
              </span>
            </div>
            <div className="border-b border-[#153454] bg-[#0d1725] px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#7E96B5]">
                    JAAL-104 · fake parcel
                  </p>
                  <p className="mt-1 text-[12px] font-medium text-[#DCEBF8]">
                    Delivery fee demanded for a held parcel
                  </p>
                </div>
                <span className="border border-[#F59E55]/35 bg-[#F59E55]/8 px-1.5 py-0.5 font-mono text-[7px] uppercase text-[#F59E55]">
                  payment stage
                </span>
              </div>
              <div className="mt-3 space-y-1.5">
                <div className="max-w-[92%] border border-[#F5C96A]/25 bg-[#F5C96A]/5 px-2.5 py-2">
                  <p className="font-mono text-[6px] uppercase tracking-[0.1em] text-[#7E96B5]">
                    synthetic scammer · message 03
                  </p>
                  <p className="mt-1 text-[9px] leading-relaxed text-[#DCEBF8]">
                    Pay the ₹499 release fee in the next 15 minutes or the parcel is returned.
                  </p>
                </div>
                <div className="ml-auto max-w-[88%] border border-[#6FD7FF]/30 bg-[#6FD7FF]/[0.06] px-2.5 py-2">
                  <p className="font-mono text-[6px] uppercase tracking-[0.1em] text-[#7E96B5]">
                    JAAL decoy · reviewable
                  </p>
                  <p className="mt-1 text-[9px] leading-relaxed text-[#DCEBF8]">
                    Which delivery company are you with, and what is the tracking reference?
                  </p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 divide-x divide-[#153454] border-b border-[#153454]">
              {[
                ["TACTIC", "urgency", "#F5C96A"],
                ["INDICATOR", "payment link", "#6FD7FF"],
                ["SOURCE", "message #03", "#6FD7FF"],
              ].map(([label, value, color]) => (
                <div key={label} className="px-2.5 py-2">
                  <p className="font-mono text-[6px] uppercase tracking-[0.12em] text-[#4f667d]">
                    {label}
                  </p>
                  <p className="mt-0.5 text-[8px]" style={{ color }}>{value}</p>
                </div>
              ))}
            </div>
            <div className="px-3 py-3">
              <div className="flex items-center gap-2">
                <ClipboardList className="size-3 text-[#6FD7FF]" />
                <p className="font-mono text-[8px] uppercase tracking-[0.1em] text-[#6FD7FF]">
                  What should I do now?
                </p>
              </div>
              <div className="mt-2 flex items-start gap-2 border border-[#153454] bg-[#071426] px-2.5 py-2">
                <CheckCheck className="mt-0.5 size-3 shrink-0 text-[#35C98A]" />
                <div>
                  <p className="text-[9px] font-medium text-[#DCEBF8]">Verify the delivery independently</p>
                  <p className="mt-0.5 text-[8px] leading-relaxed text-[#8DA6C2]">
                    Do not use the link in the message. Open the courier’s own site or app.
                  </p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {["SHA-256 preserved", "reviewed finding", "source linked"].map((label) => (
                  <span key={label} className="border border-[#1B4368] bg-[#071426] px-1.5 py-0.5 font-mono text-[6px] uppercase tracking-[0.08em] text-[#8DA6C2]">
                    {label}
                  </span>
                ))}
              </div>
            </div>
            <div className="absolute -bottom-3 -right-3 hidden border border-[#35C98A]/30 bg-[#071426] px-2 py-1 font-mono text-[7px] uppercase tracking-[0.1em] text-[#35C98A] sm:block">
              original evidence untouched
            </div>
          </motion.div>
        </div>
      </section>

      <section id="workflow" className="border-y border-[#153454] bg-[#071426]/80">
        <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-mono text-[8px] uppercase tracking-[0.22em] text-[#6FD7FF]">
                One case, one evidence trail
              </p>
              <h2 className="mt-1.5 text-2xl font-semibold tracking-[-0.02em]">
                From first contact to reviewed report
              </h2>
            </div>
            <p className="max-w-md text-[11px] leading-relaxed text-[#8DA6C2]">
              The conversation, recording, board and timeline are views of the same case
              records. Review decisions persist; original evidence is never rewritten.
            </p>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
            {WORKFLOW.map(([number, title, detail]) => (
              <div key={number} className="metal-card metal-shine group rounded-sm px-2.5 py-3">
                <p className="font-mono text-[8px] text-[#6FD7FF]">{number}</p>
                <p className="mt-2 text-[11px] font-medium text-[#DCEBF8]">{title}</p>
                <p className="mt-1 font-mono text-[7px] uppercase leading-relaxed tracking-[0.08em] text-[#6F89A6]">
                  {detail}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="capabilities" className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6">
        <div className="max-w-2xl">
          <p className="font-mono text-[8px] uppercase tracking-[0.22em] text-[#6FD7FF]">
            Investigation, not a black box
          </p>
          <h2 className="mt-1.5 text-3xl font-semibold tracking-[-0.03em]">
            A workspace built around the evidence.
          </h2>
          <p className="mt-2 text-[12px] leading-relaxed text-[#A9BFD6]">
            JAAL helps collect what happened, show what supports each finding, and keep
            the investigator in control of what becomes a reviewed conclusion.
          </p>
        </div>
        <div className="mt-7 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map((capability, index) => (
            <div key={capability.title} className="metal-card metal-shine group rounded-sm p-4">
              <div className="flex items-center justify-between">
                <span className="flex size-7 items-center justify-center border border-[#1B4368] bg-[#071426]">
                  <capability.icon className="size-3.5 text-[#6FD7FF]" />
                </span>
                <span className="font-mono text-[7px] uppercase tracking-[0.1em] text-[#3f566d]">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </div>
              <p className="mt-3 text-[11px] font-medium text-[#DCEBF8]">{capability.title}</p>
              <p className="mt-1.5 text-[10px] leading-relaxed text-[#8DA6C2]">{capability.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="trust" className="border-y border-[#153454] bg-[#071426]">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="font-mono text-[8px] uppercase tracking-[0.22em] text-[#F5C96A]">
              Provenance is part of the product
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">
              Synthetic never pretends to be real.
            </h2>
            <p className="mt-3 max-w-xl text-[12px] leading-relaxed text-[#A9BFD6]">
              JAAL has two clearly separated modes: evidence a user deliberately supplies,
              and labeled simulations used for training and demonstration. Findings start
              as proposed. A person reviews them. AI output is never presented as a
              confirmed scam or verified fact.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {([
                ["Source-linked findings", Fingerprint],
                ["Human review state", BadgeCheck],
                ["Original evidence preserved", LockKeyhole],
                ["No automatic reporting", ShieldCheck],
              ] as const).map(([label, Icon]) => (
                <span
                  key={String(label)}
                  className="inline-flex items-center gap-1.5 border border-[#1B4368] bg-[#071426] px-2.5 py-1.5 font-mono text-[8px] uppercase tracking-[0.08em] text-[#A9BFD6]"
                >
                  <Icon className="size-3 text-[#6FD7FF]" /> {label}
                </span>
              ))}
            </div>
          </div>
          <div className="metal-surface rounded-md">
            <div className="border-b border-[#153454] px-4 py-3">
              <p className="font-mono text-[8px] uppercase tracking-[0.14em] text-[#60788f]">
                Evidence rules
              </p>
              <p className="mt-1 text-[12px] text-[#6FD7FF]">
                What the console will and will not claim
              </p>
            </div>
            <dl className="divide-y divide-[#162436] font-mono text-[9px]">
              {[
                ["source content", "shown beside every finding"],
                ["machine transcript", "never silently rewritten"],
                ["corrections", "stored separately, timestamped"],
                ["voice confidence", "uncertainty shown, not hidden"],
                ["simulation", "labeled in conversation and report"],
                ["export", "manual, reviewed, exclusion-aware"],
              ].map(([key, value]) => (
                <div key={key} className="flex items-center justify-between gap-4 px-4 py-2">
                  <dt className="uppercase tracking-[0.08em] text-[#6F89A6]">{key}</dt>
                  <dd className="text-right text-[#c7d3e2]">{value}</dd>
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
              icon: GitBranch,
              title: "Five coherent scenarios",
              body: "Digital arrest, fake recruiter, held parcel, account takeover/OTP and blackmail — each with a staged arc, not a single seed message.",
            },
            {
              icon: BookOpenCheck,
              title: "Voice-first review",
              body: "Upload a call you already have. Inspect the timestamped transcript, seek the audio, and review each proposed finding against its moment.",
            },
            {
              icon: Waypoints,
              title: "One shared interpretation",
              body: "The board and timeline read the same persisted evidence. No separate manually maintained story that drifts from the case.",
            },
          ].map((item) => (
            <div key={item.title} className="metal-card metal-shine rounded-sm p-5">
              <item.icon className="size-5 text-[#6FD7FF]" />
              <h3 className="mt-3 text-[13px] font-semibold text-[#DCEBF8]">{item.title}</h3>
              <p className="mt-2 text-[11px] leading-relaxed text-[#8DA6C2]">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-[#153454] bg-[#071426]">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-start justify-between gap-5 px-4 py-10 sm:px-6 lg:flex-row lg:items-center">
          <div>
            <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-[#6FD7FF]">
              Capture → Interpret → Review → Connect → Act → Report
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.02em]">
              Open the case workspace.
            </h2>
            <p className="mt-1.5 max-w-xl text-[11px] leading-relaxed text-[#8DA6C2]">
              Create a synthetic case, attach a recording you own, or continue an existing
              investigation. Simulation is labeled. Nothing is sent anywhere automatically.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to={newCaseHref}
              className="metal-button inline-flex h-10 items-center gap-2 rounded-sm px-5 text-[11px] font-semibold"
            >
              New investigation <ArrowRight className="size-4" />
            </Link>
            <Link
              to={dashboardHref}
              className="metal-button-ghost inline-flex h-10 items-center gap-2 rounded-sm px-4 font-mono text-[9px] uppercase tracking-[0.12em]"
            >
              Case console
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-[#162436] px-4 py-5 sm:px-6">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-1 font-mono text-[7px] uppercase tracking-[0.14em] text-[#5E7896] sm:flex-row sm:items-center sm:justify-between">
          <span>JAAL · every message is a clue</span>
          <span>Scam investigation · synthetic simulations labeled · no automatic reports</span>
        </div>
      </footer>
    </div>
  );
}
