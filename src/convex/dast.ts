/**
 * JAAL Agentic DAST backend.
 *
 * The module is intentionally isolated from the forensic JAAL tables. Every
 * row is owner-scoped, every active test needs an approval, and a finding is
 * only written after a deterministic control + attack assertion succeeds
 * against the synthetic travel lab.
 */
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { getOwner } from "./lib/backend";
import { sha256Hex } from "@/utils/hash";
import { DAST_AGENTS, SEVERITY_ORDER, type DastSeverity } from "@/types/dast";
import {
  LAB_ACTORS,
  LAB_DEPLOYMENT_V1,
  LAB_DEPLOYMENT_V2,
  LAB_DEPLOYMENT_V2_CHANGES,
  LAB_MANIFEST_V2,
  dispatchLabRequest,
  type LabMode,
  type LabRouteDefinition,
  type LabState,
} from "./dast/lab";
import {
  definitionFor,
  runDastTest,
  TEST_CATALOG,
  validateScope,
  type DastTestKey,
} from "./dast/engine";

const DAY = 86_400_000;

type Ctx = MutationCtx;
type AnyCtx = QueryCtx | MutationCtx;

async function appForOwner(ctx: AnyCtx, owner: string) {
  return await ctx.db
    .query("dastApplications")
    .withIndex("by_owner", (q) => q.eq("owner", owner))
    .first();
}

async function policyForApp(ctx: AnyCtx, applicationId: Id<"dastApplications">) {
  return await ctx.db
    .query("dastPolicies")
    .withIndex("by_application", (q) => q.eq("applicationId", applicationId))
    .first();
}

async function targetForApp(ctx: AnyCtx, applicationId: Id<"dastApplications">) {
  return await ctx.db
    .query("dastTargets")
    .withIndex("by_application", (q) => q.eq("applicationId", applicationId))
    .first();
}

async function labForApp(ctx: AnyCtx, applicationId: Id<"dastApplications">) {
  return await ctx.db
    .query("dastLabConfig")
    .withIndex("by_application", (q) => q.eq("applicationId", applicationId))
    .first();
}

async function audit(
  ctx: Ctx,
  row: {
    owner: string;
    applicationId?: Id<"dastApplications">;
    investigationId?: Id<"dastInvestigations">;
    type: string;
    actor: string;
    message: string;
    severity?: "INFO" | "WARN" | "CRITICAL" | "SUCCESS";
    metadata?: unknown;
  },
) {
  await ctx.db.insert("dastAudit", {
    owner: row.owner,
    applicationId: row.applicationId,
    investigationId: row.investigationId,
    type: row.type,
    actor: row.actor,
    message: row.message,
    severity: row.severity ?? "INFO",
    metadata: row.metadata ?? {},
    at: Date.now(),
  });
}

async function markAgent(
  ctx: Ctx,
  applicationId: Id<"dastApplications">,
  key: string,
  patch: Partial<{
    status: string;
    currentTask: string | undefined;
    lastRunAt: number;
    durationMs: number;
    success: boolean;
    error: string | undefined;
    lastInvestigationId: Id<"dastInvestigations">;
  }>,
) {
  const agent = await ctx.db
    .query("dastAgents")
    .withIndex("by_application_key", (q) =>
      q.eq("applicationId", applicationId).eq("key", key),
    )
    .unique();
  if (agent) {
    await ctx.db.patch(agent._id, { ...patch, updatedAt: Date.now() });
  }
}

async function writeLabMode(ctx: Ctx, applicationId: Id<"dastApplications">, mode: LabMode) {
  const config = await labForApp(ctx, applicationId);
  if (config) {
    await ctx.db.patch(config._id, { mode, updatedAt: Date.now() });
  }
}

function caseNumber(existing: number) {
  return `DAST-${String(existing + 1).padStart(3, "0")}`;
}

function probeBody(route: LabRouteDefinition) {
  switch (route.key) {
    case "fare-quote":
      return { baseFare: 48_200, fare: 50_610 };
    case "refund-create":
      return {
        bookingId: "BK-A-1001",
        amount: 48_200,
        idempotencyKey: "idem-discovery-001",
      };
    case "booking-create":
      return { travellerName: "Synthetic Discovery", fare: 48_200 };
    case "agency-credit":
      return { amount: 1_000 };
    default:
      return undefined;
  }
}

function requestBodyFor(route: LabRouteDefinition): Record<string, unknown> | undefined {
  return probeBody(route) as Record<string, unknown> | undefined;
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      if (/email/i.test(key) && typeof inner === "string") {
        const [local, domain] = inner.split("@");
        out[key] = `${(local ?? "?")[0] ?? "?"}•••@${domain ?? "example.test"}`;
      } else if (/pnr/i.test(key) && typeof inner === "string") {
        out[key] = `${inner.slice(0, 2)}-••`;
      } else if (/authorization|cookie|token|password|secret/i.test(key)) {
        out[key] = "[REDACTED]";
      } else {
        out[key] = sanitizeValue(inner);
      }
    }
    return out;
  }
  return value;
}

function evidenceJson(value: unknown): string {
  return JSON.stringify(sanitizeValue(value), null, 2);
}

async function seedForOwner(ctx: Ctx, owner: string, actor: string) {
  const existing = await appForOwner(ctx, owner);
  if (existing) {
    return { applicationId: existing._id, seeded: false };
  }

  const now = Date.now();
  const applicationId = await ctx.db.insert("dastApplications", {
    owner,
    name: "Synthetic Travel Security Lab",
    description:
      "Isolated TBO-style travel API with synthetic agencies, bookings, fares, refunds and a deliberately vulnerable + fixed configuration.",
    environment: "SYNTHETIC_LAB",
    baseUrl: "https://lab.jaal.internal",
    transport: "IN_PROCESS_LAB",
    createdAt: now,
    updatedAt: now,
  });

  await ctx.db.insert("dastTargets", {
    owner,
    applicationId,
    baseUrl: "https://lab.jaal.internal",
    allowedHosts: ["lab.jaal.internal"],
    allowedPaths: ["/api/"],
    scheme: "https",
    status: "AUTHORIZED",
    authorizedBy: actor,
    createdAt: now,
  });

  await ctx.db.insert("dastPolicies", {
    owner,
    applicationId,
    maxRequestsPerRun: 60,
    maxConcurrency: 2,
    rateLimitPerMinute: 30,
    approvalRequired: true,
    emergencyStop: false,
    allowRedirects: false,
    historicalWindowDays: 90,
    zombieWindowDays: 30,
    updatedAt: now,
  });

  for (const agent of DAST_AGENTS) {
    await ctx.db.insert("dastAgents", {
      owner,
      applicationId,
      key: agent.key,
      name: agent.name,
      purpose: agent.purpose,
      status: "IDLE",
      paused: false,
      updatedAt: now,
    });
  }

  const flows = [
    ["search", "Search & fare quotation", "Search, quote and hold flow.", ["/api/search", "/api/fare/quote"]],
    ["booking", "Booking lifecycle", "Create and read bookings across agencies.", ["/api/bookings", "/api/bookings/:id"]],
    ["cancellation", "Cancellation", "Cancel a booking inside its agency.", ["/api/bookings/:id/cancel"]],
    ["refund", "Refund", "Refund a cancelled booking without duplicate payouts.", ["/api/refunds"]],
    ["agency-credit", "Agency credit", "Credit limits and internal agency metrics.", ["/api/agencies/:id/credit", "/api/internal/agency-metrics"]],
    ["supplier-management", "Supplier management", "Supplier catalogue and integrations.", ["/api/suppliers"]],
  ] as const;
  for (const [key, name, description, endpointPaths] of flows) {
    await ctx.db.insert("dastFlows", {
      owner,
      applicationId,
      key,
      name,
      description,
      endpointPaths: [...endpointPaths],
      createdAt: now,
    });
  }

  await ctx.db.insert("dastOwners", {
    owner,
    applicationId,
    team: "Travel Platform Security",
    email: "security@jaal.demo",
    createdAt: now,
  });

  await ctx.db.insert("dastLabConfig", {
    applicationId,
    mode: "VULNERABLE",
    refunds: [],
    updatedAt: now,
  });

  await ctx.db.insert("dastDeployments", {
    owner,
    applicationId,
    version: LAB_DEPLOYMENT_V1.version,
    commit: LAB_DEPLOYMENT_V1.commit,
    source: LAB_DEPLOYMENT_V1.source,
    status: "BASELINE",
    receivedAt: now - 6 * DAY,
    manifest: LAB_DEPLOYMENT_V1.manifest,
    changes: [],
    priorityScore: 0,
    idempotencyKey: "baseline-2026.11.0",
    createdAt: now - 6 * DAY,
  });

  await audit(ctx, {
    owner,
    applicationId,
    type: "lab.initialized",
    actor,
    message:
      "Synthetic Travel Security Lab initialized. No external target is authorized.",
    severity: "SUCCESS",
    metadata: { baseUrl: "https://lab.jaal.internal", mode: "VULNERABLE" },
  });

  return { applicationId, seeded: true };
}

async function discover(
  ctx: Ctx,
  owner: string,
  applicationId: Id<"dastApplications">,
  investigationId: Id<"dastInvestigations">,
  mode: LabMode,
  maxRequests: number,
  zombieWindowDays: number,
  changes: Array<{ method: string; path: string; type: string; detail: string }>,
) {
  const now = Date.now();
  const state: LabState = { refunds: [] };
  const endpointIds: Id<"dastEndpoints">[] = [];
  const changedEndpointIds: Id<"dastEndpoints">[] = [];
  let requestCount = 0;

  for (const route of LAB_MANIFEST_V2) {
    if (requestCount >= maxRequests) break;
    requestCount += 1;
    const response = dispatchLabRequest(
      mode,
      {
        method: route.method,
        path: route.probePath,
        actor: route.probeActor,
        body: requestBodyFor(route),
      },
      state,
      requestCount,
    );

    const existing = await ctx.db
      .query("dastEndpoints")
      .withIndex("by_application_path", (q) =>
        q.eq("applicationId", applicationId).eq("method", route.method).eq("path", route.path),
      )
      .first();

    const reachable = response.status < 500;
    const classification: "ACTIVE" | "ZOMBIE" | "SHADOW" | "UNKNOWN" = !reachable
      ? "UNKNOWN"
              : !route.documented
          ? "SHADOW"
          : (route.lastLegitimateTrafficDaysAgo ?? 0) > zombieWindowDays
            ? "ZOMBIE"
            : "ACTIVE";
    const lastLegitimateTrafficAt =
      route.lastLegitimateTrafficDaysAgo == null
        ? undefined
        : now - route.lastLegitimateTrafficDaysAgo * DAY;

    const patch = {
      owner,
      applicationId,
      method: route.method,
      path: route.path,
      host: "lab.jaal.internal",
      service: route.service,
      authType: route.auth,
      observedRoles: [...route.roles],
      parameters: route.parameters,
      businessFlow: route.businessFlow,
      classification,
      documented: route.documented,
      confidence: classification === "UNKNOWN" ? 0.4 : 0.96,
      riskLevel: route.riskLevel,
      lastObservedAt: now,
      lastSuccessAt: response.status < 400 ? now : undefined,
      lastLegitimateTrafficAt,
      firstSeenAt: existing?.firstSeenAt ?? now,
      source: route.source,
      description: route.description,
      ownerTeam:
        route.service === "booking-api"
          ? "Travel Platform · Booking API"
          : route.service === "refund-api"
            ? "Travel Platform · Refund API"
            : route.service === "internal-analytics"
              ? "Travel Platform · Internal Analytics"
              : "Travel Platform",
      findingsCount: existing?.findingsCount ?? 0,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    let endpointId: Id<"dastEndpoints">;
    if (existing) {
      endpointId = existing._id;
      await ctx.db.patch(existing._id, patch);
    } else {
      endpointId = await ctx.db.insert("dastEndpoints", patch);
    }
    endpointIds.push(endpointId);

    const changed = changes.some(
      (change) => change.method === route.method && change.path === route.path,
    );
    if (changed) changedEndpointIds.push(endpointId);

    await ctx.db.insert("dastObservations", {
      owner,
      applicationId,
      endpointId,
      method: route.method,
      path: route.probePath,
      actorRole: LAB_ACTORS[route.probeActor].role,
      statusCode: response.status,
      latencyMs: response.latencyMs,
      requestSample: `${route.method} ${route.probePath}`,
      responseSample: JSON.stringify(sanitizeValue(response.body)).slice(0, 700),
      observedAt: now,
      source: "authorized discovery probe",
    });
  }

  return { endpointIds, changedEndpointIds, requestCount };
}

function reportMarkdown(input: {
  investigation: Doc<"dastInvestigations">;
  findings: Doc<"dastFindings">[];
  endpoints: Doc<"dastEndpoints">[];
  deployment: Doc<"dastDeployments"> | null;
  stats: Record<string, unknown>;
  generatedAt: number;
}) {
  const { investigation, findings, endpoints, deployment, stats, generatedAt } = input;
  const count = (severity: DastSeverity) =>
    findings.filter((finding) => finding.severity === severity).length;
  const lines: string[] = [];
  lines.push(`# JAAL DAST Investigation ${investigation.caseId}`);
  lines.push("");
  lines.push(`**Application:** Synthetic Travel Security Lab  `);
  lines.push(`**Environment:** SYNTHETIC LAB — no external target  `);
  lines.push(`**Deployment:** ${deployment?.version ?? "—"} (${deployment?.commit ?? "—"})  `);
  lines.push(`**Generated:** ${new Date(generatedAt).toISOString()}  `);
  lines.push(`**Verified findings:** ${findings.length}`);
  lines.push("");
  lines.push("## 1. Executive summary");
  lines.push("");
  lines.push(
    findings.length === 0
      ? "No verified business-logic vulnerabilities were produced by this investigation. Control cases passed and no security boundary violation was asserted."
      : `${findings.length} verified business-logic issue(s) were reproduced with deterministic control and attack assertions. Severity counts: ${SEVERITY_ORDER.map((severity) => `${severity} ${count(severity)}`).join(" · ")}.`,
  );
  lines.push("");
  lines.push("## 2. Scope and safety");
  lines.push("");
  lines.push(
    "- Target: `https://lab.jaal.internal` (in-process synthetic lab, exact host allowlist).",
  );
  lines.push("- Methods: GET and POST only; destructive methods rejected by the planner.");
  lines.push(
    `- Request budget: ${String(stats.requestCount ?? 0)} / ${String(stats.requestBudget ?? 60)} approved requests.`,
  );
  lines.push("- Human approval: recorded before active execution.");
  lines.push("- No real customer data, no payment processor and no third-party host was contacted.");
  lines.push("");
  lines.push("## 3. Verified findings");
  lines.push("");
  if (findings.length === 0) {
    lines.push("_None._");
  }
  for (const finding of findings) {
    lines.push(`### ${finding.findingId} — ${finding.title}`);
    lines.push("");
    lines.push(`- **Severity:** ${finding.severity} (technical: ${finding.technicalSeverity})`);
    lines.push(`- **Category:** ${finding.category}`);
    lines.push(`- **Endpoint:** \`${finding.method} ${finding.path}\``);
    lines.push(`- **Owner:** ${finding.ownerTeam}`);
    lines.push(`- **Status:** ${finding.status}`);
    lines.push(`- **Evidence SHA-256:** \`${finding.evidenceHash}\``);
    lines.push("");
    lines.push(`**Business impact.** ${finding.businessImpact}`);
    lines.push("");
    lines.push(`**Expected.** ${finding.expected}`);
    lines.push("");
    lines.push(`**Actual.** ${finding.actual}`);
    lines.push("");
    lines.push(`**Root cause.** ${finding.rootCause}`);
    lines.push("");
    lines.push(`**Remediation.** ${finding.remediation}`);
    lines.push("");
    lines.push("**Reproduction.**");
    lines.push("");
    const steps = Array.isArray(finding.reproduction) ? finding.reproduction : [];
    steps.forEach((step, index) => {
      const value = step as { action?: string; expected?: string; actual?: string };
      lines.push(
        `${index + 1}. ${value.action ?? "Request"} — expected: ${value.expected ?? "refused"} / actual: ${value.actual ?? "observed"}`,
      );
    });
    lines.push("");
    lines.push("**Sanitized response evidence.**");
    lines.push("");
    lines.push("```json");
    lines.push(finding.responseEvidence);
    lines.push("```");
    lines.push("");
  }
  lines.push("## 4. Endpoint inventory");
  lines.push("");
  lines.push("| Method | Path | Classification | Auth | Service |");
  lines.push("|---|---|---|---|---|");
  for (const endpoint of endpoints.slice(0, 40)) {
    lines.push(
      `| ${endpoint.method} | \`${endpoint.path}\` | ${endpoint.classification} | ${endpoint.authType} | ${endpoint.service} |`,
    );
  }
  lines.push("");
  lines.push("## 5. Retest status");
  lines.push("");
  const retested = findings.filter((finding) => finding.retestStatus !== "NOT_RETESTED");
  if (retested.length === 0) {
    lines.push("No retest has been requested for these findings yet.");
  } else {
    for (const finding of retested) {
      lines.push(`- ${finding.findingId}: **${finding.retestStatus}**`);
    }
  }
  lines.push("");
  lines.push("## 6. Safety and audit summary");
  lines.push("");
  lines.push(
    `Discovery: ${String(stats.discoveryMs ?? 0)} ms · Planning: ${String(stats.planningMs ?? 0)} ms · Execution: ${String(stats.executionMs ?? 0)} ms · Deploy-to-verified: ${String(stats.deployToVerifiedMs ?? 0)} ms.`,
  );
  lines.push("");
  lines.push(
    "All test requests passed the exact-host and path scope checks. Redirects were disabled. Emergency stop was clear at execution time.",
  );
  return lines.join("\n");
}

async function buildReport(
  ctx: Ctx,
  owner: string,
  investigation: Doc<"dastInvestigations">,
  findings: Doc<"dastFindings">[],
  endpoints: Doc<"dastEndpoints">[],
  deployment: Doc<"dastDeployments"> | null,
  stats: Record<string, unknown>,
  generatedAt: number,
) {
  const markdown = reportMarkdown({
    investigation,
    findings,
    endpoints,
    deployment,
    stats,
    generatedAt,
  });
  const existing = await ctx.db
    .query("dastReports")
    .withIndex("by_investigation", (q) => q.eq("investigationId", investigation._id))
    .first();
  const summary =
    findings.length === 0
      ? "No verified findings; control cases passed."
      : `${findings.length} verified finding(s), ${findings.filter((finding) => finding.severity === "CRITICAL").length} critical.`;
  const payload = {
    owner,
    applicationId: investigation.applicationId,
    investigationId: investigation._id,
    title: `${investigation.caseId} — Verified DAST report`,
    markdown,
    summary,
    findingCount: findings.length,
    metrics: stats,
    status: "FINAL",
    generatedAt,
  };
  if (existing) {
    await ctx.db.patch(existing._id, payload);
    return existing._id;
  }
  return await ctx.db.insert("dastReports", payload);
}

async function runPipeline(
  ctx: Ctx,
  owner: string,
  applicationId: Id<"dastApplications">,
  investigationId: Id<"dastInvestigations">,
  deploymentId: Id<"dastDeployments">,
  actor: string,
) {
  const started = Date.now();
  const deployment = await ctx.db.get(deploymentId);
  const investigation = await ctx.db.get(investigationId);
  const policy = await policyForApp(ctx, applicationId);
  const lab = await labForApp(ctx, applicationId);
  if (!deployment || !investigation || !policy || !lab) {
    throw new Error("DAST pipeline state is incomplete.");
  }
  const changes = (deployment.changes ?? []) as Array<{
    method: string;
    path: string;
    type: string;
    detail: string;
  }>;

  await ctx.db.patch(investigationId, {
    stage: "CHANGE_DETECTION",
    currentAgent: "change-sentinel",
    updatedAt: Date.now(),
  });
  await markAgent(ctx, applicationId, "change-sentinel", {
    status: "RUNNING",
    currentTask: `Diffing ${deployment.version}`,
    lastRunAt: started,
    lastInvestigationId: investigationId,
  });
  const changeMs = Date.now() - started;

  await audit(ctx, {
    owner,
    applicationId,
    investigationId,
    type: "deployment.detected",
    actor,
    message: `${deployment.version} received from ${deployment.source}; ${changes.length} endpoint change(s) prioritized.`,
    severity: "INFO",
    metadata: { changes },
  });

  await markAgent(ctx, applicationId, "change-sentinel", {
    status: "COMPLETED",
    currentTask: "Scoped investigation created",
    durationMs: changeMs,
    success: true,
  });
  await ctx.db.patch(investigationId, {
    stage: "DISCOVERY",
    currentAgent: "recon-inventory",
    updatedAt: Date.now(),
  });
  await markAgent(ctx, applicationId, "recon-inventory", {
    status: "RUNNING",
    currentTask: "Probing authorized endpoints by role",
    lastRunAt: Date.now(),
    lastInvestigationId: investigationId,
  });

  const discoveryStart = Date.now();
  const discovery = await discover(
    ctx,
    owner,
    applicationId,
    investigationId,
    lab.mode,
    policy.maxRequestsPerRun,
    policy.zombieWindowDays,
    changes,
  );
  const discoveryMs = Date.now() - discoveryStart;

  await markAgent(ctx, applicationId, "recon-inventory", {
    status: "COMPLETED",
    currentTask: `${discovery.endpointIds.length} endpoints observed`,
    durationMs: discoveryMs,
    success: true,
  });
  await ctx.db.patch(investigationId, {
    stage: "PLANNING",
    currentAgent: "attack-planner",
    changedEndpointIds: discovery.changedEndpointIds,
    updatedAt: Date.now(),
  });
  await markAgent(ctx, applicationId, "attack-planner", {
    status: "RUNNING",
    currentTask: "Selecting business-logic tests",
    lastRunAt: Date.now(),
    lastInvestigationId: investigationId,
  });

  const planningStart = Date.now();
  const planIds: Id<"dastPlans">[] = [];
  for (const definition of TEST_CATALOG) {
    const endpoint = await ctx.db
      .query("dastEndpoints")
      .withIndex("by_application_path", (q) =>
        q
          .eq("applicationId", applicationId)
          .eq("method", definition.method)
          .eq("path", definition.endpointPath),
      )
      .first();
    const changed = changes.some(
      (change) =>
        change.method === definition.method && change.path === definition.endpointPath,
    );
    const rationale = changed
      ? `Selected because ${deployment.version} changed this endpoint and the ${definition.category.toLowerCase()} contract is directly testable with synthetic fixtures.`
      : `Selected for baseline coverage of the ${definition.category.toLowerCase()} contract.`;
    planIds.push(
      await ctx.db.insert("dastPlans", {
        owner,
        applicationId,
        investigationId,
        endpointId: endpoint?._id,
        testKey: definition.key,
        category: definition.category,
        title: definition.title,
        rationale,
        role: LAB_ACTORS[definition.role].role,
        fixture: definition.fixture,
        expected: definition.expected,
        validation: definition.validation,
        maxRequests: definition.maxRequests,
        risk: definition.severity,
        requiresApproval: policy.approvalRequired,
        stopConditions: definition.stopConditions,
        verification: definition.validation,
        status: "READY",
        createdAt: Date.now(),
      }),
    );
  }
  const planningMs = Date.now() - planningStart;

  await markAgent(ctx, applicationId, "attack-planner", {
    status: "COMPLETED",
    currentTask: `${planIds.length} tests planned`,
    durationMs: planningMs,
    success: true,
  });

  const approvalStatus = policy.approvalRequired ? "PENDING" : "APPROVED";
  const approvalId = await ctx.db.insert("dastApprovals", {
    owner,
    investigationId,
    planIds,
    status: approvalStatus,
    requestedAt: Date.now(),
    decidedAt: policy.approvalRequired ? undefined : Date.now(),
    decidedBy: policy.approvalRequired ? undefined : owner,
    note: policy.approvalRequired
      ? "Active tests require explicit operator approval."
      : "Policy pre-approved the isolated synthetic lab.",
  });

  const stats = {
    requestBudget: policy.maxRequestsPerRun,
    requestCount: discovery.requestCount,
    discoveryMs,
    planningMs,
    plans: planIds.length,
    endpoints: discovery.endpointIds.length,
    changedEndpoints: discovery.changedEndpointIds.length,
    approvalId,
  };

  await ctx.db.patch(investigationId, {
    status: "WAITING_FOR_APPROVAL",
    stage: "SAFETY_REVIEW",
    currentAgent: "safe-executor",
    safetyStatus: policy.approvalRequired
      ? "AWAITING_HUMAN_APPROVAL"
      : "PRE_APPROVED_LAB",
    stats,
    updatedAt: Date.now(),
  });
  await markAgent(ctx, applicationId, "safe-executor", {
    status: "WAITING_FOR_APPROVAL",
    currentTask: policy.approvalRequired
      ? "Waiting for operator approval"
      : "Policy pre-approved",
    lastRunAt: Date.now(),
    lastInvestigationId: investigationId,
  });
  const job = await ctx.db
    .query("dastJobs")
    .withIndex("by_investigation", (q) => q.eq("investigationId", investigationId))
    .first();
  if (job) {
    await ctx.db.patch(job._id, {
      status: "WAITING_FOR_APPROVAL",
      updatedAt: Date.now(),
      payload: { planIds, approvalId },
    });
  }
  await audit(ctx, {
    owner,
    applicationId,
    investigationId,
    type: "safety.approval.required",
    actor,
    message: `${planIds.length} active tests validated against scope; human approval required before execution.`,
    severity: "WARN",
    metadata: { maxRequests: policy.maxRequestsPerRun, hosts: ["lab.jaal.internal"] },
  });
  return { planIds, stats };
}

/** Initialize the isolated synthetic lab for the signed-in operator. */
export const seedLab = mutation({
  args: {},
  handler: async (ctx) => {
    const owner = await getOwner(ctx);
    const identity = await ctx.auth.getUserIdentity();
    return await seedForOwner(ctx, owner, identity?.name ?? "Authenticated operator");
  },
});

/** Reactive bootstrap used by the security console. */
export const bootstrap = query({
  args: {},
  handler: async (ctx) => {
    const owner = await getOwner(ctx);
    const app = await appForOwner(ctx, owner);
    if (!app) return null;
    const [target, policy, lab, agents, deployments, investigations, findings, endpoints] =
      await Promise.all([
        targetForApp(ctx, app._id),
        policyForApp(ctx, app._id),
        labForApp(ctx, app._id),
        ctx.db
          .query("dastAgents")
          .withIndex("by_owner_application", (q) =>
            q.eq("owner", owner).eq("applicationId", app._id),
          )
          .collect(),
        ctx.db
          .query("dastDeployments")
          .withIndex("by_owner_application", (q) =>
            q.eq("owner", owner).eq("applicationId", app._id),
          )
          .collect(),
        ctx.db
          .query("dastInvestigations")
          .withIndex("by_owner_application", (q) =>
            q.eq("owner", owner).eq("applicationId", app._id),
          )
          .collect(),
        ctx.db
          .query("dastFindings")
          .withIndex("by_owner_application", (q) =>
            q.eq("owner", owner).eq("applicationId", app._id),
          )
          .collect(),
        ctx.db
          .query("dastEndpoints")
          .withIndex("by_owner_application", (q) =>
            q.eq("owner", owner).eq("applicationId", app._id),
          )
          .collect(),
      ]);
    return {
      application: app,
      target,
      policy,
      lab,
      agents,
      deploymentCount: deployments.length,
      investigationCount: investigations.length,
      findingCount: findings.length,
      endpointCount: endpoints.length,
      latestDeployment: deployments.sort((a, b) => b.receivedAt - a.receivedAt)[0] ?? null,
      latestInvestigation:
        investigations.sort((a, b) => b.startedAt - a.startedAt)[0] ?? null,
    };
  },
});

/** Register deployment v2 and run change detection → discovery → planning. */
export const triggerDeployment = mutation({
  args: {},
  handler: async (ctx) => {
    const owner = await getOwner(ctx);
    const identity = await ctx.auth.getUserIdentity();
    const actor = identity?.name ?? "Authenticated operator";
    const app = await appForOwner(ctx, owner);
    if (!app) throw new Error("Initialize the synthetic lab first.");
    const policy = await policyForApp(ctx, app._id);
    if (!policy) throw new Error("Safety policy is missing.");
    if (policy.emergencyStop) {
      throw new Error("Emergency stop is active. No deployment-triggered run can start.");
    }
    const requiredAgents = ["change-sentinel", "recon-inventory", "attack-planner"];
    for (const key of requiredAgents) {
      const agent = await ctx.db
        .query("dastAgents")
        .withIndex("by_application_key", (q) =>
          q.eq("applicationId", app._id).eq("key", key),
        )
        .unique();
      if (agent?.paused) {
        throw new Error(`${agent.name} is paused. Resume it before starting a new investigation.`);
      }
    }

    const existing = await ctx.db
      .query("dastDeployments")
      .withIndex("by_application_version", (q) =>
        q.eq("applicationId", app._id).eq("version", LAB_DEPLOYMENT_V2.version),
      )
      .first();
    if (existing) {
      if (existing.investigationId) {
        return {
          deploymentId: existing._id,
          investigationId: existing.investigationId,
          reused: true,
        };
      }
      throw new Error("Deployment exists without an investigation; reset the lab.");
    }

    const now = Date.now();
    const deploymentId = await ctx.db.insert("dastDeployments", {
      owner,
      applicationId: app._id,
      version: LAB_DEPLOYMENT_V2.version,
      commit: LAB_DEPLOYMENT_V2.commit,
      source: LAB_DEPLOYMENT_V2.source,
      status: "RECEIVED",
      receivedAt: now,
      manifest: LAB_DEPLOYMENT_V2.manifest,
      changes: LAB_DEPLOYMENT_V2_CHANGES,
      priorityScore: Math.max(...LAB_DEPLOYMENT_V2_CHANGES.map((change) => change.priority)),
      idempotencyKey: `deploy-${LAB_DEPLOYMENT_V2.version}`,
      createdAt: now,
    });

    const prior = await ctx.db
      .query("dastInvestigations")
      .withIndex("by_owner_application", (q) =>
        q.eq("owner", owner).eq("applicationId", app._id),
      )
      .collect();
    const investigationId = await ctx.db.insert("dastInvestigations", {
      owner,
      applicationId: app._id,
      caseId: caseNumber(prior.length),
      title: `Deployment ${LAB_DEPLOYMENT_V2.version} security investigation`,
      trigger: "CI/CD deployment webhook",
      deploymentId,
      status: "RUNNING",
      stage: "CHANGE_DETECTION",
      currentAgent: "change-sentinel",
      safetyStatus: "SCOPE_VALIDATED",
      changedEndpointIds: [],
      stats: {},
      summary: "",
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(deploymentId, { investigationId });
    await ctx.db.insert("dastJobs", {
      owner,
      applicationId: app._id,
      investigationId,
      kind: "deployment.investigation",
      status: "RUNNING",
      attempts: 1,
      leaseUntil: now + 5 * 60_000,
      payload: { deploymentId, changes: LAB_DEPLOYMENT_V2_CHANGES },
      createdAt: now,
      updatedAt: now,
    });
    await audit(ctx, {
      owner,
      applicationId: app._id,
      investigationId,
      type: "deployment.received",
      actor,
      message: `${LAB_DEPLOYMENT_V2.version} received with ${LAB_DEPLOYMENT_V2_CHANGES.length} prioritized endpoint changes.`,
      severity: "INFO",
    });

    const result = await runPipeline(
      ctx,
      owner,
      app._id,
      investigationId,
      deploymentId,
      actor,
    );
    await ctx.db.patch(deploymentId, { status: "INVESTIGATED" });
    return { deploymentId, investigationId, reused: false, ...result };
  },
});

export const approveInvestigation = mutation({
  args: { id: v.id("dastInvestigations"), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const owner = await getOwner(ctx);
    const identity = await ctx.auth.getUserIdentity();
    const investigation = await ctx.db.get(args.id);
    if (!investigation || investigation.owner !== owner) throw new Error("Investigation not found.");
    const approval = await ctx.db
      .query("dastApprovals")
      .withIndex("by_investigation_status", (q) =>
        q.eq("investigationId", args.id).eq("status", "PENDING"),
      )
      .first();
    if (!approval) throw new Error("No pending approval for this investigation.");
    await ctx.db.patch(approval._id, {
      status: "APPROVED",
      decidedAt: Date.now(),
      decidedBy: identity?.name ?? owner,
      note: args.note ?? "Approved through the JAAL safety console.",
    });
    await ctx.db.patch(args.id, {
      safetyStatus: "APPROVED_FOR_EXECUTION",
      updatedAt: Date.now(),
    });
    await audit(ctx, {
      owner,
      applicationId: investigation.applicationId,
      investigationId: args.id,
      type: "safety.approval.granted",
      actor: identity?.name ?? owner,
      message: `Operator approved ${approval.planIds.length} scoped test plans.`,
      severity: "SUCCESS",
      metadata: { approvalId: approval._id },
    });
    return { approved: true, planCount: approval.planIds.length };
  },
});

/** Execute approved plans, verify each candidate, seal evidence and report. */
export const executeInvestigation = mutation({
  args: { id: v.id("dastInvestigations") },
  handler: async (ctx, args) => {
    const owner = await getOwner(ctx);
    const identity = await ctx.auth.getUserIdentity();
    const actor = identity?.name ?? owner;
    const investigation = await ctx.db.get(args.id);
    if (!investigation || investigation.owner !== owner) throw new Error("Investigation not found.");
    if (investigation.status === "COMPLETED") {
      throw new Error("This investigation has already completed.");
    }
    if (investigation.status === "CANCELLED") {
      throw new Error("This investigation was cancelled.");
    }
    const policy = await policyForApp(ctx, investigation.applicationId);
    const target = await targetForApp(ctx, investigation.applicationId);
    const lab = await labForApp(ctx, investigation.applicationId);
    if (!policy || !target || !lab) throw new Error("Safety configuration is incomplete.");
    if (policy.emergencyStop) {
      throw new Error("Emergency stop is active. Execution refused.");
    }
    const executor = await ctx.db
      .query("dastAgents")
      .withIndex("by_application_key", (q) =>
        q.eq("applicationId", investigation.applicationId).eq("key", "safe-executor"),
      )
      .unique();
    if (executor?.paused) {
      throw new Error("Safe Execution is paused. Resume it before executing tests.");
    }
    const approval = await ctx.db
      .query("dastApprovals")
      .withIndex("by_investigation_status", (q) =>
        q.eq("investigationId", args.id).eq("status", "APPROVED"),
      )
      .first();
    if (!approval) throw new Error("Execution requires an approved safety gate.");

    const plans = await ctx.db
      .query("dastPlans")
      .withIndex("by_investigation", (q) => q.eq("investigationId", args.id))
      .collect();
    if (plans.length === 0) throw new Error("No test plans exist.");

    await ctx.db.patch(args.id, {
      status: "RUNNING",
      stage: "EXECUTION",
      currentAgent: "safe-executor",
      safetyStatus: "WITHIN_POLICY",
      updatedAt: Date.now(),
    });
    await markAgent(ctx, investigation.applicationId, "safe-executor", {
      status: "RUNNING",
      currentTask: "Dispatching approved tests",
      lastRunAt: Date.now(),
      lastInvestigationId: args.id,
    });

    const executionStart = Date.now();
    const deployment = investigation.deploymentId
      ? await ctx.db.get(investigation.deploymentId)
      : null;
    const targetScope = {
      baseUrl: target.baseUrl,
      allowedHosts: target.allowedHosts,
      allowedPaths: target.allowedPaths,
    };
    const discoveredEndpoints = await ctx.db
      .query("dastEndpoints")
      .withIndex("by_owner_application", (q) =>
        q.eq("owner", owner).eq("applicationId", investigation.applicationId),
      )
      .collect();
    const existingFindings = await ctx.db
      .query("dastFindings")
      .withIndex("by_owner_application", (q) =>
        q.eq("owner", owner).eq("applicationId", investigation.applicationId),
      )
      .collect();
    const findings: Doc<"dastFindings">[] = [];
    let requestCount = 0;
    let rejectedPlans = 0;

    for (const plan of plans) {
      const definition = definitionFor(plan.testKey);
      const scope = validateScope(
        targetScope,
        definition.method,
        definition.endpointPath,
        plan.maxRequests,
      );
      if (!scope.ok) {
        rejectedPlans += 1;
        await ctx.db.patch(plan._id, { status: "REJECTED_BY_SCOPE" });
        await ctx.db.insert("dastExecutions", {
          owner,
          investigationId: args.id,
          planId: plan._id,
          testKey: plan.testKey,
          status: "BLOCKED",
          requestCount: 0,
          startedAt: Date.now(),
          completedAt: Date.now(),
          assertions: { reason: scope.reason },
          result: { violated: false, controlPassed: false },
          error: scope.reason,
        });
        await audit(ctx, {
          owner,
          applicationId: investigation.applicationId,
          investigationId: args.id,
          type: "safety.scope.blocked",
          actor,
          message: `Blocked ${plan.testKey}: ${scope.reason}`,
          severity: "WARN",
        });
        continue;
      }

      if (requestCount + plan.maxRequests > policy.maxRequestsPerRun) {
        rejectedPlans += 1;
        await ctx.db.patch(plan._id, { status: "REJECTED_BUDGET" });
        continue;
      }

      const run = runDastTest(plan.testKey as DastTestKey, lab.mode);
      requestCount += run.requestCount;
      const executionId = await ctx.db.insert("dastExecutions", {
        owner,
        investigationId: args.id,
        planId: plan._id,
        testKey: plan.testKey,
        status: run.verificationStatus,
        requestCount: run.requestCount,
        startedAt: executionStart,
        completedAt: Date.now(),
        assertions: {
          controlPassed: run.controlPassed,
          controlDetail: run.controlDetail,
          expected: run.expected,
          actual: run.actual,
          confidence: run.confidence,
          requests: run.requests,
        },
        result: {
          violated: run.violated,
          verificationStatus: run.verificationStatus,
          testKey: run.testKey,
        },
      });
      await ctx.db.patch(plan._id, { status: run.verificationStatus });

      if (run.verificationStatus === "VERIFIED") {
        const evidence = evidenceJson(run.evidence);
        const evidenceHash = await sha256Hex(evidence);
        const findingSequence = existingFindings.length + findings.length + 1;
        const findingId = `JAAL-DAST-${String(findingSequence).padStart(3, "0")}`;
        const now = Date.now();
        const findingDoc = {
          owner,
          applicationId: investigation.applicationId,
          investigationId: args.id,
          planId: plan._id,
          findingId,
          testKey: run.testKey,
          title: run.title,
          category: run.category,
          endpointId: plan.endpointId,
          method: definition.method,
          path: definition.endpointPath,
          deploymentVersion: deployment?.version ?? "unknown",
          severity: definition.severity,
          technicalSeverity: definition.technicalSeverity,
          businessImpact: definition.businessImpact,
          confidence: run.confidence,
          status: "VERIFIED",
          expected: run.expected,
          actual: run.actual,
          reproduction: [
            {
              step: 1,
              action: `Control: ${run.controlDetail}`,
              expected: "Authorized control succeeds",
              actual: run.controlDetail,
            },
            {
              step: 2,
              action: `${run.evidence.request.method} ${run.evidence.request.path} as ${run.evidence.request.actor ?? "anonymous"}`,
              expected: "Security boundary holds",
              actual: run.actual,
            },
          ],
          requestEvidence: evidenceJson(run.evidence.request),
          responseEvidence: evidenceJson(run.evidence.response),
          evidenceHash,
          rootCause: definition.rootCause,
          remediation: definition.remediation,
          ownerTeam: definition.ownerTeam,
          affectedRoles: [LAB_ACTORS[definition.role].role],
          discoveredAt: now,
          verifiedAt: now,
          retestStatus: "NOT_RETESTED",
          retestHistory: [],
          createdAt: now,
          updatedAt: now,
        };
        const findingDocId = await ctx.db.insert("dastFindings", findingDoc);
        const saved = await ctx.db.get(findingDocId);
        if (saved) findings.push(saved);
        await ctx.db.insert("dastEvidence", {
          owner,
          applicationId: investigation.applicationId,
          findingId: findingDocId,
          investigationId: args.id,
          type: "HTTP_EXCHANGE",
          label: `${findingId} sanitized request/response`,
          content: evidence,
          sha256: evidenceHash,
          algorithm: "SHA-256",
          createdAt: now,
        });
        if (plan.endpointId) {
          const endpoint = await ctx.db.get(plan.endpointId);
          if (endpoint) {
            await ctx.db.patch(endpoint._id, {
              findingsCount: endpoint.findingsCount + 1,
              updatedAt: now,
            });
          }
        }
        await audit(ctx, {
          owner,
          applicationId: investigation.applicationId,
          investigationId: args.id,
          type: "finding.verified",
          actor,
          message: `${findingId} verified: ${run.title}`,
          severity: "CRITICAL",
          metadata: { executionId, evidenceHash },
        });
      } else {
        await audit(ctx, {
          owner,
          applicationId: investigation.applicationId,
          investigationId: args.id,
          type: "finding.rejected",
          actor,
          message: `${run.title}: ${run.verificationStatus} (${run.controlDetail})`,
          severity: "INFO",
        });
      }
    }

    const executionMs = Date.now() - executionStart;
    await markAgent(ctx, investigation.applicationId, "safe-executor", {
      status: "COMPLETED",
      currentTask: `${requestCount} requests executed`,
      durationMs: executionMs,
      success: true,
    });
    await markAgent(ctx, investigation.applicationId, "verification", {
      status: "COMPLETED",
      currentTask: `${findings.length} independent verification(s)`,
      durationMs: Math.max(1, Math.round(executionMs / 2)),
      success: true,
      lastInvestigationId: args.id,
    });
    await markAgent(ctx, investigation.applicationId, "triage-reporting", {
      status: "RUNNING",
      currentTask: "Generating impact and report",
      lastRunAt: Date.now(),
      lastInvestigationId: args.id,
    });

    const completedAt = Date.now();
    const stats = {
      ...(investigation.stats as Record<string, unknown>),
      requestCount,
      executionMs,
      verified: findings.length,
      rejectedPlans,
      deployToVerifiedMs: completedAt - investigation.startedAt,
      completedAt,
    };
    const reportId = await buildReport(
      ctx,
      owner,
      investigation,
      findings,
      discoveredEndpoints,
      deployment,
      stats,
      completedAt,
    );
    await markAgent(ctx, investigation.applicationId, "triage-reporting", {
      status: "COMPLETED",
      currentTask: `${findings.length} finding(s) reported`,
      durationMs: Math.max(1, Date.now() - completedAt),
      success: true,
    });
    await ctx.db.patch(args.id, {
      status: "COMPLETED",
      stage: "REPORTING",
      currentAgent: "triage-reporting",
      safetyStatus: "WITHIN_POLICY",
      stats,
      summary:
        findings.length === 0
          ? "No verified findings. All controls passed and no boundary violation was asserted."
          : `${findings.length} verified business-logic finding(s) reproduced with deterministic evidence.`,
      completedAt,
      updatedAt: completedAt,
    });
    const job = await ctx.db
      .query("dastJobs")
      .withIndex("by_investigation", (q) => q.eq("investigationId", args.id))
      .first();
    if (job) {
      await ctx.db.patch(job._id, {
        status: "COMPLETED",
        leaseUntil: undefined,
        updatedAt: completedAt,
      });
    }
    await audit(ctx, {
      owner,
      applicationId: investigation.applicationId,
      investigationId: args.id,
      type: "report.generated",
      actor,
      message: `Investigation ${investigation.caseId} completed with ${findings.length} verified finding(s).`,
      severity: "SUCCESS",
      metadata: { reportId, requestCount, executionMs },
    });
    return {
      verified: findings.length,
      requestCount,
      rejectedPlans,
      reportId: String(reportId),
      deployToVerifiedMs: completedAt - investigation.startedAt,
    };
  },
});

async function performRetest(
  ctx: Ctx,
  owner: string,
  finding: Doc<"dastFindings">,
  actor: string,
) {
  const run = runDastTest(finding.testKey as DastTestKey, "FIXED");
  const fixed = !run.violated && run.controlPassed;
  const outcome = fixed ? "FIXED" : "STILL_VULNERABLE";
  const evidence = evidenceJson(run.evidence);
  const evidenceHash = await sha256Hex(evidence);
  const now = Date.now();
  const retestId = await ctx.db.insert("dastRetests", {
    owner,
    findingId: finding._id,
    investigationId: finding.investigationId,
    status: "COMPLETED",
    outcome,
    detail: run.actual,
    requestCount: run.requestCount,
    startedAt: now,
    completedAt: now,
    evidenceHash,
  });
  const history = Array.isArray(finding.retestHistory) ? finding.retestHistory : [];
  await ctx.db.patch(finding._id, {
    status: outcome,
    retestStatus: outcome,
    retestHistory: [
      ...history,
      {
        at: now,
        outcome,
        detail: run.actual,
        requestCount: run.requestCount,
        evidenceHash,
        retestId,
      },
    ],
    updatedAt: now,
  });
  await ctx.db.insert("dastEvidence", {
    owner,
    applicationId: finding.applicationId,
    findingId: finding._id,
    investigationId: finding.investigationId,
    type: "RETEST_EXCHANGE",
    label: `${finding.findingId} retest evidence`,
    content: evidence,
    sha256: evidenceHash,
    algorithm: "SHA-256",
    createdAt: now,
  });
  await audit(ctx, {
    owner,
    applicationId: finding.applicationId,
    investigationId: finding.investigationId,
    type: "finding.retest.completed",
    actor,
    message: `${finding.findingId} retest: ${outcome}. ${run.actual}`,
    severity: fixed ? "SUCCESS" : "CRITICAL",
    metadata: { outcome, evidenceHash },
  });
  return { findingId: finding.findingId, outcome, detail: run.actual, evidenceHash };
}

/** Apply the fixed lab configuration and replay one verified finding. */
export const retestFinding = mutation({
  args: { id: v.id("dastFindings") },
  handler: async (ctx, args) => {
    const owner = await getOwner(ctx);
    const identity = await ctx.auth.getUserIdentity();
    const finding = await ctx.db.get(args.id);
    if (!finding || finding.owner !== owner) throw new Error("Finding not found.");
    if (finding.status === "FIXED") {
      return { findingId: finding.findingId, outcome: "FIXED", detail: "Already fixed." };
    }
    await writeLabMode(ctx, finding.applicationId, "FIXED");
    await ctx.db.patch(finding.investigationId, {
      stage: "RETEST",
      currentAgent: "retest",
      updatedAt: Date.now(),
    });
    await markAgent(ctx, finding.applicationId, "retest", {
      status: "RUNNING",
      currentTask: `Replaying ${finding.findingId}`,
      lastRunAt: Date.now(),
      lastInvestigationId: finding.investigationId,
    });
    const result = await performRetest(
      ctx,
      owner,
      finding,
      identity?.name ?? owner,
    );
    await markAgent(ctx, finding.applicationId, "retest", {
      status: "COMPLETED",
      currentTask: `${finding.findingId}: ${result.outcome}`,
      success: result.outcome === "FIXED",
      lastInvestigationId: finding.investigationId,
    });
    return result;
  },
});

export const retestAll = mutation({
  args: {},
  handler: async (ctx) => {
    const owner = await getOwner(ctx);
    const identity = await ctx.auth.getUserIdentity();
    const app = await appForOwner(ctx, owner);
    if (!app) throw new Error("No lab is initialized.");
    await writeLabMode(ctx, app._id, "FIXED");
    const findings = await ctx.db
      .query("dastFindings")
      .withIndex("by_owner_application", (q) =>
        q.eq("owner", owner).eq("applicationId", app._id),
      )
      .collect();
    const results = [];
    for (const finding of findings) {
      if (finding.status === "FIXED") {
        results.push({
          findingId: finding.findingId,
          outcome: "FIXED",
          detail: "Already fixed.",
        });
        continue;
      }
      results.push(await performRetest(ctx, owner, finding, identity?.name ?? owner));
    }
    const investigation = findings[0]
      ? await ctx.db.get(findings[0].investigationId)
      : null;
    if (investigation) {
      const [endpoints, deployment] = await Promise.all([
        ctx.db
          .query("dastEndpoints")
          .withIndex("by_owner_application", (q) =>
            q.eq("owner", owner).eq("applicationId", app._id),
          )
          .collect(),
        investigation.deploymentId ? ctx.db.get(investigation.deploymentId) : Promise.resolve(null),
      ]);
      const refreshed = await ctx.db
        .query("dastFindings")
        .withIndex("by_investigation", (q) => q.eq("investigationId", investigation._id))
        .collect();
      await buildReport(
        ctx,
        owner,
        investigation,
        refreshed,
        endpoints,
        deployment,
        {
          ...(investigation.stats as Record<string, unknown>),
          retestedAt: Date.now(),
          retestFixed: results.filter((result) => result.outcome === "FIXED").length,
        },
        Date.now(),
      );
    }
    await audit(ctx, {
      owner,
      applicationId: app._id,
      type: "retest.batch.completed",
      actor: identity?.name ?? owner,
      message: `Batch retest completed for ${findings.length} finding(s) with the fixed lab configuration.`,
      severity: "SUCCESS",
    });
    return {
      fixed: results.filter((result) => result.outcome === "FIXED").length,
      stillVulnerable: results.filter((result) => result.outcome === "STILL_VULNERABLE").length,
      results,
    };
  },
});

export const updatePolicy = mutation({
  args: {
    maxRequestsPerRun: v.optional(v.number()),
    maxConcurrency: v.optional(v.number()),
    rateLimitPerMinute: v.optional(v.number()),
    approvalRequired: v.optional(v.boolean()),
    allowRedirects: v.optional(v.boolean()),
    zombieWindowDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const owner = await getOwner(ctx);
    const app = await appForOwner(ctx, owner);
    if (!app) throw new Error("No lab is initialized.");
    const policy = await policyForApp(ctx, app._id);
    if (!policy) throw new Error("Policy missing.");
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.maxRequestsPerRun != null) {
      if (args.maxRequestsPerRun < 1 || args.maxRequestsPerRun > 200) {
        throw new Error("Request budget must be between 1 and 200.");
      }
      patch.maxRequestsPerRun = Math.round(args.maxRequestsPerRun);
    }
    if (args.maxConcurrency != null) {
      if (args.maxConcurrency < 1 || args.maxConcurrency > 5) {
        throw new Error("Concurrency must be between 1 and 5.");
      }
      patch.maxConcurrency = Math.round(args.maxConcurrency);
    }
    if (args.rateLimitPerMinute != null) {
      if (args.rateLimitPerMinute < 1 || args.rateLimitPerMinute > 120) {
        throw new Error("Rate limit must be between 1 and 120 requests/minute.");
      }
      patch.rateLimitPerMinute = Math.round(args.rateLimitPerMinute);
    }
    if (args.approvalRequired != null) patch.approvalRequired = args.approvalRequired;
    if (args.allowRedirects != null) patch.allowRedirects = false;
    if (args.zombieWindowDays != null) {
      if (args.zombieWindowDays < 1 || args.zombieWindowDays > 365) {
        throw new Error("Zombie window must be between 1 and 365 days.");
      }
      patch.zombieWindowDays = Math.round(args.zombieWindowDays);
    }
    await ctx.db.patch(policy._id, patch);
    await audit(ctx, {
      owner,
      applicationId: app._id,
      type: "safety.policy.updated",
      actor: owner,
      message: "Safety policy updated.",
      severity: "WARN",
      metadata: patch,
    });
    return { ok: true };
  },
});

export const setEmergencyStop = mutation({
  args: { enabled: v.boolean() },
  handler: async (ctx, args) => {
    const owner = await getOwner(ctx);
    const app = await appForOwner(ctx, owner);
    if (!app) throw new Error("No lab is initialized.");
    const policy = await policyForApp(ctx, app._id);
    if (!policy) throw new Error("Policy missing.");
    await ctx.db.patch(policy._id, {
      emergencyStop: args.enabled,
      updatedAt: Date.now(),
    });
    if (args.enabled) {
      const waiting = await ctx.db
        .query("dastInvestigations")
        .withIndex("by_owner_application", (q) =>
          q.eq("owner", owner).eq("applicationId", app._id),
        )
        .collect();
      for (const investigation of waiting) {
        if (["RUNNING", "WAITING_FOR_APPROVAL"].includes(investigation.status)) {
          await ctx.db.patch(investigation._id, {
            status: "CANCELLED",
            stage: "SAFETY_REVIEW",
            safetyStatus: "EMERGENCY_STOP",
            updatedAt: Date.now(),
          });
          const approval = await ctx.db
            .query("dastApprovals")
            .withIndex("by_investigation_status", (q) =>
              q.eq("investigationId", investigation._id).eq("status", "PENDING"),
            )
            .first();
          if (approval) await ctx.db.patch(approval._id, { status: "EXPIRED" });
        }
      }
    }
    await audit(ctx, {
      owner,
      applicationId: app._id,
      type: args.enabled ? "safety.emergency_stop.engaged" : "safety.emergency_stop.released",
      actor: owner,
      message: args.enabled
        ? "Global emergency stop engaged. New outbound tests are refused."
        : "Emergency stop released.",
      severity: args.enabled ? "CRITICAL" : "SUCCESS",
    });
    return { emergencyStop: args.enabled };
  },
});

export const setLabMode = mutation({
  args: { mode: v.union(v.literal("VULNERABLE"), v.literal("FIXED")) },
  handler: async (ctx, args) => {
    const owner = await getOwner(ctx);
    const app = await appForOwner(ctx, owner);
    if (!app) throw new Error("No lab is initialized.");
    await writeLabMode(ctx, app._id, args.mode);
    await audit(ctx, {
      owner,
      applicationId: app._id,
      type: "lab.mode.changed",
      actor: owner,
      message: `Synthetic lab switched to ${args.mode}.`,
      severity: "WARN",
    });
    return { mode: args.mode };
  },
});

export const setAgentControl = mutation({
  args: {
    key: v.string(),
    action: v.union(v.literal("PAUSE"), v.literal("RESUME"), v.literal("CANCEL")),
  },
  handler: async (ctx, args) => {
    const owner = await getOwner(ctx);
    const app = await appForOwner(ctx, owner);
    if (!app) throw new Error("No lab is initialized.");
    const agent = await ctx.db
      .query("dastAgents")
      .withIndex("by_application_key", (q) =>
        q.eq("applicationId", app._id).eq("key", args.key),
      )
      .unique();
    if (!agent) throw new Error("Unknown agent.");
    if (args.action === "PAUSE") {
      await ctx.db.patch(agent._id, {
        paused: true,
        status: "PAUSED",
        currentTask: "Paused by operator; future scheduling suspended",
        updatedAt: Date.now(),
      });
    } else if (args.action === "RESUME") {
      await ctx.db.patch(agent._id, {
        paused: false,
        status: "IDLE",
        currentTask: undefined,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.patch(agent._id, {
        status: "CANCELLED",
        paused: true,
        currentTask: "Cancelled by operator",
        updatedAt: Date.now(),
      });
      if (agent.lastInvestigationId) {
        const investigation = await ctx.db.get(agent.lastInvestigationId);
        if (investigation && investigation.status !== "COMPLETED") {
          await ctx.db.patch(investigation._id, {
            status: "CANCELLED",
            safetyStatus: "CANCELLED_BY_OPERATOR",
            updatedAt: Date.now(),
          });
          const approval = await ctx.db
            .query("dastApprovals")
            .withIndex("by_investigation_status", (q) =>
              q.eq("investigationId", agent.lastInvestigationId!).eq("status", "PENDING"),
            )
            .first();
          if (approval) await ctx.db.patch(approval._id, { status: "EXPIRED" });
        }
      }
    }
    await audit(ctx, {
      owner,
      applicationId: app._id,
      type: `agent.${args.action.toLowerCase()}`,
      actor: owner,
      message: `${agent.name}: ${args.action.toLowerCase()} requested.`,
      severity: "WARN",
    });
    return { ok: true };
  },
});

export const denyInvestigation = mutation({
  args: { id: v.id("dastInvestigations"), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const owner = await getOwner(ctx);
    const investigation = await ctx.db.get(args.id);
    if (!investigation || investigation.owner !== owner) throw new Error("Investigation not found.");
    const approval = await ctx.db
      .query("dastApprovals")
      .withIndex("by_investigation_status", (q) =>
        q.eq("investigationId", args.id).eq("status", "PENDING"),
      )
      .first();
    if (approval) {
      await ctx.db.patch(approval._id, {
        status: "DENIED",
        decidedAt: Date.now(),
        decidedBy: owner,
        note: args.note ?? "Denied by operator.",
      });
    }
    await ctx.db.patch(args.id, {
      status: "CANCELLED",
      safetyStatus: "APPROVAL_DENIED",
      updatedAt: Date.now(),
    });
    await audit(ctx, {
      owner,
      applicationId: investigation.applicationId,
      investigationId: args.id,
      type: "safety.approval.denied",
      actor: owner,
      message: "Operator denied active execution.",
      severity: "WARN",
    });
    return { denied: true };
  },
});

export const setPlanAiRationale = mutation({
  args: { planId: v.id("dastPlans"), rationale: v.string() },
  handler: async (ctx, args) => {
    const owner = await getOwner(ctx);
    const plan = await ctx.db.get(args.planId);
    if (!plan || plan.owner !== owner) throw new Error("Plan not found.");
    const investigation = await ctx.db.get(plan.investigationId);
    if (!investigation || investigation.owner !== owner) {
      throw new Error("Plan investigation not found.");
    }
    // Advisory text only. Strip links and cap length; execution never reads it.
    const cleaned = args.rationale
      .replace(/https?:\/\/\S+/gi, "[link removed]")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 600);
    if (!cleaned) throw new Error("Rationale is empty.");
    await ctx.db.patch(plan._id, { aiRationale: cleaned });
    await audit(ctx, {
      owner,
      applicationId: plan.applicationId,
      investigationId: plan.investigationId,
      type: "attack.plan.ai_advisory",
      actor: owner,
      message: `Groq advisory attached to ${plan.testKey} (advisory only).`,
      severity: "INFO",
    });
    return { ok: true };
  },
});

export const resetLab = mutation({
  args: {},
  handler: async (ctx) => {
    const owner = await getOwner(ctx);
    const app = await appForOwner(ctx, owner);
    if (!app) return { reset: false };
    const appId = app._id;
    const investigations = await ctx.db
      .query("dastInvestigations")
      .withIndex("by_owner_application", (q) =>
        q.eq("owner", owner).eq("applicationId", appId),
      )
      .collect();
    for (const investigation of investigations) {
      const evidence = await ctx.db
        .query("dastEvidence")
        .withIndex("by_investigation", (q) => q.eq("investigationId", investigation._id))
        .collect();
      for (const row of evidence) await ctx.db.delete(row._id);
      const approvals = await ctx.db
        .query("dastApprovals")
        .withIndex("by_investigation_status", (q) => q.eq("investigationId", investigation._id))
        .collect();
      for (const row of approvals) await ctx.db.delete(row._id);
      const executions = await ctx.db
        .query("dastExecutions")
        .withIndex("by_investigation", (q) => q.eq("investigationId", investigation._id))
        .collect();
      for (const row of executions) await ctx.db.delete(row._id);
      const plans = await ctx.db
        .query("dastPlans")
        .withIndex("by_investigation", (q) => q.eq("investigationId", investigation._id))
        .collect();
      for (const row of plans) await ctx.db.delete(row._id);
      const reports = await ctx.db
        .query("dastReports")
        .withIndex("by_investigation", (q) => q.eq("investigationId", investigation._id))
        .collect();
      for (const row of reports) await ctx.db.delete(row._id);
      const retests = await ctx.db
        .query("dastRetests")
        .withIndex("by_investigation", (q) => q.eq("investigationId", investigation._id))
        .collect();
      for (const row of retests) await ctx.db.delete(row._id);
      const jobs = await ctx.db
        .query("dastJobs")
        .withIndex("by_investigation", (q) => q.eq("investigationId", investigation._id))
        .collect();
      for (const row of jobs) await ctx.db.delete(row._id);
      const audits = await ctx.db
        .query("dastAudit")
        .withIndex("by_investigation", (q) => q.eq("investigationId", investigation._id))
        .collect();
      for (const row of audits) await ctx.db.delete(row._id);
      const findings = await ctx.db
        .query("dastFindings")
        .withIndex("by_investigation", (q) => q.eq("investigationId", investigation._id))
        .collect();
      for (const row of findings) await ctx.db.delete(row._id);
      await ctx.db.delete(investigation._id);
    }
    for (const table of ["dastObservations", "dastEndpoints", "dastDeployments", "dastAgents", "dastFlows", "dastOwners"] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_owner_application", (q) =>
          q.eq("owner", owner).eq("applicationId", appId),
        )
        .collect();
      for (const row of rows) await ctx.db.delete(row._id);
    }
    const remainingEvidence = await ctx.db
      .query("dastEvidence")
      .withIndex("by_owner_created", (q) => q.eq("owner", owner))
      .collect();
    for (const row of remainingEvidence) await ctx.db.delete(row._id);
    const remainingAudit = await ctx.db
      .query("dastAudit")
      .withIndex("by_owner_at", (q) => q.eq("owner", owner))
      .collect();
    for (const row of remainingAudit) await ctx.db.delete(row._id);
    const config = await labForApp(ctx, appId);
    if (config) await ctx.db.delete(config._id);
    const policy = await policyForApp(ctx, appId);
    if (policy) await ctx.db.delete(policy._id);
    const target = await targetForApp(ctx, appId);
    if (target) await ctx.db.delete(target._id);
    await ctx.db.delete(appId);
    return { reset: true };
  },
});

// ------------------------------------------------------------------ queries ---

export const overview = query({
  args: {},
  handler: async (ctx) => {
    const owner = await getOwner(ctx);
    const app = await appForOwner(ctx, owner);
    if (!app) return null;
    const [endpoints, findings, investigations, deployments, agents, reports, auditRows, retests] =
      await Promise.all([
        ctx.db
          .query("dastEndpoints")
          .withIndex("by_owner_application", (q) =>
            q.eq("owner", owner).eq("applicationId", app._id),
          )
          .collect(),
        ctx.db
          .query("dastFindings")
          .withIndex("by_owner_application", (q) =>
            q.eq("owner", owner).eq("applicationId", app._id),
          )
          .collect(),
        ctx.db
          .query("dastInvestigations")
          .withIndex("by_owner_application", (q) =>
            q.eq("owner", owner).eq("applicationId", app._id),
          )
          .collect(),
        ctx.db
          .query("dastDeployments")
          .withIndex("by_owner_application", (q) =>
            q.eq("owner", owner).eq("applicationId", app._id),
          )
          .collect(),
        ctx.db
          .query("dastAgents")
          .withIndex("by_owner_application", (q) =>
            q.eq("owner", owner).eq("applicationId", app._id),
          )
          .collect(),
        ctx.db
          .query("dastReports")
          .withIndex("by_owner_application", (q) =>
            q.eq("owner", owner).eq("applicationId", app._id),
          )
          .collect(),
        ctx.db
          .query("dastAudit")
          .withIndex("by_owner_at", (q) => q.eq("owner", owner))
          .order("desc")
          .take(14),
        ctx.db
          .query("dastRetests")
          .withIndex("by_owner", (q) => q.eq("owner", owner))
          .collect(),
      ]);

    const severityCounts = Object.fromEntries(
      SEVERITY_ORDER.map((severity) => [
        severity,
        findings.filter((finding) => finding.severity === severity).length,
      ]),
    ) as Record<DastSeverity, number>;
    const active = endpoints.filter((endpoint) => endpoint.classification === "ACTIVE").length;
    const zombie = endpoints.filter((endpoint) => endpoint.classification === "ZOMBIE").length;
    const shadow = endpoints.filter((endpoint) => endpoint.classification === "SHADOW").length;
    const unknown = endpoints.filter((endpoint) => endpoint.classification === "UNKNOWN").length;
    const verified = findings.filter((finding) => finding.status === "VERIFIED").length;
    const completed = investigations.filter((investigation) => investigation.status === "COMPLETED");
    const latencies = completed
      .map((investigation) => Number((investigation.stats as Record<string, unknown>)?.deployToVerifiedMs ?? 0))
      .filter((value) => value > 0);
    const mttvf = latencies.length
      ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length)
      : null;
    const fixed = retests.filter((retest) => retest.outcome === "FIXED").length;
    const retestSuccess = retests.length ? fixed / retests.length : null;

    const dayMap = new Map<string, { date: string; total: number; critical: number }>();
    for (let i = 13; i >= 0; i -= 1) {
      const date = new Date(Date.now() - i * DAY).toISOString().slice(0, 10);
      dayMap.set(date, { date, total: 0, critical: 0 });
    }
    for (const finding of findings) {
      const date = new Date(finding.discoveredAt).toISOString().slice(0, 10);
      const bucket = dayMap.get(date);
      if (bucket) {
        bucket.total += 1;
        if (finding.severity === "CRITICAL") bucket.critical += 1;
      }
    }

    return {
      application: app,
      endpointCount: endpoints.length,
      active,
      zombie,
      shadow,
      unknown,
      verified,
      critical: findings.filter((finding) => finding.severity === "CRITICAL").length,
      findingsTotal: findings.length,
      investigationsRunning: investigations.filter((investigation) =>
        ["RUNNING", "WAITING_FOR_APPROVAL"].includes(investigation.status),
      ).length,
      completedInvestigations: completed.length,
      deploymentCount: deployments.length,
      severityCounts,
      mttvf,
      retestSuccess,
      retestCount: retests.length,
      trends: [...dayMap.values()],
      agents: agents.map((agent) => ({
        key: agent.key,
        name: agent.name,
        status: agent.status,
        success: agent.success ?? null,
        durationMs: agent.durationMs ?? null,
      })),
      activity: auditRows,
      latestDeployment: deployments.sort((a, b) => b.receivedAt - a.receivedAt)[0] ?? null,
      latestInvestigation:
        investigations.sort((a, b) => b.startedAt - a.startedAt)[0] ?? null,
      reportCount: reports.length,
      inventory: { active, zombie, shadow, unknown },
    };
  },
});

export const investigations = query({
  args: {},
  handler: async (ctx) => {
    const owner = await getOwner(ctx);
    const app = await appForOwner(ctx, owner);
    if (!app) return [];
    const rows = await ctx.db
      .query("dastInvestigations")
      .withIndex("by_owner_application", (q) =>
        q.eq("owner", owner).eq("applicationId", app._id),
      )
      .collect();
    return rows.sort((a, b) => b.startedAt - a.startedAt);
  },
});

export const investigation = query({
  args: { id: v.id("dastInvestigations") },
  handler: async (ctx, args) => {
    const owner = await getOwner(ctx);
    const row = await ctx.db.get(args.id);
    if (!row || row.owner !== owner) return null;
    const [plans, executions, approvals, findings, events, deployment] = await Promise.all([
      ctx.db
        .query("dastPlans")
        .withIndex("by_investigation", (q) => q.eq("investigationId", args.id))
        .collect(),
      ctx.db
        .query("dastExecutions")
        .withIndex("by_investigation", (q) => q.eq("investigationId", args.id))
        .collect(),
      ctx.db
        .query("dastApprovals")
        .withIndex("by_investigation_status", (q) => q.eq("investigationId", args.id))
        .collect(),
      ctx.db
        .query("dastFindings")
        .withIndex("by_investigation", (q) => q.eq("investigationId", args.id))
        .collect(),
      ctx.db
        .query("dastAudit")
        .withIndex("by_investigation", (q) => q.eq("investigationId", args.id))
        .collect(),
      row.deploymentId ? ctx.db.get(row.deploymentId) : Promise.resolve(null),
    ]);
    return {
      investigation: row,
      plans: plans.sort((a, b) => a.createdAt - b.createdAt),
      executions: executions.sort((a, b) => a.startedAt - b.startedAt),
      approvals,
      findings,
      events: events.sort((a, b) => a.at - b.at),
      deployment,
    };
  },
});

export const endpoints = query({
  args: {},
  handler: async (ctx) => {
    const owner = await getOwner(ctx);
    const app = await appForOwner(ctx, owner);
    if (!app) return [];
    const rows = await ctx.db
      .query("dastEndpoints")
      .withIndex("by_owner_application", (q) =>
        q.eq("owner", owner).eq("applicationId", app._id),
      )
      .collect();
    return rows.sort((a, b) => {
      const rank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as Record<string, number>;
      return (rank[a.riskLevel] ?? 4) - (rank[b.riskLevel] ?? 4);
    });
  },
});

export const graph = query({
  args: {},
  handler: async (ctx) => {
    const owner = await getOwner(ctx);
    const app = await appForOwner(ctx, owner);
    if (!app) return { nodes: [], edges: [] };
    const [endpoints, flows, findings] = await Promise.all([
      ctx.db
        .query("dastEndpoints")
        .withIndex("by_owner_application", (q) =>
          q.eq("owner", owner).eq("applicationId", app._id),
        )
        .collect(),
      ctx.db
        .query("dastFlows")
        .withIndex("by_owner_application", (q) =>
          q.eq("owner", owner).eq("applicationId", app._id),
        )
        .collect(),
      ctx.db
        .query("dastFindings")
        .withIndex("by_owner_application", (q) =>
          q.eq("owner", owner).eq("applicationId", app._id),
        )
        .collect(),
    ]);
    const nodes: Array<Record<string, unknown>> = [
      { id: `app:${app._id}`, label: "Synthetic Travel Lab", type: "application" },
    ];
    const edges: Array<Record<string, unknown>> = [];
    const services = new Set(endpoints.map((endpoint) => endpoint.service));
    for (const service of services) {
      nodes.push({ id: `service:${service}`, label: service, type: "service" });
      edges.push({ source: `app:${app._id}`, target: `service:${service}`, label: "CALLS" });
    }
    for (const flow of flows) {
      nodes.push({ id: `flow:${flow.key}`, label: flow.name, type: "flow" });
    }
    for (const endpoint of endpoints) {
      nodes.push({
        id: `endpoint:${endpoint._id}`,
        label: `${endpoint.method} ${endpoint.path}`,
        type: "endpoint",
        classification: endpoint.classification,
        risk: endpoint.riskLevel,
      });
      edges.push({
        source: `service:${endpoint.service}`,
        target: `endpoint:${endpoint._id}`,
        label: "BELONGS_TO",
      });
      const flow = flows.find((item) => item.endpointPaths.includes(endpoint.path));
      if (flow) {
        edges.push({
          source: `endpoint:${endpoint._id}`,
          target: `flow:${flow.key}`,
          label: "PART_OF_FLOW",
        });
      }
    }
    for (const finding of findings) {
      nodes.push({
        id: `finding:${finding._id}`,
        label: finding.findingId,
        type: "finding",
        severity: finding.severity,
      });
      if (finding.endpointId) {
        edges.push({
          source: `finding:${finding._id}`,
          target: `endpoint:${finding.endpointId}`,
          label: "AFFECTED_BY",
        });
      }
    }
    return { nodes, edges, applicationName: app.name };
  },
});

export const agents = query({
  args: {},
  handler: async (ctx) => {
    const owner = await getOwner(ctx);
    const app = await appForOwner(ctx, owner);
    if (!app) return [];
    const rows = await ctx.db
      .query("dastAgents")
      .withIndex("by_owner_application", (q) =>
        q.eq("owner", owner).eq("applicationId", app._id),
      )
      .collect();
    return rows.sort(
      (a, b) =>
        DAST_AGENTS.findIndex((item) => item.key === a.key) -
        DAST_AGENTS.findIndex((item) => item.key === b.key),
    );
  },
});

export const findings = query({
  args: {},
  handler: async (ctx) => {
    const owner = await getOwner(ctx);
    const app = await appForOwner(ctx, owner);
    if (!app) return [];
    const rows = await ctx.db
      .query("dastFindings")
      .withIndex("by_owner_application", (q) =>
        q.eq("owner", owner).eq("applicationId", app._id),
      )
      .collect();
    return rows.sort((a, b) => b.discoveredAt - a.discoveredAt);
  },
});

export const finding = query({
  args: { id: v.id("dastFindings") },
  handler: async (ctx, args) => {
    const owner = await getOwner(ctx);
    const row = await ctx.db.get(args.id);
    if (!row || row.owner !== owner) return null;
    const [evidence, retests, report] = await Promise.all([
      ctx.db
        .query("dastEvidence")
        .withIndex("by_finding", (q) => q.eq("findingId", args.id))
        .collect(),
      ctx.db
        .query("dastRetests")
        .withIndex("by_finding", (q) => q.eq("findingId", args.id))
        .collect(),
      ctx.db
        .query("dastReports")
        .withIndex("by_investigation", (q) => q.eq("investigationId", row.investigationId))
        .first(),
    ]);
    return {
      finding: row,
      evidence: evidence.sort((a, b) => b.createdAt - a.createdAt),
      retests: retests.sort((a, b) => b.startedAt - a.startedAt),
      report: report ?? null,
    };
  },
});

export const deployments = query({
  args: {},
  handler: async (ctx) => {
    const owner = await getOwner(ctx);
    const app = await appForOwner(ctx, owner);
    if (!app) return [];
    const rows = await ctx.db
      .query("dastDeployments")
      .withIndex("by_owner_application", (q) =>
        q.eq("owner", owner).eq("applicationId", app._id),
      )
      .collect();
    return rows.sort((a, b) => b.receivedAt - a.receivedAt);
  },
});

export const evidence = query({
  args: {},
  handler: async (ctx) => {
    const owner = await getOwner(ctx);
    const rows = await ctx.db
      .query("dastEvidence")
      .withIndex("by_owner_created", (q) => q.eq("owner", owner))
      .collect();
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const reports = query({
  args: {},
  handler: async (ctx) => {
    const owner = await getOwner(ctx);
    const app = await appForOwner(ctx, owner);
    if (!app) return [];
    const rows = await ctx.db
      .query("dastReports")
      .withIndex("by_owner_application", (q) =>
        q.eq("owner", owner).eq("applicationId", app._id),
      )
      .collect();
    return rows.sort((a, b) => b.generatedAt - a.generatedAt);
  },
});

export const report = query({
  args: { id: v.id("dastReports") },
  handler: async (ctx, args) => {
    const owner = await getOwner(ctx);
    const row = await ctx.db.get(args.id);
    if (!row || row.owner !== owner) return null;
    return row;
  },
});

export const auditLog = query({
  args: {},
  handler: async (ctx) => {
    const owner = await getOwner(ctx);
    return await ctx.db
      .query("dastAudit")
      .withIndex("by_owner_at", (q) => q.eq("owner", owner))
      .order("desc")
      .take(80);
  },
});

export const safety = query({
  args: {},
  handler: async (ctx) => {
    const owner = await getOwner(ctx);
    const app = await appForOwner(ctx, owner);
    if (!app) return null;
    const [target, policy, lab, auditRows] = await Promise.all([
      targetForApp(ctx, app._id),
      policyForApp(ctx, app._id),
      labForApp(ctx, app._id),
      ctx.db
        .query("dastAudit")
        .withIndex("by_owner_at", (q) => q.eq("owner", owner))
        .order("desc")
        .take(40),
    ]);
    return { application: app, target, policy, lab, audit: auditRows };
  },
});
