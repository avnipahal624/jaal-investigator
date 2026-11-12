/**
 * Deterministic DAST test catalogue and verification engine.
 *
 * The planner selects from this finite catalogue. Every test has a control
 * assertion and an attack assertion; a candidate becomes VERIFIED only when
 * the control behaves as expected AND the security boundary is actually
 * crossed. An LLM may explain the plan, but it can never add a test or bypass
 * these rules.
 */
import {
  dispatchLabRequest,
  LAB_ACTORS,
  type LabActorId,
  type LabMode,
  type LabRequest,
  type LabResponse,
  type LabState,
} from "./lab";

export type DastTestKey =
  | "bola-booking"
  | "role-credit"
  | "fare-tamper"
  | "refund-replay"
  | "zombie-legacy"
  | "shadow-metrics";

export type DastTestDefinition = {
  key: DastTestKey;
  category: string;
  title: string;
  endpointPath: string;
  method: "GET" | "POST";
  role: LabActorId;
  fixture: string;
  expected: string;
  validation: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  technicalSeverity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  businessImpact: string;
  ownerTeam: string;
  rootCause: string;
  remediation: string;
  stopConditions: string[];
  maxRequests: number;
};

export const TEST_CATALOG: DastTestDefinition[] = [
  {
    key: "bola-booking",
    category: "Broken object-level authorization",
    title: "Cross-agency booking access",
    endpointPath: "/api/bookings/:id",
    method: "GET",
    role: "agency-b-admin",
    fixture:
      "Synthetic booking BK-A-1001 belongs to Agency A; the test actor is an Agency B administrator.",
    expected:
      "The booking read is refused for Agency B (403/404) and no Agency A traveller fields are returned.",
    validation:
      "Control reads BK-B-2001 as Agency B (200). Attack reads BK-A-1001 as the same actor and asserts the response contains Agency A data.",
    severity: "CRITICAL",
    technicalSeverity: "CRITICAL",
    businessImpact:
      "An agency administrator can read another agency's traveller name, PNR and fare. This breaks tenant isolation and exposes sensitive travel records.",
    ownerTeam: "Travel Platform · Booking API",
    rootCause:
      "The booking reader authenticates the caller but does not compare booking.agencyId with the caller's agency scope.",
    remediation:
      "Derive the agency from the server-side identity, query the booking with both bookingId and agencyId, and return 404 when the scoped lookup misses. Add a regression test with two synthetic agencies.",
    stopConditions: [
      "Control booking is not readable by its owning agency",
      "Response status is 5xx",
      "Request budget exhausted",
    ],
    maxRequests: 4,
  },
  {
    key: "role-credit",
    category: "Broken function-level authorization",
    title: "Sub-agent agency credit adjustment",
    endpointPath: "/api/agencies/:id/credit",
    method: "POST",
    role: "agency-a-subagent",
    fixture:
      "Agency A sub-agent attempts to adjust Agency A's synthetic credit limit. An Agency A admin performs the control.",
    expected: "The write is refused for SUB_AGENT with 403.",
    validation:
      "Control adjusts credit as Agency A admin (200). Attack repeats the call as a sub-agent and asserts a 2xx response.",
    severity: "HIGH",
    technicalSeverity: "HIGH",
    businessImpact:
      "A low-privilege sub-agent can modify agency credit, enabling unauthorized commercial exposure and fraudulent bookings.",
    ownerTeam: "Travel Platform · Agency API",
    rootCause:
      "The endpoint checks authentication but not the required AGENCY_ADMIN role before applying credit changes.",
    remediation:
      "Enforce an explicit role policy at the handler boundary, deny SUB_AGENT by default, and audit every credit mutation with actor and agency.",
    stopConditions: ["Control admin request is denied", "Response status is 5xx"],
    maxRequests: 4,
  },
  {
    key: "fare-tamper",
    category: "Fare and markup integrity",
    title: "Client-controlled fare accepted by quotation API",
    endpointPath: "/api/fare/quote",
    method: "POST",
    role: "agency-a-admin",
    fixture:
      "A synthetic quotation is requested with a correct computed fare, then with a client-supplied fare of INR 1.",
    expected:
      "The server recomputes the fare and rejects a mismatched client value with 400.",
    validation:
      "Control sends the server-computed fare (200). Attack sends fare=1 and asserts the response accepts the tampered amount.",
    severity: "HIGH",
    technicalSeverity: "HIGH",
    businessImpact:
      "A tampered fare can propagate into booking and payment flows, causing revenue loss and invalid supplier commitments.",
    ownerTeam: "Travel Platform · Pricing API",
    rootCause:
      "The quotation handler trusts the client-supplied fare field instead of recomputing fare and markup server-side.",
    remediation:
      "Ignore client fare fields for pricing, recompute from supplier cost and approved markup, and reject mismatches with a machine-readable error.",
    stopConditions: ["Control quote is rejected", "Response status is 5xx"],
    maxRequests: 4,
  },
  {
    key: "refund-replay",
    category: "Refund authorization and idempotency",
    title: "Duplicate refund on idempotency-key replay",
    endpointPath: "/api/refunds",
    method: "POST",
    role: "agency-a-admin",
    fixture:
      "A synthetic refund is submitted twice with the same idempotency key against booking BK-A-1001.",
    expected:
      "The replay returns the original refund or a conflict; it must not create a second refund.",
    validation:
      "Control creates the first refund (201). Attack replays the same key and asserts a second, different refund identifier.",
    severity: "HIGH",
    technicalSeverity: "HIGH",
    businessImpact:
      "A retried or replayed refund request can create duplicate payouts and directly affect agency credit and reconciliation.",
    ownerTeam: "Travel Platform · Refund API",
    rootCause:
      "The refund handler does not persist or enforce the idempotency key before creating a refund record.",
    remediation:
      "Store the idempotency key with the refund in a unique index, return the original result on replay, and serialize concurrent attempts.",
    stopConditions: ["Control refund is not created", "Response status is 5xx"],
    maxRequests: 4,
  },
  {
    key: "zombie-legacy",
    category: "Zombie endpoint security regression",
    title: "Deprecated booking reader accessible without authentication",
    endpointPath: "/api/legacy/bookings/:id",
    method: "GET",
    role: "agency-b-admin",
    fixture:
      "The deprecated reader has no legitimate traffic for 47 days but still returns synthetic booking BK-A-1001.",
    expected: "The endpoint requires authentication and agency scope, or is removed.",
    validation:
      "Control reads the booking as platform admin (200). Attack sends an unauthenticated request and asserts traveller data is returned.",
    severity: "CRITICAL",
    technicalSeverity: "CRITICAL",
    businessImpact:
      "An obsolete route bypasses current authorization and exposes traveller PNR data to anyone who knows a booking identifier.",
    ownerTeam: "Travel Platform · Legacy Integrations",
    rootCause:
      "A deprecated supplier-compatibility route was left deployed after its authentication wrapper was removed.",
    remediation:
      "Remove the route or place it behind the current authentication and agency-scope middleware. Add a decommission date and gateway deny rule.",
    stopConditions: ["Control platform-admin read fails", "Response status is 5xx"],
    maxRequests: 4,
  },
  {
    key: "shadow-metrics",
    category: "Shadow endpoint authorization gap",
    title: "Undocumented agency metrics exposes cross-agency data",
    endpointPath: "/api/internal/agency-metrics",
    method: "GET",
    role: "agency-a-admin",
    fixture:
      "An undocumented metrics route observed in gateway traffic is called by an Agency A admin.",
    expected:
      "The route is documented and scoped to the caller's agency, or restricted to platform administrators.",
    validation:
      "Control calls the route as platform admin (200). Attack calls it as Agency A admin and asserts Agency B metrics are present.",
    severity: "MEDIUM",
    technicalSeverity: "HIGH",
    businessImpact:
      "Agency administrators can infer competitor booking volume, credit utilization and refund activity from an undocumented internal route.",
    ownerTeam: "Travel Platform · Internal Analytics",
    rootCause:
      "An internal analytics handler was exposed through the public gateway without documentation or agency scoping.",
    remediation:
      "Document or remove the route, require platform-admin authorization or enforce agency scoping, and add it to the gateway inventory review.",
    stopConditions: ["Control platform-admin request fails", "Response status is 5xx"],
    maxRequests: 4,
  },
];

export function definitionFor(testKey: string): DastTestDefinition {
  const found = TEST_CATALOG.find((test) => test.key === testKey);
  if (!found) throw new Error(`Unsupported test key: ${testKey}`);
  return found;
}

export type LabExchange = {
  request: {
    method: string;
    path: string;
    actor: string | null;
    actorRole: string | null;
    body: unknown;
  };
  response: {
    status: number;
    requestId: string;
    body: Record<string, unknown>;
    transport: string;
  };
};

export type DastTestRun = {
  testKey: DastTestKey;
  category: string;
  title: string;
  violated: boolean;
  controlPassed: boolean;
  confidence: number;
  expected: string;
  actual: string;
  controlDetail: string;
  requests: LabExchange[];
  evidence: {
    request: LabExchange["request"];
    response: LabExchange["response"];
  };
  requestCount: number;
  verificationStatus: "VERIFIED" | "FALSE_POSITIVE" | "INCONCLUSIVE";
};

export type PlanTarget = {
  baseUrl: string;
  allowedHosts: string[];
  allowedPaths: string[];
};

export type PlanValidation =
  | { ok: true }
  | { ok: false; reason: string };

const SAFE_METHODS = new Set(["GET", "POST"]);

/** Deterministic scope validation. Applied to every plan and every request. */
export function validateScope(
  target: PlanTarget,
  method: string,
  path: string,
  maxRequests = 20,
): PlanValidation {
  if (!SAFE_METHODS.has(method.toUpperCase())) {
    return { ok: false, reason: `Method ${method} is not permitted by the lab safety policy.` };
  }
  if (maxRequests < 1 || maxRequests > 20) {
    return { ok: false, reason: "Request budget must be between 1 and 20 per plan." };
  }
  let url: URL;
  try {
    url = new URL(path.startsWith("http") ? path : `${target.baseUrl}${path}`);
  } catch {
    return { ok: false, reason: "Target URL could not be parsed." };
  }
  if (url.protocol !== "https:") {
    return { ok: false, reason: "Only HTTPS targets are authorized." };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "Credentials are not permitted in target URLs." };
  }
  if (url.port && url.port !== "443") {
    return { ok: false, reason: "Only the default HTTPS port is authorized." };
  }
  const host = url.hostname.toLowerCase();
  if (!target.allowedHosts.some((allowed) => allowed.toLowerCase() === host)) {
    return { ok: false, reason: `Host ${host} is outside the authorized allowlist.` };
  }
  let decodedPath = url.pathname;
  try {
    decodedPath = decodeURIComponent(url.pathname);
  } catch {
    return { ok: false, reason: "Target path contains invalid encoding." };
  }
  const hasControlCharacter = Array.from(decodedPath).some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 32 || code === 127;
  });
  if (decodedPath.includes("..") || decodedPath.includes("\\") || hasControlCharacter) {
    return { ok: false, reason: "Target path contains traversal or control characters." };
  }
  const inScope = target.allowedPaths.some((prefix) => {
    const normalized = prefix.endsWith("/") ? prefix : `${prefix}/`;
    return decodedPath === prefix || decodedPath.startsWith(normalized);
  });
  if (!inScope) {
    return { ok: false, reason: `Path ${decodedPath} is outside the authorized path scope.` };
  }
  return { ok: true };
}

function emptyState(): LabState {
  return { refunds: [] };
}

function maskEmail(value: unknown): string {
  if (typeof value !== "string") return "—";
  const [local, domain] = value.split("@");
  return `${(local ?? "?")[0] ?? "?"}•••@${domain ?? "example.test"}`;
}

function maskPnr(value: unknown): string {
  if (typeof value !== "string" || value.length < 3) return "•••";
  return `${value.slice(0, 2)}-••`;
}

function bodyOf(response: LabResponse): Record<string, unknown> {
  return response.body ?? {};
}

function exchange(
  request: LabRequest,
  response: LabResponse,
): LabExchange {
  const actor = request.actor ? LAB_ACTORS[request.actor] : null;
  return {
    request: {
      method: request.method,
      path: request.path,
      actor: actor?.label ?? null,
      actorRole: actor?.role ?? null,
      body: request.body ?? null,
    },
    response: {
      status: response.status,
      requestId: response.requestId,
      body: bodyOf(response),
      transport: response.transport,
    },
  };
}

/**
 * Execute one catalogue test in a given lab configuration. This is a pure
 * function over the synthetic lab; the caller owns persistence, hashing,
 * approval and budget accounting.
 */
export function runDastTest(testKey: DastTestKey, mode: LabMode): DastTestRun {
  const definition = definitionFor(testKey);
  const state = emptyState();
  const exchanges: LabExchange[] = [];
  let requestNumber = 0;

  const send = (request: LabRequest): LabResponse => {
    requestNumber += 1;
    const response = dispatchLabRequest(mode, request, state, requestNumber);
    exchanges.push(exchange(request, response));
    return response;
  };

  const result = (args: {
    controlPassed: boolean;
    violated: boolean;
    controlDetail: string;
    actual: string;
    evidenceIndex: number;
    confidence?: number;
  }): DastTestRun => {
    const verified = args.violated && args.controlPassed;
    return {
      testKey,
      category: definition.category,
      title: definition.title,
      violated: args.violated,
      controlPassed: args.controlPassed,
      confidence: args.confidence ?? (verified ? 0.98 : 0.9),
      expected: definition.expected,
      actual: args.actual,
      controlDetail: args.controlDetail,
      requests: exchanges,
      evidence: {
        request: exchanges[args.evidenceIndex]?.request ?? exchanges[0]!.request,
        response: exchanges[args.evidenceIndex]?.response ?? exchanges[0]!.response,
      },
      requestCount: requestNumber,
      verificationStatus: verified
        ? "VERIFIED"
        : args.controlPassed
          ? "FALSE_POSITIVE"
          : "INCONCLUSIVE",
    };
  };

  if (testKey === "bola-booking") {
    const control = send({
      method: "GET",
      path: "/api/bookings/BK-B-2001",
      actor: "agency-b-admin",
    });
    const attack = send({
      method: "GET",
      path: "/api/bookings/BK-A-1001",
      actor: "agency-b-admin",
    });
    const controlBody = bodyOf(control);
    const attackBody = bodyOf(attack);
    const controlPassed =
      control.status === 200 && controlBody.agencyId === "AG-B";
    const leaked =
      attack.status === 200 &&
      attackBody.agencyId === "AG-A" &&
      typeof attackBody.travellerName === "string";
    return result({
      controlPassed,
      violated: leaked,
      controlDetail: controlPassed
        ? "Agency B read its own booking BK-B-2001 (200)."
        : `Own-booking control returned ${control.status}; verification cannot proceed.`,
      actual: leaked
        ? `Agency B received 200 with Agency A booking ${String(attackBody.id)}, PNR ${maskPnr(attackBody.pnr)}, traveller ${maskEmail(attackBody.travellerEmail)}.`
        : `Agency B booking read returned ${attack.status}; no Agency A data was returned.`,
      evidenceIndex: 1,
    });
  }

  if (testKey === "role-credit") {
    const control = send({
      method: "POST",
      path: "/api/agencies/AG-A/credit",
      actor: "agency-a-admin",
      body: { amount: 25_000 },
    });
    const attack = send({
      method: "POST",
      path: "/api/agencies/AG-A/credit",
      actor: "agency-a-subagent",
      body: { amount: 25_000 },
    });
    const controlPassed = control.status === 200;
    const violated = attack.status >= 200 && attack.status < 300;
    return result({
      controlPassed,
      violated,
      controlDetail: controlPassed
        ? "Agency A admin adjusted credit (200)."
        : `Admin control returned ${control.status}; verification cannot proceed.`,
      actual: violated
        ? `Agency A sub-agent received ${attack.status} and the credit adjustment was applied.`
        : `Agency A sub-agent received ${attack.status}; the privileged write was refused.`,
      evidenceIndex: 1,
    });
  }

  if (testKey === "fare-tamper") {
    const control = send({
      method: "POST",
      path: "/api/fare/quote",
      actor: "agency-a-admin",
      body: { baseFare: 48_200, fare: 50_610 },
    });
    const attack = send({
      method: "POST",
      path: "/api/fare/quote",
      actor: "agency-a-admin",
      body: { baseFare: 48_200, fare: 1 },
    });
    const controlBody = bodyOf(control);
    const attackBody = bodyOf(attack);
    const controlPassed =
      control.status === 200 && Number(controlBody.acceptedFare) === 50_610;
    const violated =
      attack.status === 200 && Number(attackBody.acceptedFare) === 1;
    return result({
      controlPassed,
      violated,
      controlDetail: controlPassed
        ? "Server accepted the correctly computed fare of INR 50,610."
        : `Control quotation returned ${control.status} with fare ${String(controlBody.acceptedFare)}.`,
      actual: violated
        ? `Server accepted a client-supplied fare of INR 1 against a base fare of INR 48,200 (serverValidated=false).`
        : `Tampered quotation returned ${attack.status}; the server rejected or recomputed the fare.`,
      evidenceIndex: 1,
    });
  }

  if (testKey === "refund-replay") {
    const first = send({
      method: "POST",
      path: "/api/refunds",
      actor: "agency-a-admin",
      body: {
        bookingId: "BK-A-1001",
        amount: 48_200,
        idempotencyKey: "idem-synthetic-refund-001",
      },
    });
    const replay = send({
      method: "POST",
      path: "/api/refunds",
      actor: "agency-a-admin",
      body: {
        bookingId: "BK-A-1001",
        amount: 48_200,
        idempotencyKey: "idem-synthetic-refund-001",
      },
    });
    const firstBody = bodyOf(first);
    const replayBody = bodyOf(replay);
    const controlPassed = first.status === 201 && typeof firstBody.refundId === "string";
    const duplicate =
      replay.status === 201 &&
      typeof replayBody.refundId === "string" &&
      replayBody.refundId !== firstBody.refundId;
    return result({
      controlPassed,
      violated: duplicate,
      controlDetail: controlPassed
        ? `First refund ${String(firstBody.refundId)} was created (201).`
        : `First refund returned ${first.status}; verification cannot proceed.`,
      actual: duplicate
        ? `The same idempotency key produced a second refund ${String(replayBody.refundId)} (total ${String(replayBody.refundCount)}).`
        : `The replay returned ${replay.status} with refund ${String(replayBody.refundId)}; no duplicate payout was created.`,
      evidenceIndex: 1,
    });
  }

  if (testKey === "zombie-legacy") {
    const control = send({
      method: "GET",
      path: "/api/legacy/bookings/BK-A-1001",
      actor: "platform-admin",
    });
    const attack = send({
      method: "GET",
      path: "/api/legacy/bookings/BK-A-1001",
    });
    const attackBody = bodyOf(attack);
    const controlPassed = control.status === 200;
    const leaked =
      attack.status === 200 && typeof attackBody.travellerName === "string";
    return result({
      controlPassed,
      violated: leaked,
      controlDetail: controlPassed
        ? "Platform admin could read the deprecated booking (200)."
        : `Platform-admin control returned ${control.status}.`,
      actual: leaked
        ? `Unauthenticated request returned 200 with PNR ${maskPnr(attackBody.pnr)} and traveller ${maskEmail(attackBody.travellerEmail)}.`
        : `Unauthenticated request returned ${attack.status}; no traveller data was returned.`,
      evidenceIndex: 1,
    });
  }

  // shadow-metrics
  const control = send({
    method: "GET",
    path: "/api/internal/agency-metrics",
    actor: "platform-admin",
  });
  const attack = send({
    method: "GET",
    path: "/api/internal/agency-metrics",
    actor: "agency-a-admin",
  });
  const controlBody = bodyOf(control);
  const attackBody = bodyOf(attack);
  const controlAgencies = Array.isArray(controlBody.agencies)
    ? (controlBody.agencies as Array<Record<string, unknown>>)
    : [];
  const attackAgencies = Array.isArray(attackBody.agencies)
    ? (attackBody.agencies as Array<Record<string, unknown>>)
    : [];
  const controlPassed =
    control.status === 200 &&
    controlAgencies.some((agency) => agency.agencyId === "AG-B");
  const leaked =
    attack.status === 200 &&
    attackAgencies.some((agency) => agency.agencyId === "AG-B");
  return result({
    controlPassed,
    violated: leaked,
    controlDetail: controlPassed
      ? "Platform admin received the complete synthetic metrics set (200)."
      : `Platform-admin control returned ${control.status} without Agency B metrics.`,
    actual: leaked
      ? `Agency A admin received ${String(attackAgencies.length)} agency metric records, including Agency B.`
      : `Agency A admin received ${attack.status} with ${String(attackAgencies.length)} scoped agency record(s); no Agency B data was returned.`,
    evidenceIndex: 1,
  });
}
