import { describe, expect, it } from "vitest";
import { ANALYSIS_SCHEMA } from "./voiceActions";

/**
 * The voice analysis contract. Anything the model returns must parse against
 * this schema before it can be stored or shown; a malformed or truncated
 * response is discarded, never turned into findings.
 */

function validFinding(overrides: Record<string, unknown> = {}) {
  return {
    tactic: "Bank impersonation",
    category: "BANK_IMPERSONATION",
    excerpt: "I am calling from your bank and your account will be blocked.",
    timestampMs: 1_500,
    explanation: "Caller claims to represent the bank and threatens blocking.",
    confidence: "high",
    severity: "high",
    recommendedAction: "Hang up and call the bank on its official number.",
    observed: true,
    ...overrides,
  };
}

function validAnalysis(overrides: Record<string, unknown> = {}) {
  return {
    overallAssessment: "HIGH_CONCERN",
    summary: "The caller claimed to be from a bank and asked for an OTP.",
    findings: [validFinding()],
    indicators: [
      { type: "phone", value: "+91 98765 43210", context: "caller number" },
    ],
    recommendedSteps: ["Never share an OTP."],
    limitations: ["This is not proof of a crime."],
    ...overrides,
  };
}

describe("ANALYSIS_SCHEMA", () => {
  it("accepts a complete, grounded result", () => {
    expect(ANALYSIS_SCHEMA.safeParse(validAnalysis()).success).toBe(true);
  });

  it("accepts a clean conversation with no findings", () => {
    const clean = validAnalysis({
      overallAssessment: "NO_OBVIOUS_WARNING_SIGNS",
      findings: [],
      indicators: [],
    });
    expect(ANALYSIS_SCHEMA.safeParse(clean).success).toBe(true);
  });

  it("rejects a missing or invalid overall assessment", () => {
    expect(
      ANALYSIS_SCHEMA.safeParse(validAnalysis({ overallAssessment: undefined }))
        .success,
    ).toBe(false);
    expect(
      ANALYSIS_SCHEMA.safeParse(validAnalysis({ overallAssessment: "SCAM" }))
        .success,
    ).toBe(false);
  });

  it("rejects an unknown tactic category", () => {
    expect(
      ANALYSIS_SCHEMA.safeParse(
        validAnalysis({ findings: [validFinding({ category: "WITCHCRAFT" })] }),
      ).success,
    ).toBe(false);
  });

  it("requires the observed flag so quotes and inferences stay distinct", () => {
    expect(
      ANALYSIS_SCHEMA.safeParse(
        validAnalysis({ findings: [validFinding({ observed: "yes" })] }),
      ).success,
    ).toBe(false);
  });

  it("rejects an empty excerpt or explanation", () => {
    expect(
      ANALYSIS_SCHEMA.safeParse(
        validAnalysis({ findings: [validFinding({ excerpt: "" })] }),
      ).success,
    ).toBe(false);
    expect(
      ANALYSIS_SCHEMA.safeParse(
        validAnalysis({ findings: [validFinding({ explanation: "" })] }),
      ).success,
    ).toBe(false);
  });

  it("rejects a truncated object that is missing required keys", () => {
    const truncated = validAnalysis();
    delete (truncated as Record<string, unknown>).recommendedSteps;
    expect(ANALYSIS_SCHEMA.safeParse(truncated).success).toBe(false);
  });

  it("rejects a numeric instead of a string summary", () => {
    expect(
      ANALYSIS_SCHEMA.safeParse(validAnalysis({ summary: 42 })).success,
    ).toBe(false);
  });

  it("caps findings so a runaway response cannot bloat a record", () => {
    const many = validAnalysis({
      findings: Array.from({ length: 41 }, () => validFinding()),
    });
    expect(ANALYSIS_SCHEMA.safeParse(many).success).toBe(false);
  });

  it("treats indicators as objects, never bare strings", () => {
    expect(
      ANALYSIS_SCHEMA.safeParse(
        validAnalysis({ indicators: ["+91 98765 43210"] }),
      ).success,
    ).toBe(false);
  });
});
