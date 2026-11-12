import { describe, expect, it } from "vitest";
import { dispatchLabRequest, type LabState } from "./lab";
import {
  definitionFor,
  runDastTest,
  TEST_CATALOG,
  validateScope,
  type DastTestKey,
} from "./engine";

const TARGET = {
  baseUrl: "https://lab.jaal.internal",
  allowedHosts: ["lab.jaal.internal"],
  allowedPaths: ["/api/"],
};

describe("synthetic travel lab", () => {
  it("rejects unauthenticated booking reads in the fixed configuration", () => {
    const response = dispatchLabRequest(
      "FIXED",
      { method: "GET", path: "/api/bookings/BK-A-1001" },
      { refunds: [] },
      1,
    );
    expect(response.status).toBe(401);
    expect(response.body.travellerName).toBeUndefined();
  });

  it("returns synthetic data while labelling the transport", () => {
    const response = dispatchLabRequest(
      "VULNERABLE",
      { method: "GET", path: "/api/bookings/BK-A-1001", actor: "agency-b-admin" },
      { refunds: [] },
      1,
    );
    expect(response.status).toBe(200);
    expect(response.body.agencyId).toBe("AG-A");
    expect(response.body._lab).toBe("JAAL_SYNTHETIC_TRAVEL_LAB");
    expect(response.transport).toBe("IN_PROCESS_LAB");
  });

  it("does not create a second refund for a replayed idempotency key when fixed", () => {
    const state: LabState = { refunds: [] };
    const body = {
      bookingId: "BK-A-1001",
      amount: 48_200,
      idempotencyKey: "same-key",
    };
    const first = dispatchLabRequest(
      "FIXED",
      { method: "POST", path: "/api/refunds", actor: "agency-a-admin", body },
      state,
      1,
    );
    const replay = dispatchLabRequest(
      "FIXED",
      { method: "POST", path: "/api/refunds", actor: "agency-a-admin", body },
      state,
      2,
    );
    expect(first.status).toBe(201);
    expect(replay.status).toBe(200);
    expect(replay.body.refundId).toBe(first.body.refundId);
    expect(state.refunds).toHaveLength(1);
  });
});

describe("deterministic verification", () => {
  it("verifies every planted vulnerability only in the vulnerable configuration", () => {
    for (const test of TEST_CATALOG) {
      const vulnerable = runDastTest(test.key, "VULNERABLE");
      expect(vulnerable.controlPassed, `${test.key} control`).toBe(true);
      expect(vulnerable.violated, `${test.key} vulnerable`).toBe(true);
      expect(vulnerable.verificationStatus, `${test.key} verified`).toBe("VERIFIED");
    }
  });

  it("rejects every candidate after the lab is fixed", () => {
    for (const test of TEST_CATALOG) {
      const fixed = runDastTest(test.key, "FIXED");
      expect(fixed.controlPassed, `${test.key} control`).toBe(true);
      expect(fixed.violated, `${test.key} fixed`).toBe(false);
      expect(fixed.verificationStatus, `${test.key} rejected`).toBe("FALSE_POSITIVE");
    }
  });

  it("records both the control and attack assertions", () => {
    const run = runDastTest("bola-booking", "VULNERABLE");
    expect(run.requests).toHaveLength(2);
    expect(run.requests[0]?.request.actor).toContain("Agency B");
    expect(run.requests[1]?.response.body.agencyId).toBe("AG-A");
    expect(run.evidence.response.body.pnr).toBe("SYN-A1");
    expect(run.confidence).toBeGreaterThan(0.9);
  });

  it("does not verify a candidate whose control fails", () => {
    const run = runDastTest("bola-booking", "FIXED");
    expect(run.controlPassed).toBe(true);
    expect(run.violated).toBe(false);
    expect(run.verificationStatus).not.toBe("VERIFIED");
  });

  it("rejects unknown test keys", () => {
    expect(() => definitionFor("not-a-real-test")).toThrow(/Unsupported test key/);
    expect(() => runDastTest("not-a-real-test" as DastTestKey, "VULNERABLE")).toThrow(
      /Unsupported test key/,
    );
  });
});

describe("target scope enforcement", () => {
  it("accepts only the exact HTTPS host and /api path scope", () => {
    expect(validateScope(TARGET, "GET", "/api/bookings/BK-A-1001", 4).ok).toBe(true);
    expect(validateScope(TARGET, "POST", "/api/refunds", 4).ok).toBe(true);
  });

  it("blocks plaintext, external hosts, metadata addresses and path escapes", () => {
    const http = validateScope(
      { ...TARGET, baseUrl: "http://lab.jaal.internal" },
      "GET",
      "/api/bookings/BK-A-1001",
    );
    expect(http.ok).toBe(false);
    if (!http.ok) expect(http.reason).toMatch(/HTTPS/);

    const external = validateScope(TARGET, "GET", "https://169.254.169.254/latest/meta-data");
    expect(external.ok).toBe(false);
    if (!external.ok) expect(external.reason).toMatch(/allowlist/);

    const outsidePath = validateScope(TARGET, "GET", "/admin/internal");
    expect(outsidePath.ok).toBe(false);
    if (!outsidePath.ok) expect(outsidePath.reason).toMatch(/path scope/);
  });

  it("rejects destructive methods and invalid request budgets", () => {
    const deleteAttempt = validateScope(TARGET, "DELETE", "/api/bookings/BK-A-1001");
    expect(deleteAttempt.ok).toBe(false);
    if (!deleteAttempt.ok) expect(deleteAttempt.reason).toMatch(/not permitted/);

    const noBudget = validateScope(TARGET, "GET", "/api/health", 0);
    expect(noBudget.ok).toBe(false);

    const excessive = validateScope(TARGET, "GET", "/api/health", 21);
    expect(excessive.ok).toBe(false);
  });

  it("rejects embedded credentials", () => {
    const result = validateScope(
      TARGET,
      "GET",
      "https://user:pass@lab.jaal.internal/api/health",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/Credentials/);
  });
});
