# JAAL Agentic DAST — External Execution Design (Disabled)

Status: **design only — external execution is not implemented or enabled.**  
The shipped product still runs only against the in-process synthetic travel lab at `https://lab.jaal.internal`.

This document defines the gates that must exist before any authorized staging target can be tested. It intentionally does not add a target-registration UI or an outbound HTTP runner.

## 1. Non-negotiable gates

External execution remains impossible unless all of the following are true:

1. A feature flag is explicitly enabled server-side (`DAST_EXTERNAL_EXECUTION=enabled`).
2. An `AUTHORIZED` target exists with a signed authorization record and an expiry.
3. The operator has completed the staging-target registration workflow.
4. A preflight has passed for DNS, TLS, scope, budget, concurrency and target health.
5. An immutable plan/scope digest has been approved after preflight.
6. The isolated worker accepts a signed job envelope that names the digest.
7. The worker's egress policy permits only the pinned target address.
8. Emergency stop is clear and the worker has a live cancellation channel.

Any missing condition is a hard refusal, not a warning.

## 2. Authorized target registration

Proposed record:

```ts
type ExternalTargetAuthorization = {
  owner: string;
  applicationId: Id<"dastApplications">;
  hostname: string;
  baseUrl: string;             // https only, default port
  allowedPaths: string[];      // explicit, normalized prefixes
  authorizationMethod: "DNS_TXT" | "SIGNED_ATTESTATION" | "MANUAL_REVIEW";
  authorizationProofHash: string;
  authorizedBy: string;
  authorizedAt: number;
  expiresAt: number;           // short-lived, e.g. 24 hours
  status: "PENDING" | "AUTHORIZED" | "EXPIRED" | "REVOKED";
};
```

Registration workflow:

1. Operator enters an HTTPS origin and business justification.
2. Server rejects IP literals, userinfo, non-443 ports, paths outside the declared scope and known cloud-metadata names.
3. Operator proves control through a DNS TXT challenge under the target domain or uploads a signed authorization attestation reviewed by a human.
4. The proof hash, authorizer and expiry are stored immutably and audited.
5. The target remains `PENDING`; no test can run until a second human marks it `AUTHORIZED`.
6. Revocation and expiry take effect before the next request.

No “just add a URL” path is acceptable.

## 3. Isolated worker boundary

```text
Convex orchestration
  → signed job envelope (no arbitrary URL from the LLM)
  → durable queue / lease
  → isolated worker (separate process, no database credentials)
  → egress proxy / pinned DNS
  → authorized target
  → sanitized result envelope
  → Convex evidence hash + audit
```

The worker receives only:

- target origin and normalized path
- one catalog test key / immutable test definition
- synthetic role identifiers or disposable test accounts
- approved request budget and timeout
- plan digest, scope digest and job idempotency key
- cancellation token / emergency-stop generation

The worker must not accept a URL, method, header or body authored by the LLM. It must not have Convex write credentials. It returns results; Convex validates and persists them.

## 4. Queue, leases and state transitions

`dastJobs` already provides a persistent row shape with `status`, `attempts`, `leaseUntil`, `payload`, `lastError` and `updatedAt`.

Required semantics:

- `QUEUED → LEASED → RUNNING → SUCCEEDED | FAILED | CANCELLED`
- Worker heartbeat extends the lease; a stale lease is recoverable.
- `attempts` is bounded; exhausted jobs go to `DEAD_LETTER` and require human review.
- The job idempotency key is unique per investigation + plan digest + attempt.
- A retry never reuses a consumed approval; it must reference the same approved digest or request a new approval.
- A crash after dispatch must be reconciled by a request-correlation id, not blindly retried.
- Emergency stop increments a cancellation generation; workers poll it before every request and abort in-flight work where the HTTP client permits.

## 5. SSRF and DNS-rebinding controls

Before dispatch and again before each request:

1. Resolve the allowlisted hostname.
2. Reject loopback, link-local, private, carrier-grade NAT, multicast, unspecified and cloud-metadata ranges (IPv4 and IPv6).
3. Reject hostnames ending in `.local`, `.internal`, `.localhost` unless they are the synthetic lab.
4. Pin the resolved address for the connection while preserving the TLS SNI hostname.
5. Re-resolve on every request and abort if the answer changes outside policy.
6. Disable automatic redirects. A redirect is a terminal failure, never followed.
7. Use an egress proxy with a deny-by-default network policy.
8. Enforce response size, content-type and time limits.
9. Never forward cookies, authorization headers or proxy credentials from the operator.

The current synthetic lab is exempt because it is an in-process function, not a network destination.

## 6. OpenAPI 3.x ingestion

- Accept JSON or YAML with a hard size limit (for example 2 MB).
- Reject external `$ref` values; resolve only local references.
- Validate against an OpenAPI 3.0/3.1 schema.
- Reject non-HTTP(S) servers, userinfo, non-default ports and hosts outside the registered target.
- Import paths and methods as `UNKNOWN`/`DOCUMENTED` inventory candidates.
- Never treat imported paths as authorized. A human must approve the final scope.
- Never execute from an imported example, default, callback, webhook or link.
- Mark every inferred field as inferred.

## 7. Timeouts, rate limits and budgets

- Connect timeout: 5 s; total request timeout: 10 s; response body cap: 1 MB.
- Per-plan request cap: 20; global run cap: policy value (default 60).
- Per-target token bucket at the worker, not only in Convex.
- Per-target concurrency cap and a global worker concurrency cap.
- Bounded retries with jitter only for idempotent safe requests.
- Preflight blocks a plan before dispatch when its planned request count cannot fit.
- Actual request count is recorded even when a request fails.
- Every response is truncated and sanitized before it leaves the worker.

## 8. Approval binding to the worker

The worker receives a signed envelope containing:

```json
{
  "jobId": "...",
  "planDigest": "sha256:...",
  "scopeDigest": "sha256:...",
  "targetOrigin": "https://staging.example.test",
  "allowedPaths": ["/api/"],
  "testKeys": ["..."],
  "budget": 12,
  "expiresAt": 0
}
```

The signature is produced by Convex with a worker-only key. The worker refuses if:

- the digest does not match its copy of the plan;
- the target origin differs from the authorized target;
- the envelope is expired or already consumed;
- the cancellation generation is newer than the envelope.

## 9. Enablement criteria

External execution must stay disabled until all of these are verified:

- Unit tests for canonical digests, redaction, scope validation and target registration.
- Negative tests for private IPs, metadata IPs, DNS rebinding, redirects, slow responses, oversized bodies and cancellation.
- Integration tests proving emergency stop prevents dispatch and stops queued jobs.
- Concurrency tests proving one approval cannot dispatch twice.
- Evidence-integrity tests proving worker output cannot alter hashes.
- A manual security review of the egress proxy and worker sandbox.
- A staging environment with explicit written authorization.

Until then, the only supported transport is `IN_PROCESS_LAB`.
