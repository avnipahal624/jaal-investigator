# JAAL — Scam Investigation Workspace

JAAL is a voice-first scam investigation workspace. It helps a person or investigator keep a suspicious interaction together, understand what happened, identify possible scam tactics, connect related evidence, review proposed findings, decide what to do next, and prepare a report.

The product has two clearly separated modes:

- **User-supplied evidence** — messages, notes and recordings deliberately added to a case. Analysis may be real when a provider is configured.
- **Simulation** — synthetic scam conversations and decoy calls used for training and demonstration. Every simulated item is labeled; no real scammer is contacted.

## What it does

- Creates and owns scam cases.
- Runs staged synthetic scam conversations across digital arrest, job offer, fake parcel, account takeover/OTP and blackmail scenarios.
- Displays scam stages and detected tactics against their supporting messages.
- Extracts indicators such as URLs, phone numbers, payment identifiers and claimed organizations.
- Connects messages, indicators, tactics and evidence on the evidence board, with source links and a list view.
- Preserves evidence with SHA-256 hashes and separates integrity verification from authenticity claims.
- Attaches call recordings to a case with consent, timestamped transcription, honest provider states, audio seeking and reviewed findings.
- Keeps a chronological timeline that distinguishes when an event happened from when JAAL learned about it.
- Generates case-specific “What should I do now?” actions and stores manual completion state.
- Produces a reviewed report with editable narrative, source evidence, exclusions, sensitive-material handling and export.
- Provides a consumer experience and an investigator copilot for scam-focused assistance.

JAAL does not make real outbound calls, submit reports automatically, contact banks or notify authorities. Users export reports themselves.

## Technology

- Vite
- React 19
- TypeScript
- React Router v7 (imports from `react-router`)
- Tailwind CSS v4
- shadcn/ui and Lucide icons
- Framer Motion
- Convex and Convex Auth
- Optional Groq-backed transcription and analysis

## Setup

The project is configured for the Freebuff/Convex environment. The platform runs the managed dev server and Convex process.

```bash
bun install
bun convex dev --once   # regenerate Convex bindings
bunx tsc -b --noEmit    # typecheck
bunx vitest run         # test suite
```

Do not start a second dev server manually.

### Environment

- `VITE_CONVEX_URL` — client Convex URL, already configured for the environment.
- `CONVEX_DEPLOYMENT` — Convex CLI deployment, already configured.
- Convex Auth variables already used by the app (`JWKS`, `JWT_PRIVATE_KEY`, `SITE_URL`).
- Optional `GROQ_API_KEY` — enables real speech-to-text and voice analysis when configured server-side. Keys stay on Convex and are never exposed to the browser.

When no speech provider is configured, voice intake reports transcription as unavailable rather than inventing a transcript.

## Main routes

- `/` — product landing page
- `/dashboard` — investigator dashboard
- `/investigations` — cases
- `/investigations/new` — create a case or synthetic scenario
- `/investigations/:id` — case workspace: Overview, Voice & Calls, Evidence Board, Timeline, Actions, Report
- `/evidence` — evidence archive
- `/voice-intake` — recording intake
- `/reports` and `/reports/:id` — reports and printable report view
- `/consumer/*` — consumer-facing scam guidance and reports

All investigator routes are authenticated. Case, voice, evidence, action and report records are owner-scoped and checked server-side.

## Evidence rules

- Original source messages and recordings are preserved.
- Transcript corrections and analyst review verdicts are stored separately with timestamps.
- AI-generated interpretation is shown as a suggestion, not a confirmed scam.
- A finding keeps its source message or audio timestamp wherever possible.
- Simulation provenance is visible in conversations, the timeline, the evidence flow and reports.
- Sensitive blackmail excerpts are hidden by default.
- Report export can exclude findings, tactics and sensitive material; this never edits the original evidence.
- SHA-256 proves content integrity only. It does not prove authorship, truth or legal admissibility.

## Voice and calls

Users explicitly choose and consent to upload a recording. The server verifies the stored bytes against the submitted SHA-256, then runs transcription and analysis through the configured provider. Processing states include queued, transcribing, analysing, ready, no speech, unavailable and failed.

The Call Companion can capture microphone audio after explicit browser permission and analyse it after recording. It cannot listen to a cellular phone line and does not claim live captions.

The AI Decoy Call is a bounded, clearly labeled simulation. It uses deterministic scenario scripts, cannot dial a real number, can be paused or ended, and its turns are added to the case only on request with simulation provenance.

## Testing

```bash
bunx vitest run
```

The suite covers authentication and owner isolation, evidence integrity, voice intake and provider states, simulation behavior, evidence graph relationships, reports and the case workspace. Convex bindings are generated with:

```bash
bunx convex dev --once
```

## Repository layout

- `src/` — React app, routes, components, state and services
- `src/convex/` — Convex schema and owner-scoped backend functions
- `src/convex/_generated/` — generated Convex bindings (regenerate; do not hand-edit)
- `src/data/` — synthetic scenario and demo data
- `src/pages/` — investigator and consumer routes
- `src/components/` — shared UI and investigation components
