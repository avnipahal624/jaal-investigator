import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

function setup(subject = "dast-owner") {
  return convexTest(schema, modules).withIdentity({ subject });
}

type T = ReturnType<typeof setup>;

async function seeded(t: T) {
  await t.mutation(api.dast.seedLab, {});
  return t;
}

describe("agentic DAST end-to-end", () => {
  it("seeds the synthetic lab without fabricating findings", async () => {
    const t = await seeded(setup());
    const bootstrap = await t.query(api.dast.bootstrap, {});
    expect(bootstrap?.application.environment).toBe("SYNTHETIC_LAB");
    expect(bootstrap?.target?.allowedHosts).toEqual(["lab.jaal.internal"]);
    expect(bootstrap?.policy?.approvalRequired).toBe(true);
    expect(bootstrap?.agents).toHaveLength(7);
    expect(bootstrap?.endpointCount).toBe(0);
    expect(bootstrap?.findingCount).toBe(0);
  });

  it("runs detect → discover → plan and stops at the human safety gate", async () => {
    const t = await seeded(setup());
    const deployment = await t.mutation(api.dast.triggerDeployment, {});
    const detail = await t.query(api.dast.investigation, {
      id: deployment.investigationId,
    });
    expect(detail).not.toBeNull();
    expect(detail?.investigation.status).toBe("WAITING_FOR_APPROVAL");
    expect(detail?.investigation.stage).toBe("SAFETY_REVIEW");
    expect(detail?.investigation.safetyStatus).toBe("AWAITING_HUMAN_APPROVAL");
    expect(detail?.plans).toHaveLength(6);
    expect(detail?.approvals).toHaveLength(1);
    expect(detail?.approvals[0]?.status).toBe("PENDING");
    expect(detail?.findings).toHaveLength(0);
    expect(detail?.executions).toHaveLength(0);

    const endpoints = await t.query(api.dast.endpoints, {});
    expect(endpoints).toHaveLength(12);
    expect(endpoints.filter((endpoint) => endpoint.classification === "ZOMBIE")).toHaveLength(1);
    expect(endpoints.filter((endpoint) => endpoint.classification === "SHADOW")).toHaveLength(1);
    expect(endpoints.filter((endpoint) => endpoint.classification === "ACTIVE")).toHaveLength(10);
    expect(endpoints.every((endpoint) => endpoint.lastObservedAt != null)).toBe(true);

    const overview = await t.query(api.dast.overview, {});
    expect(overview?.verified).toBe(0);
    expect(overview?.endpointCount).toBe(12);
    expect(overview?.latestDeployment?.status).toBe("INVESTIGATED");
  });

  it("keeps AI advisory optional and never affects the deterministic plan", async () => {
    const t = await seeded(setup());
    const deployment = await t.mutation(api.dast.triggerDeployment, {});
    const result = await t.action(api.dastAi.enrichPlans, {
      id: deployment.investigationId,
    });
    expect(result.ok).toBe(false);
    expect(result.count).toBe(0);
    const detail = await t.query(api.dast.investigation, {
      id: deployment.investigationId,
    });
    expect(detail?.plans.every((plan) => plan.aiRationale == null)).toBe(true);
    expect(detail?.plans).toHaveLength(6);
  });

  it("cannot disable the mandatory human approval gate", async () => {
    const t = await seeded(setup());
    await expect(
      t.mutation(api.dast.updatePolicy, { approvalRequired: false }),
    ).rejects.toThrow(/cannot be disabled/i);
    const bootstrap = await t.query(api.dast.bootstrap, {});
    expect(bootstrap?.policy?.approvalRequired).toBe(true);
  });

  it("rejects an approval after the locked plan is changed", async () => {
    const t = await seeded(setup());
    const deployment = await t.mutation(api.dast.triggerDeployment, {});
    const detail = await t.query(api.dast.investigation, {
      id: deployment.investigationId,
    });
    const planId = detail!.plans[0]._id;
    await t.run(async (ctx) => {
      await ctx.db.patch(planId, { maxRequests: 5 });
    });
    await expect(
      t.mutation(api.dast.approveInvestigation, { id: deployment.investigationId }),
    ).rejects.toThrow(/plan or scope changed/i);
    const after = await t.query(api.dast.investigation, {
      id: deployment.investigationId,
    });
    expect(after?.executions).toHaveLength(0);
  });

  it("rejects stale approval and duplicate execution", async () => {
    const t = await seeded(setup());
    const deployment = await t.mutation(api.dast.triggerDeployment, {});
    await t.mutation(api.dast.approveInvestigation, { id: deployment.investigationId });
    const detail = await t.query(api.dast.investigation, {
      id: deployment.investigationId,
    });
    const approvalId = detail!.approvals[0]._id;
    await t.run(async (ctx) => {
      await ctx.db.patch(approvalId, { expiresAt: Date.now() - 1 });
    });
    await expect(
      t.mutation(api.dast.executeInvestigation, { id: deployment.investigationId }),
    ).rejects.toThrow(/expired/i);
    const after = await t.query(api.dast.investigation, {
      id: deployment.investigationId,
    });
    expect(after?.executions).toHaveLength(0);
  });

  it("consumes approval so a completed run cannot be replayed", async () => {
    const t = await seeded(setup());
    const deployment = await t.mutation(api.dast.triggerDeployment, {});
    await t.mutation(api.dast.approveInvestigation, { id: deployment.investigationId });
    await t.mutation(api.dast.executeInvestigation, { id: deployment.investigationId });
    await expect(
      t.mutation(api.dast.executeInvestigation, { id: deployment.investigationId }),
    ).rejects.toThrow(/fresh approval|completed/i);
    const detail = await t.query(api.dast.investigation, {
      id: deployment.investigationId,
    });
    expect(detail?.executions).toHaveLength(6);
    expect(detail?.findings).toHaveLength(6);
    expect(detail?.approvals[0]?.status).toBe("CONSUMED");
  });

  it("requires explicit confirmation for retests", async () => {
    const t = await seeded(setup());
    const deployment = await t.mutation(api.dast.triggerDeployment, {});
    await t.mutation(api.dast.approveInvestigation, { id: deployment.investigationId });
    await t.mutation(api.dast.executeInvestigation, { id: deployment.investigationId });
    await expect(
      t.mutation(api.dast.retestAll, { confirmed: false }),
    ).rejects.toThrow(/confirmation/i);
    const findings = await t.query(api.dast.findings, {});
    expect(findings.every((finding) => finding.status === "VERIFIED")).toBe(true);
  });

  it("invalidates an approved gate when the safety policy changes", async () => {
    const t = await seeded(setup());
    const deployment = await t.mutation(api.dast.triggerDeployment, {});
    await t.mutation(api.dast.approveInvestigation, { id: deployment.investigationId });
    const updated = await t.mutation(api.dast.updatePolicy, { maxRequestsPerRun: 61 });
    expect(updated.invalidatedApprovals).toBe(1);
    const detail = await t.query(api.dast.investigation, {
      id: deployment.investigationId,
    });
    expect(detail?.approvals[0]?.status).toBe("EXPIRED");
    await expect(
      t.mutation(api.dast.executeInvestigation, { id: deployment.investigationId }),
    ).rejects.toThrow(/approved safety gate|fresh approval/i);
  });

  it("blocks plans before dispatch when the approved request budget is too small", async () => {
    const t = await seeded(setup());
    await t.mutation(api.dast.updatePolicy, { maxRequestsPerRun: 1 });
    const deployment = await t.mutation(api.dast.triggerDeployment, {});
    await t.mutation(api.dast.approveInvestigation, { id: deployment.investigationId });
    const result = await t.mutation(api.dast.executeInvestigation, {
      id: deployment.investigationId,
    });
    expect(result.verified).toBe(0);
    expect(result.requestCount).toBe(0);
    expect(result.rejectedPlans).toBe(6);
    const detail = await t.query(api.dast.investigation, {
      id: deployment.investigationId,
    });
    expect(detail?.executions).toHaveLength(6);
    expect(
      detail?.executions.every(
        (execution) =>
          execution.status === "BLOCKED" &&
          (execution.assertions as Record<string, unknown>)?.phase === "PREFLIGHT",
      ),
    ).toBe(true);
  });

  it("allows only one concurrent execution attempt to consume the approval", async () => {
    const t = await seeded(setup());
    const deployment = await t.mutation(api.dast.triggerDeployment, {});
    await t.mutation(api.dast.approveInvestigation, { id: deployment.investigationId });
    const attempts = await Promise.allSettled([
      t.mutation(api.dast.executeInvestigation, { id: deployment.investigationId }),
      t.mutation(api.dast.executeInvestigation, { id: deployment.investigationId }),
    ]);
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === "rejected")).toHaveLength(1);
    const detail = await t.query(api.dast.investigation, {
      id: deployment.investigationId,
    });
    expect(detail?.executions).toHaveLength(6);
    expect(detail?.findings).toHaveLength(6);
  });

  it("refuses active execution without approval", async () => {
    const t = await seeded(setup());
    const deployment = await t.mutation(api.dast.triggerDeployment, {});
    await expect(
      t.mutation(api.dast.executeInvestigation, { id: deployment.investigationId }),
    ).rejects.toThrow(/approved safety gate/);
  });

  it("executes approved tests, verifies real findings and seals evidence", async () => {
    const t = await seeded(setup());
    const deployment = await t.mutation(api.dast.triggerDeployment, {});
    await t.mutation(api.dast.approveInvestigation, {
      id: deployment.investigationId,
      note: "Test approval",
    });
    const result = await t.mutation(api.dast.executeInvestigation, {
      id: deployment.investigationId,
    });
    expect(result.verified).toBe(6);
    expect(result.requestCount).toBeGreaterThan(0);
    expect(result.deployToVerifiedMs).toBeGreaterThanOrEqual(0);

    const detail = await t.query(api.dast.investigation, {
      id: deployment.investigationId,
    });
    expect(detail?.investigation.status).toBe("COMPLETED");
    expect(detail?.findings).toHaveLength(6);
    expect(detail?.executions).toHaveLength(6);
    expect(detail?.findings.every((finding) => finding.status === "VERIFIED")).toBe(true);
    expect(detail?.findings.every((finding) => /^[a-f0-9]{64}$/.test(finding.evidenceHash))).toBe(
      true,
    );

    const evidence = await t.query(api.dast.evidence, {});
    expect(evidence).toHaveLength(6);
    expect(evidence.every((row) => row.type === "HTTP_EXCHANGE")).toBe(true);
    expect(evidence.every((row) => row.content.includes("[REDACTED]") || row.content.length > 0)).toBe(
      true,
    );

    const reports = await t.query(api.dast.reports, {});
    expect(reports).toHaveLength(1);
    expect(reports[0]?.findingCount).toBe(6);
    expect(reports[0]?.markdown).toContain("JAAL-DAST-001");
    expect(reports[0]?.markdown).toContain("Synthetic Travel Security Lab");

    const overview = await t.query(api.dast.overview, {});
    expect(overview?.verified).toBe(6);
    expect(overview?.critical).toBeGreaterThan(0);
    expect(overview?.mttvf).not.toBeNull();
    expect(overview?.reportCount).toBe(1);
    expect(overview?.agents.slice(0, 6).every((agent) => agent.status === "COMPLETED")).toBe(
      true,
    );
  });

  it("retests all verified findings against the fixed configuration", async () => {
    const t = await seeded(setup());
    const deployment = await t.mutation(api.dast.triggerDeployment, {});
    await t.mutation(api.dast.approveInvestigation, { id: deployment.investigationId });
    await t.mutation(api.dast.executeInvestigation, { id: deployment.investigationId });

    const retest = await t.mutation(api.dast.retestAll, { confirmed: true });
    expect(retest.fixed).toBe(6);
    expect(retest.stillVulnerable).toBe(0);

    const findings = await t.query(api.dast.findings, {});
    expect(findings.every((finding) => finding.status === "FIXED")).toBe(true);
    expect(findings.every((finding) => finding.retestStatus === "FIXED")).toBe(true);

    let evidence = await t.query(api.dast.evidence, {});
    expect(evidence.filter((row) => row.type === "RETEST_EXCHANGE")).toHaveLength(6);
    const reports = await t.query(api.dast.reports, {});
    expect(reports[0]?.markdown).toContain("FIXED");

    const second = await t.mutation(api.dast.retestAll, { confirmed: true });
    expect(second.fixed).toBe(6);
    expect(second.stillVulnerable).toBe(0);
    evidence = await t.query(api.dast.evidence, {});
    expect(evidence.filter((row) => row.type === "RETEST_EXCHANGE")).toHaveLength(6);
  });

  it("isolates owners and refuses cross-owner investigation access", async () => {
    const t = await seeded(setup("owner-a"));
    const deployment = await t.mutation(api.dast.triggerDeployment, {});
    const intruder = t.withIdentity({ subject: "owner-b" });
    expect(await intruder.query(api.dast.bootstrap, {})).toBeNull();
    expect(await intruder.query(api.dast.investigation, { id: deployment.investigationId })).toBeNull();
    await expect(
      intruder.mutation(api.dast.approveInvestigation, { id: deployment.investigationId }),
    ).rejects.toThrow(/not found/i);
    expect(await intruder.query(api.dast.findings, {})).toEqual([]);
  });

  it("expires an already-approved gate when emergency stop is engaged", async () => {
    const t = await seeded(setup());
    const deployment = await t.mutation(api.dast.triggerDeployment, {});
    await t.mutation(api.dast.approveInvestigation, { id: deployment.investigationId });
    await t.mutation(api.dast.setEmergencyStop, { enabled: true });
    await expect(
      t.mutation(api.dast.executeInvestigation, { id: deployment.investigationId }),
    ).rejects.toThrow(/cancelled|expired|emergency stop/i);
    const detail = await t.query(api.dast.investigation, {
      id: deployment.investigationId,
    });
    expect(detail?.investigation.status).toBe("CANCELLED");
    expect(detail?.approvals[0]?.status).toBe("EXPIRED");
  });

  it("blocks deployment-triggered work while emergency stop is engaged", async () => {
    const t = await seeded(setup());
    await t.mutation(api.dast.setEmergencyStop, { enabled: true });
    await expect(t.mutation(api.dast.triggerDeployment, {})).rejects.toThrow(
      /Emergency stop/,
    );
    await t.mutation(api.dast.setEmergencyStop, { enabled: false });
    const deployment = await t.mutation(api.dast.triggerDeployment, {});
    expect(deployment.reused).toBe(false);
  });

  it("resets only the DAST workspace", async () => {
    const t = await seeded(setup());
    const deployment = await t.mutation(api.dast.triggerDeployment, {});
    await t.mutation(api.dast.approveInvestigation, { id: deployment.investigationId });
    await t.mutation(api.dast.executeInvestigation, { id: deployment.investigationId });
    const reset = await t.mutation(api.dast.resetLab, {});
    expect(reset.reset).toBe(true);
    expect(await t.query(api.dast.bootstrap, {})).toBeNull();
    expect(await t.query(api.dast.findings, {})).toEqual([]);
    const audit = await t.query(api.dast.auditLog, {});
    expect(audit.some((event) => event.type === "lab.reset")).toBe(true);
  });
});
