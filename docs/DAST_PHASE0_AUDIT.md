# JAAL Agentic DAST — Phase 0 Audit and P0 Corrections

Date: 2026-11-12  
Scope: existing JAAL repository, focused on `/security` and `dast*` data.  
This is an audit record, not a claim that all roadmap phases are complete.

## 1. Baseline commands and results

Commands were run from the project root.

| Command | Baseline | After P0 |
|---|---|---|
| `bunx vitest run` | **350 tests / 19 files passed** | **358 tests / 19 files passed** |
| DAST engine tests | 12 passed | **14 passed** |
| DAST integration tests | 9 passed | **15 passed** |
| `bunx tsc -b --noEmit` | exit 0 | **exit 0** |
| `bunx convex dev --once` | functions ready | **functions ready** |
| `bun run build` | not captured before edits | **exit 0** |
| `bunx eslint` (security/DAST scope) | not clean | **exit 0** |

The initial combined `vite build` command was blocked by the host process guard; the project's own `bun run build` was then run successfully and is the recorded build result.

## 2. Feature matrix

### Implemented and verified by tests

- Owner-scoped authentication on DAST queries/mutations; cross-owner investigation access refused.
- Deterministic deployment → discovery → classification → planning pipeline.
- Seven persisted agents with status, task, duration, success/error and investigation reference.
- 12 synthetic endpoints: 10 active, 1 zombie, 1 shadow.
- Six business-logic scenarios with control and attack assertions.
- Verified findings only when the control passes and the boundary violation is asserted.
- Sanitized evidence with server-side SHA-256 and a browser-side integrity check.
- Human approval gate, emergency stop, paused-agent checks and append-only-style audit events.
- Report generation with Markdown/JSON export and browser print styling.
- Fixed-config retest with per-finding and batch flows.
- Optional Groq advisory rationales, Zod validated and excluded from executable parameters.

### Partially implemented

| Area | State | Gap |
|---|---|---|
| UI/UX | Shared shell, tokens, focus-visible styles, skip link, mobile Escape handling and confirmation dialogs added | The ten pages have not had a full visual/interaction redesign or browser review |
| Rate limiting | Audit-based per-owner mutation windows | No token bucket, IP/account dimension or durable limiter |
| Concurrency | Active-job lease check and serialized in-process execution | No external worker pool or queue daemon |
| Evidence verification | Stored SHA-256 + browser recomputation | No server-side verification action or signature/notarisation |
| Reports | Markdown, JSON, print CSS | No server-side PDF renderer; print output not browser-tested |
| Agent intelligence | Deterministic planner + advisory Groq text | No adaptive planning or confidence calibration from real runs |

### Missing by design or not yet implemented

- External isolated execution runner / HTTP transport.
- Authorized staging-target registration with proof of ownership.
- OpenAPI 3.x import and schema-aware classification.
- Playwright crawler, HAR ingestion, ZAP integration.
- Signed deployment webhooks with replay protection.
- GitHub issue creation, Jira integration, CI/CD status reporting.
- Organization-level RBAC.
- Evidence retention automation and scheduled retests.
- Playwright/browser tests; no browser is available in this environment.

### Broken findings fixed in P0

1. **Approval was not bound to plan content or scope.** `dastApprovals` now stores a SHA-256 plan digest and scope digest. Approval and execution recompute and compare them.
2. **Policy could disable human approval.** `updatePolicy` now rejects `approvalRequired: false`; execution also refuses a policy that is not approval-required.
3. **Duplicate execution was possible.** Execution now requires `WAITING_FOR_APPROVAL`, consumes the approval once, and refuses a completed/consumed investigation.
4. **Approval replay/staleness.** Approvals expire 30 minutes after the human approves; execution refuses an expired or mismatched gate.
5. **Retests were not explicitly confirmed.** Per-finding and batch retests require `confirmed: true`; the UI uses a confirmation dialog.
6. **Emergency stop left approved gates usable.** It now cancels queued investigations, expires PENDING and APPROVED approvals, and cancels active job rows.
7. **Scope checks accepted non-default ports and weak path prefixes.** Non-443 ports, encoded traversal, control characters and prefix lookalikes are rejected.
8. **Sensitive strings inside evidence values were not redacted.** Bearer tokens, JWT-shaped strings and key-shaped strings are redacted in addition to sensitive field names.
9. **Bootstrap could throw during auth-token propagation.** The bootstrap query now returns `null` for a missing identity instead of taking down the security shell.
10. **Critical actions lacked confirmations.** Approve/execute, deny, retest and emergency-stop/reset now use an accessible confirmation dialog.

## 3. Security implications

- Approval is now an authorisation record over an immutable plan/scope fingerprint, not just a status flag.
- A same-owner caller cannot replay a completed execution or reuse an old approval after a plan/scope change.
- Scope escape is rejected before dispatch; the synthetic lab remains the only transport.
- Emergency stop has a defined effect on queued work and approvals. It cannot interrupt an already-running synchronous mutation; this is a documented residual risk until an external cancellable worker exists.
- Evidence hashes prove content integrity only. They do not prove real-world exploitation, ownership of an external target, or legal admissibility.
- All results remain synthetic-lab results. No production TBO system was contacted.

## 4. Remaining blockers and residual risks

- **No Git branch/commit/push:** the host blocks Git operations. Isolation is by `/security` routes, `dast*` tables and owner scoping, plus the verified pre-change archive.
- **No browser/Playwright:** visual layout, keyboard traversal, mobile breakpoints and print output have not been inspected in a browser.
- **No external runner:** all tests execute in-process; there is no network, DNS, TLS, redirect or timeout surface to validate yet.
- **Synchronous execution:** large plans would run inside a Convex mutation. A durable worker and resumable state machine are required before external scanning.
- **No organizational RBAC:** only the authenticated owner boundary is enforced.
- **Rate limiting is coarse:** it is based on audit event counts, not a dedicated limiter.
- **No server-side PDF:** print styling is implemented, but PDF generation has not been browser-verified.
- **Disk:** approximately 81 MB was free at the start of the audit; avoid adding dependencies or large artifacts.

## 5. Next recommended phase

Proceed to Phase 1 (full ten-page UI/UX review) and Phase 3 (authorized external target registration plus an isolated worker interface) only after browser tooling or a human visual pass is available. Do not enable external execution until DNS/SSRF/redirect/timeout/cancellation and durable queue tests pass.
