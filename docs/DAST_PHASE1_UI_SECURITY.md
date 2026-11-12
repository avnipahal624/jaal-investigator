# JAAL Agentic DAST — Phase 1 UI and Security Preparation

Date: 2026-11-12  
Status: UI/UX implementation completed at the source level; browser-level visual and keyboard verification remains blocked by the environment.

## 1. Shared UI system

The ten pages now use the required security-operations palette:

| Token | Value |
|---|---|
| Background | `#0B1220` |
| Surface | `#152238` |
| Teal | `#2DD4BF` |
| Amber | `#F5B942` |
| Critical | `#F87171` |
| Primary text | `#E5EDF5` |

Shared primitives in `src/components/security/ui.tsx`:

- `Panel`, `Stat`, `Chip`, `SeverityBadge`, `ClassificationBadge`, `FindingStatusBadge`, `MethodBadge`
- `PageHeader`, `ActionButton`, `EmptyState`
- `LoadingState` — accessible skeleton with `role="status"` and `aria-live`
- `ErrorState` — accessible alert surface
- `Pagination` — labelled navigation with disabled boundary controls
- `ConfirmDialog` — Radix Alert Dialog for approved actions, retests, emergency stop and reset

## 2. Page-level changes

| Page | Change |
|---|---|
| Security Overview | Palette cleanup; reset confirmation now uses the shared accessible dialog instead of `window.confirm` |
| Live Investigations | Shared loading skeleton; pagination for investigation records; confirmed approve/execute and deny flows |
| Investigation Detail | Immutable plan/scope digest and expiry shown; accessible execute/deny confirmation; shared loading skeleton |
| API Explorer | Loading state; 10-row pagination; palette cleanup; searchable inventory retained |
| Knowledge Graph | Palette cleanup; node relationship colours limited to the shared palette |
| Agent Control Center | Loading state for persisted agents; existing backend-enforced pause/resume/cancel retained |
| Vulnerability Center | Loading state; 10-row pagination; confirmation for fixed-config batch retest |
| Deployment Intelligence | Loading state; existing prioritized change and investigation links retained |
| Evidence Vault | Loading state; 8-row pagination; browser SHA-256 verification and manifest export retained |
| Report Center | Loading state; existing Markdown/JSON/print exports retained |
| Safety & Settings | Dedicated loading state; mandatory-approval badge replaces the disabling switch; accessible emergency-stop and reset dialogs |

The guided synthetic-lab flow is unchanged: initialize → trigger deployment → approve → execute → inspect findings/evidence → apply fix → retest.

## 3. Security preparation

### Canonical serialization

New `src/convex/dast/canonical.ts`:

- recursively sorts object keys;
- preserves array order;
- drops `undefined` fields;
- refuses non-finite numbers;
- exposes compact and pretty canonical JSON.

Approval digests use canonical JSON (`digestVersion: 2`). A legacy v1 digest path remains so approvals created before the migration can still be recognised and upgraded on approval. New approvals are written at version 2.

### Recursive redaction

New `src/convex/dast/redaction.ts`:

- redacts authorization, proxy-authorization, cookie, set-cookie, token, password, secret, API key, session, CSRF and XSRF keys at every nesting depth;
- masks email and PNR/booking reference fields;
- redacts bearer tokens, JWT-shaped strings, key-shaped strings and `session=`/`csrf=`/`xsrf=` values inside free text and arrays;
- produces canonical, sanitized evidence text used for SHA-256 hashing;
- does not mutate the input object.

### Approval invalidation

- `updatePolicy` expires all `PENDING` and `APPROVED` approvals for the application and reports the count.
- `setLabMode` does the same when the vulnerable/fixed configuration changes.
- Emergency stop already expires open approvals and cancels queued jobs.
- Execution rechecks policy, target, deployment, plan set and both digests before consuming the approval.

### Budget and concurrency

- Plans are blocked **before dispatch** when planned requests exceed the plan or remaining run budget.
- Blocked plans create durable `BLOCKED` execution rows with a `PREFLIGHT` assertion and an audit event.
- Actual request counts are still checked after each run.
- Concurrent execution test proves only one approval consumption can succeed.
- Policy and lab changes invalidate approvals rather than silently changing the approved scope.

### Idempotency

- Approval consumption is atomic inside the mutation.
- Completed investigations cannot be re-executed.
- `retestAll` skips findings already marked `FIXED`; a second batch does not duplicate retest evidence.
- `retestFinding` returns the existing fixed state without writing a new artifact.

## 4. External execution

`docs/DAST_EXTERNAL_EXECUTION_DESIGN.md` documents the disabled architecture:

- authorized staging target registration and proof-of-control workflow;
- isolated worker envelope with no LLM-authored URLs;
- durable queue/lease/retry/dead-letter semantics;
- SSRF, private-network and DNS-rebinding controls;
- redirect, timeout, response-size and cancellation policy;
- OpenAPI ingestion limits;
- per-target rate/concurrency controls;
- enablement test gates.

External execution remains disabled. No target URL can be registered from the UI and no outbound runner exists.

## 5. Verification

| Command | Result |
|---|---|
| `bunx vitest run` | **368 tests / 21 files passed** |
| DAST integration | **18 passed** |
| DAST engine | **14 passed** |
| Canonical/redaction | **7 passed** |
| `bunx tsc -b --noEmit` | exit 0 |
| `bunx convex dev --once` | functions ready |
| `bunx eslint` (security/DAST scope) | exit 0 |
| `bun run build` | exit 0 |

The Vite dev server was not reachable at the final transform check (`ERR 000`), so module transforms were not rechecked. The production build succeeded. No browser or Playwright tooling is available.

## 6. Remaining limitations

- No browser-level visual, responsive, keyboard or print verification.
- No Playwright tests.
- External execution and target registration remain unimplemented by design.
- No organization-level RBAC.
- No server-side PDF renderer.
- No signed deployment webhooks, GitHub/Jira adapters or CI/CD status integration.
- Concurrency enforcement is job/lease based; a separate worker is required before external testing.
- Rate limiting is audit-based, not a dedicated token bucket.
- Git operations remain blocked by the host.
