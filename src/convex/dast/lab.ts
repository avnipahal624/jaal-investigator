/**
 * JAAL Synthetic Travel Lab — isolated, non-networked travel API used by the
 * DAST engine for reproducible validation.
 *
 * This module models request/response behaviour only. It never contacts a real
 * agency, supplier, payment processor or traveller. The engine still goes
 * through the same scope check, request budget, approval gate and evidence
 * pipeline it would use for an authorized staging target.
 */

export type LabMode = "VULNERABLE" | "FIXED";

export type LabActorId =
  | "agency-a-admin"
  | "agency-b-admin"
  | "agency-a-subagent"
  | "platform-admin";

export type LabActor = {
  id: LabActorId;
  label: string;
  role: "AGENCY_ADMIN" | "SUB_AGENT" | "PLATFORM_ADMIN";
  agencyId: string | null;
};

export const LAB_ACTORS: Record<LabActorId, LabActor> = {
  "agency-a-admin": {
    id: "agency-a-admin",
    label: "Agency A · Admin",
    role: "AGENCY_ADMIN",
    agencyId: "AG-A",
  },
  "agency-b-admin": {
    id: "agency-b-admin",
    label: "Agency B · Admin",
    role: "AGENCY_ADMIN",
    agencyId: "AG-B",
  },
  "agency-a-subagent": {
    id: "agency-a-subagent",
    label: "Agency A · Sub-agent",
    role: "SUB_AGENT",
    agencyId: "AG-A",
  },
  "platform-admin": {
    id: "platform-admin",
    label: "Platform admin",
    role: "PLATFORM_ADMIN",
    agencyId: null,
  },
};

export type LabBooking = {
  id: string;
  agencyId: string;
  travellerName: string;
  travellerEmail: string;
  pnr: string;
  fareInr: number;
  status: "CONFIRMED" | "CANCELLED" | "REFUNDED";
  createdAt: number;
};

export const LAB_BOOKINGS: Record<string, LabBooking> = {
  "BK-A-1001": {
    id: "BK-A-1001",
    agencyId: "AG-A",
    travellerName: "Synthetic Traveller A",
    travellerEmail: "traveller.a@example.test",
    pnr: "SYN-A1",
    fareInr: 48_200,
    status: "CONFIRMED",
    createdAt: 1_762_000_000_000,
  },
  "BK-B-2001": {
    id: "BK-B-2001",
    agencyId: "AG-B",
    travellerName: "Synthetic Traveller B",
    travellerEmail: "traveller.b@example.test",
    pnr: "SYN-B2",
    fareInr: 61_400,
    status: "CONFIRMED",
    createdAt: 1_762_100_000_000,
  },
  "BK-A-1002": {
    id: "BK-A-1002",
    agencyId: "AG-A",
    travellerName: "Synthetic Traveller C",
    travellerEmail: "traveller.c@example.test",
    pnr: "SYN-A3",
    fareInr: 22_900,
    status: "REFUNDED",
    createdAt: 1_761_900_000_000,
  },
};

export type LabRequest = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  actor?: LabActorId;
  body?: unknown;
};

export type LabResponse = {
  status: number;
  body: Record<string, unknown>;
  latencyMs: number;
  requestId: string;
  transport: "IN_PROCESS_LAB";
};

export type LabState = {
  refunds: Array<{
    id: string;
    key: string;
    bookingId: string;
    amount: number;
    createdAt: number;
  }>;
};

export type LabRouteDefinition = {
  key: string;
  method: "GET" | "POST";
  path: string;
  probePath: string;
  service: string;
  documented: boolean;
  source: "DOCUMENTED" | "INFERRED" | "OBSERVED";
  auth: "PUBLIC" | "AUTHENTICATED" | "AGENCY_BOUNDARY" | "ROLE";
  roles: string[];
  businessFlow: string;
  description: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  parameters: Array<{ name: string; in: "path" | "query" | "body"; required: boolean; inferred: boolean }>;
  lastLegitimateTrafficDaysAgo: number | null;
  probeActor: LabActorId;
  lastObservationSource: string;
};

const ROUTES: Omit<LabRouteDefinition, "lastObservationSource">[] = [
  {
    key: "search",
    method: "GET",
    path: "/api/search",
    probePath: "/api/search?origin=DEL&destination=BOM",
    service: "search-api",
    documented: true,
    source: "DOCUMENTED",
    auth: "PUBLIC",
    roles: ["PUBLIC"],
    businessFlow: "search",
    description: "Public fare search used by the booking funnel.",
    riskLevel: "LOW",
    parameters: [
      { name: "origin", in: "query", required: true, inferred: false },
      { name: "destination", in: "query", required: true, inferred: false },
    ],
    lastLegitimateTrafficDaysAgo: 0,
    probeActor: "agency-a-admin",
  },
  {
    key: "health",
    method: "GET",
    path: "/api/health",
    probePath: "/api/health",
    service: "platform-api",
    documented: true,
    source: "DOCUMENTED",
    auth: "PUBLIC",
    roles: ["PUBLIC"],
    businessFlow: "platform",
    description: "Deployment health probe.",
    riskLevel: "LOW",
    parameters: [],
    lastLegitimateTrafficDaysAgo: 0,
    probeActor: "agency-a-admin",
  },
  {
    key: "fare-quote",
    method: "POST",
    path: "/api/fare/quote",
    probePath: "/api/fare/quote",
    service: "pricing-api",
    documented: true,
    source: "DOCUMENTED",
    auth: "AUTHENTICATED",
    roles: ["AGENCY_ADMIN", "SUB_AGENT"],
    businessFlow: "fare-quotation",
    description: "Server-side fare quotation and markup calculation.",
    riskLevel: "HIGH",
    parameters: [
      { name: "baseFare", in: "body", required: true, inferred: false },
      { name: "fare", in: "body", required: false, inferred: true },
    ],
    lastLegitimateTrafficDaysAgo: 1,
    probeActor: "agency-a-admin",
  },
  {
    key: "booking-detail",
    method: "GET",
    path: "/api/bookings/:id",
    probePath: "/api/bookings/BK-B-2001",
    service: "booking-api",
    documented: true,
    source: "DOCUMENTED",
    auth: "AGENCY_BOUNDARY",
    roles: ["AGENCY_ADMIN", "SUB_AGENT", "PLATFORM_ADMIN"],
    businessFlow: "booking",
    description: "Booking detail by identifier. Agency isolation is required.",
    riskLevel: "CRITICAL",
    parameters: [{ name: "id", in: "path", required: true, inferred: false }],
    lastLegitimateTrafficDaysAgo: 0,
    probeActor: "agency-b-admin",
  },
  {
    key: "booking-create",
    method: "POST",
    path: "/api/bookings",
    probePath: "/api/bookings",
    service: "booking-api",
    documented: true,
    source: "DOCUMENTED",
    auth: "AGENCY_BOUNDARY",
    roles: ["AGENCY_ADMIN", "SUB_AGENT"],
    businessFlow: "booking",
    description: "Create a booking for the authenticated agency.",
    riskLevel: "HIGH",
    parameters: [
      { name: "travellerName", in: "body", required: true, inferred: true },
      { name: "fare", in: "body", required: true, inferred: true },
    ],
    lastLegitimateTrafficDaysAgo: 0,
    probeActor: "agency-a-admin",
  },
  {
    key: "booking-cancel",
    method: "POST",
    path: "/api/bookings/:id/cancel",
    probePath: "/api/bookings/BK-A-1001/cancel",
    service: "booking-api",
    documented: true,
    source: "DOCUMENTED",
    auth: "ROLE",
    roles: ["AGENCY_ADMIN"],
    businessFlow: "cancellation",
    description: "Cancel a booking owned by the agency.",
    riskLevel: "HIGH",
    parameters: [{ name: "id", in: "path", required: true, inferred: false }],
    lastLegitimateTrafficDaysAgo: 2,
    probeActor: "agency-a-admin",
  },
  {
    key: "refund-create",
    method: "POST",
    path: "/api/refunds",
    probePath: "/api/refunds",
    service: "refund-api",
    documented: true,
    source: "DOCUMENTED",
    auth: "AGENCY_BOUNDARY",
    roles: ["AGENCY_ADMIN"],
    businessFlow: "refund",
    description: "Create an idempotent refund for a cancelled booking.",
    riskLevel: "CRITICAL",
    parameters: [
      { name: "bookingId", in: "body", required: true, inferred: false },
      { name: "amount", in: "body", required: true, inferred: false },
      { name: "idempotencyKey", in: "body", required: true, inferred: true },
    ],
    lastLegitimateTrafficDaysAgo: 0,
    probeActor: "agency-a-admin",
  },
  {
    key: "agency-users",
    method: "GET",
    path: "/api/agencies/:id/users",
    probePath: "/api/agencies/AG-A/users",
    service: "agency-api",
    documented: true,
    source: "DOCUMENTED",
    auth: "ROLE",
    roles: ["AGENCY_ADMIN", "PLATFORM_ADMIN"],
    businessFlow: "user-administration",
    description: "Agency user administration. Sub-agents must not enumerate users.",
    riskLevel: "HIGH",
    parameters: [{ name: "id", in: "path", required: true, inferred: false }],
    lastLegitimateTrafficDaysAgo: 3,
    probeActor: "agency-a-admin",
  },
  {
    key: "agency-credit",
    method: "POST",
    path: "/api/agencies/:id/credit",
    probePath: "/api/agencies/AG-A/credit",
    service: "credit-api",
    documented: true,
    source: "DOCUMENTED",
    auth: "ROLE",
    roles: ["AGENCY_ADMIN"],
    businessFlow: "agency-credit",
    description: "Adjust agency credit. Restricted to agency administrators.",
    riskLevel: "CRITICAL",
    parameters: [
      { name: "id", in: "path", required: true, inferred: false },
      { name: "amount", in: "body", required: true, inferred: true },
    ],
    lastLegitimateTrafficDaysAgo: 5,
    probeActor: "agency-a-admin",
  },
  {
    key: "suppliers",
    method: "GET",
    path: "/api/suppliers",
    probePath: "/api/suppliers",
    service: "supplier-api",
    documented: true,
    source: "DOCUMENTED",
    auth: "AUTHENTICATED",
    roles: ["AGENCY_ADMIN", "SUB_AGENT"],
    businessFlow: "supplier-management",
    description: "Supplier catalogue visible to agency users.",
    riskLevel: "MEDIUM",
    parameters: [],
    lastLegitimateTrafficDaysAgo: 1,
    probeActor: "agency-a-admin",
  },
  {
    key: "legacy-booking",
    method: "GET",
    path: "/api/legacy/bookings/:id",
    probePath: "/api/legacy/bookings/BK-A-1001",
    service: "legacy-booking-api",
    documented: true,
    source: "DOCUMENTED",
    auth: "PUBLIC",
    roles: ["PUBLIC"],
    businessFlow: "booking",
    description: "Deprecated booking reader retained for an old supplier integration.",
    riskLevel: "CRITICAL",
    parameters: [{ name: "id", in: "path", required: true, inferred: false }],
    lastLegitimateTrafficDaysAgo: 47,
    probeActor: "platform-admin",
  },
  {
    key: "agency-metrics",
    method: "GET",
    path: "/api/internal/agency-metrics",
    probePath: "/api/internal/agency-metrics",
    service: "internal-analytics",
    documented: false,
    source: "OBSERVED",
    auth: "AUTHENTICATED",
    roles: ["AGENCY_ADMIN", "PLATFORM_ADMIN"],
    businessFlow: "agency-credit",
    description: "Undocumented internal metrics route observed in gateway traffic.",
    riskLevel: "HIGH",
    parameters: [],
    lastLegitimateTrafficDaysAgo: null,
    probeActor: "agency-a-admin",
  },
];

export const LAB_MANIFEST_V1: LabRouteDefinition[] = ROUTES.filter(
  (route) => route.key !== "agency-metrics",
).map((route) => ({
  ...route,
  lastObservationSource:
    route.lastLegitimateTrafficDaysAgo == null
      ? "No legitimate observation"
      : `${route.lastLegitimateTrafficDaysAgo}d historical gateway window`,
}));

/** v2 adds the shadow route and tightens two authorization contracts. */
export const LAB_MANIFEST_V2: LabRouteDefinition[] = ROUTES.map((route) => ({
  ...route,
  lastObservationSource:
    route.key === "agency-metrics"
      ? "Observed in authorized API gateway traffic"
      : route.lastLegitimateTrafficDaysAgo == null
        ? "No legitimate observation"
        : `${route.lastLegitimateTrafficDaysAgo}d historical gateway window`,
}));

export type LabChange = {
  type: "ADDED" | "MODIFIED" | "DEPRECATED";
  method: string;
  path: string;
  detail: string;
  priority: number;
};

export const LAB_DEPLOYMENT_V2_CHANGES: LabChange[] = [
  {
    type: "ADDED",
    method: "GET",
    path: "/api/internal/agency-metrics",
    detail: "Undocumented analytics route appeared in gateway traffic.",
    priority: 90,
  },
  {
    type: "MODIFIED",
    method: "GET",
    path: "/api/bookings/:id",
    detail: "Booking reader now declares agency-boundary authorization.",
    priority: 100,
  },
  {
    type: "MODIFIED",
    method: "POST",
    path: "/api/refunds",
    detail: "Refund contract now requires an idempotency key.",
    priority: 85,
  },
  {
    type: "DEPRECATED",
    method: "GET",
    path: "/api/legacy/bookings/:id",
    detail: "Deprecated reader remains reachable with no recent legitimate traffic.",
    priority: 80,
  },
];

export const LAB_DEPLOYMENT_V1 = {
  version: "travel-platform-2026.11.0",
  commit: "a41f9c2",
  source: "CI/CD baseline",
  manifest: LAB_MANIFEST_V1,
};

export const LAB_DEPLOYMENT_V2 = {
  version: "travel-platform-2026.11.1",
  commit: "7d3e0ab",
  source: "CI/CD webhook · synthetic lab",
  manifest: LAB_MANIFEST_V2,
};

function ok(
  status: number,
  body: Record<string, unknown>,
  requestId: string,
): LabResponse {
  return {
    status,
    body: { ...body, _lab: "JAAL_SYNTHETIC_TRAVEL_LAB" },
    latencyMs: 8 + (body && String(body.id ?? "").length) % 17,
    requestId,
    transport: "IN_PROCESS_LAB",
  };
}

function actorFor(id?: LabActorId): LabActor | null {
  if (!id) return null;
  return LAB_ACTORS[id] ?? null;
}

function issueRefund(
  state: LabState,
  key: string,
  bookingId: string,
  amount: number,
  seq: number,
): string {
  const refundId = `RF-${String(seq).padStart(4, "0")}`;
  state.refunds.push({
    id: refundId,
    key,
    bookingId,
    amount,
    createdAt: 1_762_200_000_000 + seq,
  });
  return refundId;
}

/**
 * Deterministic lab dispatcher. `mode` is read from the persisted lab config
 * by the caller; all state mutations (refunds) are returned to the caller so
 * the same run remains reproducible.
 */
export function dispatchLabRequest(
  mode: LabMode,
  request: LabRequest,
  state: LabState,
  requestNumber: number,
): LabResponse {
  const requestId = `REQ-${String(requestNumber).padStart(3, "0")}`;
  const method = request.method.toUpperCase();
  const cleanPath = request.path.split("?")[0] ?? request.path;
  const segments = cleanPath.split("/").filter(Boolean);
  const actor = actorFor(request.actor);
  const body = (request.body ?? {}) as Record<string, unknown>;
  const fixed = mode === "FIXED";

  if (method === "GET" && cleanPath === "/api/health") {
    return ok(200, { status: "ok", environment: "synthetic-lab", version: "2026.11.1" }, requestId);
  }

  if (method === "GET" && cleanPath === "/api/search") {
    return ok(
      200,
      {
        results: [
          { flight: "TB-410", origin: "DEL", destination: "BOM", fareInr: 6_450 },
          { flight: "TB-882", origin: "DEL", destination: "BOM", fareInr: 7_120 },
        ],
        synthetic: true,
      },
      requestId,
    );
  }

  if (method === "GET" && cleanPath === "/api/suppliers") {
    if (!actor) return ok(401, { error: "AUTHENTICATION_REQUIRED" }, requestId);
    return ok(
      200,
      {
        suppliers: [
          { id: "SUP-01", name: "Synthetic Air", status: "ACTIVE" },
          { id: "SUP-02", name: "Synthetic Stay", status: "ACTIVE" },
        ],
      },
      requestId,
    );
  }

  // POST /api/fare/quote
  if (method === "POST" && cleanPath === "/api/fare/quote") {
    if (!actor) return ok(401, { error: "AUTHENTICATION_REQUIRED" }, requestId);
    const baseFare = Number(body.baseFare);
    const submittedFare = Number(body.fare);
    const computedFare = Math.round(baseFare * 1.05);
    if (!fixed) {
      return ok(
        200,
        {
          quoteId: `Q-${requestNumber}`,
          baseFare,
          acceptedFare: Number.isFinite(submittedFare) ? submittedFare : computedFare,
          serverValidated: false,
        },
        requestId,
      );
    }
    if (!Number.isFinite(submittedFare) || submittedFare !== computedFare) {
      return ok(
        400,
        {
          error: "FARE_INTEGRITY_VIOLATION",
          expectedFare: computedFare,
          serverValidated: true,
        },
        requestId,
      );
    }
    return ok(
      200,
      { quoteId: `Q-${requestNumber}`, baseFare, acceptedFare: computedFare, serverValidated: true },
      requestId,
    );
  }

  // POST /api/bookings (synthetic create; no real reservation)
  if (method === "POST" && cleanPath === "/api/bookings") {
    if (!actor) return ok(401, { error: "AUTHENTICATION_REQUIRED" }, requestId);
    return ok(
      201,
      {
        id: `BK-SYN-${requestNumber}`,
        agencyId: actor.agencyId ?? "PLATFORM",
        status: "HELD",
        fareInr: Number(body.fare) || 0,
        synthetic: true,
      },
      requestId,
    );
  }

  // POST /api/bookings/:id/cancel
  if (method === "POST" && segments.length === 4 && segments[0] === "api" && segments[1] === "bookings" && segments[3] === "cancel") {
    if (!actor) return ok(401, { error: "AUTHENTICATION_REQUIRED" }, requestId);
    const booking = LAB_BOOKINGS[segments[2] ?? ""];
    if (!booking) return ok(404, { error: "BOOKING_NOT_FOUND" }, requestId);
    if (fixed) {
      if (actor.role !== "AGENCY_ADMIN" || actor.agencyId !== booking.agencyId) {
        return ok(403, { error: "AGENCY_BOUNDARY_VIOLATION" }, requestId);
      }
    }
    return ok(
      200,
      { id: booking.id, status: "CANCELLED", cancelledBy: actor.id, synthetic: true },
      requestId,
    );
  }

  // POST /api/refunds
  if (method === "POST" && cleanPath === "/api/refunds") {
    if (!actor) return ok(401, { error: "AUTHENTICATION_REQUIRED" }, requestId);
    const booking = LAB_BOOKINGS[String(body.bookingId)];
    if (!booking) return ok(404, { error: "BOOKING_NOT_FOUND" }, requestId);
    if (fixed && actor.agencyId !== booking.agencyId && actor.role !== "PLATFORM_ADMIN") {
      return ok(403, { error: "AGENCY_BOUNDARY_VIOLATION" }, requestId);
    }
    const key = String(body.idempotencyKey ?? "");
    const existing = state.refunds.find((refund) => refund.key === key);
    if (fixed && existing) {
      return ok(
        200,
        {
          refundId: existing.id,
          bookingId: existing.bookingId,
          amount: existing.amount,
          idempotentReplay: true,
          refundCount: state.refunds.length,
        },
        requestId,
      );
    }
    const refundId = issueRefund(
      state,
      key,
      booking.id,
      Number(body.amount) || booking.fareInr,
      state.refunds.length + 1,
    );
    return ok(
      201,
      {
        refundId,
        bookingId: booking.id,
        amount: Number(body.amount) || booking.fareInr,
        idempotentReplay: false,
        refundCount: state.refunds.length,
      },
      requestId,
    );
  }

  // GET /api/bookings/:id
  if (
    method === "GET" &&
    segments.length === 3 &&
    segments[0] === "api" &&
    segments[1] === "bookings"
  ) {
    if (!actor) return ok(401, { error: "AUTHENTICATION_REQUIRED" }, requestId);
    const booking = LAB_BOOKINGS[segments[2] ?? ""];
    if (!booking) return ok(404, { error: "BOOKING_NOT_FOUND" }, requestId);
    if (fixed && actor.role !== "PLATFORM_ADMIN" && actor.agencyId !== booking.agencyId) {
      return ok(404, { error: "BOOKING_NOT_FOUND" }, requestId);
    }
    return ok(
      200,
      {
        id: booking.id,
        agencyId: booking.agencyId,
        travellerName: booking.travellerName,
        travellerEmail: booking.travellerEmail,
        pnr: booking.pnr,
        fareInr: booking.fareInr,
        status: booking.status,
        synthetic: true,
      },
      requestId,
    );
  }

  // GET /api/agencies/:id/users
  if (
    method === "GET" &&
    segments.length === 4 &&
    segments[0] === "api" &&
    segments[1] === "agencies" &&
    segments[3] === "users"
  ) {
    if (!actor) return ok(401, { error: "AUTHENTICATION_REQUIRED" }, requestId);
    if (fixed && actor.role === "SUB_AGENT") {
      return ok(403, { error: "ROLE_FORBIDDEN" }, requestId);
    }
    return ok(
      200,
      {
        agencyId: segments[2],
        users: [
          { id: "USR-01", role: "AGENCY_ADMIN", synthetic: true },
          { id: "USR-02", role: "SUB_AGENT", synthetic: true },
        ],
      },
      requestId,
    );
  }

  // POST /api/agencies/:id/credit
  if (
    method === "POST" &&
    segments.length === 4 &&
    segments[0] === "api" &&
    segments[1] === "agencies" &&
    segments[3] === "credit"
  ) {
    if (!actor) return ok(401, { error: "AUTHENTICATION_REQUIRED" }, requestId);
    if (fixed && actor.role !== "AGENCY_ADMIN" && actor.role !== "PLATFORM_ADMIN") {
      return ok(403, { error: "ROLE_FORBIDDEN", requiredRole: "AGENCY_ADMIN" }, requestId);
    }
    return ok(
      200,
      {
        agencyId: segments[2],
        creditLimitInr: 1_250_000,
        adjustedBy: actor.id,
        synthetic: true,
      },
      requestId,
    );
  }

  // GET /api/legacy/bookings/:id
  if (
    method === "GET" &&
    segments.length === 4 &&
    segments[0] === "api" &&
    segments[1] === "legacy" &&
    segments[2] === "bookings"
  ) {
    if (fixed && !actor) return ok(401, { error: "AUTHENTICATION_REQUIRED" }, requestId);
    const booking = LAB_BOOKINGS[segments[3] ?? ""];
    if (!booking) return ok(404, { error: "BOOKING_NOT_FOUND" }, requestId);
    if (fixed && actor?.role !== "PLATFORM_ADMIN" && actor?.agencyId !== booking.agencyId) {
      return ok(404, { error: "BOOKING_NOT_FOUND" }, requestId);
    }
    return ok(
      200,
      {
        id: booking.id,
        agencyId: booking.agencyId,
        travellerName: booking.travellerName,
        travellerEmail: booking.travellerEmail,
        pnr: booking.pnr,
        fareInr: booking.fareInr,
        status: booking.status,
        deprecated: true,
        synthetic: true,
      },
      requestId,
    );
  }

  // GET /api/internal/agency-metrics
  if (method === "GET" && cleanPath === "/api/internal/agency-metrics") {
    if (!actor) return ok(401, { error: "AUTHENTICATION_REQUIRED" }, requestId);
    const agencies = [
      { agencyId: "AG-A", activeBookings: 142, creditUtilisation: 0.41, refunds30d: 7 },
      { agencyId: "AG-B", activeBookings: 98, creditUtilisation: 0.63, refunds30d: 11 },
    ];
    if (fixed && actor.role !== "PLATFORM_ADMIN") {
      return ok(
        200,
        {
          agencies: agencies.filter((agency) => agency.agencyId === actor.agencyId),
          scoped: true,
        },
        requestId,
      );
    }
    return ok(200, { agencies, scoped: false }, requestId);
  }

  return ok(404, { error: "ROUTE_NOT_FOUND" }, requestId);
}
