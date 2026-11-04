import { describe, expect, it } from "vitest";
import {
  INDICATOR_ACCENT,
  STATUS_COLOR_CSS,
  STATUS_PAPER,
  STATUS_SCREEN,
  activityColor,
  engineKey,
  indicatorAccent,
  integrityKey,
  reviewKey,
  runStatusKey,
  stageStatusKey,
} from "./status";

/**
 * Guards the exact status-color specification. If any hex drifts from the
 * agreed mapping, these tests fail.
 */

describe("screen palette — exact spec hexes", () => {
  it("investigation status", () => {
    expect(STATUS_SCREEN.inv.active).toEqual({
      text: "#39D6E8",
      bg: "#0B2933",
      border: "#1B8F91",
    });
    expect(STATUS_SCREEN.inv.completed).toEqual({
      text: "#35C99A",
      bg: "#0B2B25",
      border: "#238B69",
    });
    expect(STATUS_SCREEN.inv.archived).toEqual({
      text: "#91A4B2",
      bg: "#17232C",
      border: "#526574",
    });
  });

  it("AI analysis mode", () => {
    expect(STATUS_SCREEN.engine.claude).toEqual({
      text: "#39D6E8",
      bg: "#0B2933",
      border: "#1B8F91",
    });
    expect(STATUS_SCREEN.engine.simulation).toEqual({
      text: "#FFAA45",
      bg: "#302314",
      border: "#A8732C",
    });
    expect(STATUS_SCREEN.engine.error).toEqual({
      text: "#F15B64",
      bg: "#321B20",
      border: "#A83E49",
    });
  });

  it("evidence integrity", () => {
    expect(STATUS_SCREEN.integrity.nothashed).toEqual({
      text: "#91A4B2",
      bg: "#17232C",
      border: "#526574",
    });
    expect(STATUS_SCREEN.integrity.generated).toEqual({
      text: "#FFAA45",
      bg: "#302314",
      border: "#A8732C",
    });
    expect(STATUS_SCREEN.integrity.verified).toEqual({
      text: "#35C99A",
      bg: "#0B2B25",
      border: "#238B69",
    });
    expect(STATUS_SCREEN.integrity.mismatch).toEqual({
      text: "#F15B64",
      bg: "#321B20",
      border: "#A83E49",
    });
  });

  it("kill-chain stage states reuse sanctioned palette colors", () => {
    expect(STATUS_SCREEN.stage.pending).toEqual({
      text: "#91A4B2",
      bg: "#17232C",
      border: "#526574",
    });
    expect(STATUS_SCREEN.stage.active).toEqual({
      text: "#FFAA45",
      bg: "#302314",
      border: "#A8732C",
    });
    expect(STATUS_SCREEN.stage.detected).toEqual({
      text: "#39D6E8",
      bg: "#0B2933",
      border: "#1B8F91",
    });
    expect(STATUS_SCREEN.stage.completed).toEqual({
      text: "#35C99A",
      bg: "#0B2B25",
      border: "#238B69",
    });
  });

  it("run states reuse ACTIVE/COMPLETED semantics", () => {
    expect(STATUS_SCREEN.run.active).toEqual(STATUS_SCREEN.inv.active);
    expect(STATUS_SCREEN.run.completed).toEqual(STATUS_SCREEN.inv.completed);
    expect(STATUS_SCREEN.run.paused.text).toBe("#FFAA45");
  });

  it("analyst review", () => {
    expect(STATUS_SCREEN.review.needsreview).toEqual({
      text: "#FFAA45",
      bg: "#302314",
      border: "#A8732C",
    });
    expect(STATUS_SCREEN.review.confirmed).toEqual({
      text: "#35C99A",
      bg: "#0B2B25",
      border: "#238B69",
    });
    expect(STATUS_SCREEN.review.incorrect).toEqual({
      text: "#F15B64",
      bg: "#321B20",
      border: "#A83E49",
    });
  });
});

describe("paper/print palette — exact spec hexes", () => {
  it("maps every status to its print color", () => {
    expect(STATUS_PAPER.inv).toEqual({
      active: "#1B8F91",
      completed: "#238B69",
      archived: "#526574",
    });
    expect(STATUS_PAPER.engine).toEqual({
      claude: "#1B8F91",
      simulation: "#A8732C",
      error: "#A83E49",
    });
    expect(STATUS_PAPER.integrity).toEqual({
      nothashed: "#526574",
      generated: "#A8732C",
      verified: "#238B69",
      mismatch: "#A83E49",
      tampered: "#A83E49",
    });
    expect(STATUS_PAPER.review).toEqual({
      needsreview: "#A8732C",
      confirmed: "#238B69",
      incorrect: "#A83E49",
    });
  });

  it("paper palette covers exactly the same status keys as the screen palette", () => {
    for (const group of Object.keys(STATUS_SCREEN) as (keyof typeof STATUS_SCREEN)[]) {
      expect(Object.keys(STATUS_PAPER[group]).sort()).toEqual(
        Object.keys(STATUS_SCREEN[group]).sort(),
      );
    }
  });
});

describe("indicator accents — exact spec hexes", () => {
  it("maps every indicator type", () => {
    expect(INDICATOR_ACCENT.phone).toBe("#39D6E8");
    expect(INDICATOR_ACCENT.upi).toBe("#FFAA45");
    expect(INDICATOR_ACCENT.url).toBe("#1B8F91");
    expect(INDICATOR_ACCENT.payment_request).toBe("#D9A441");
    expect(INDICATOR_ACCENT.email).toBe("#6CA6DF");
    expect(INDICATOR_ACCENT.account_id).toBe("#91A4B2");
    expect(INDICATOR_ACCENT.other).toBe("#91A4B2");
  });

  it("falls back to the neutral accent for unknown types", () => {
    expect(indicatorAccent("something_new")).toBe(INDICATOR_ACCENT.other);
  });
});

describe("raw value normalization", () => {
  it("accepts backend and frontend integrity values", () => {
    expect(integrityKey("NOT_HASHED")).toBe("nothashed");
    expect(integrityKey("HASH_MISMATCH")).toBe("mismatch");
    expect(integrityKey("verified")).toBe("verified");
    expect(integrityKey("unknown")).toBe("nothashed");
  });
  it("normalizes review and engine values", () => {
    expect(reviewKey("needs_review")).toBe("needsreview");
    expect(reviewKey(null)).toBeNull();
    expect(engineKey("GROQ")).toBe("claude");
    // Legacy rows written before the provider migration still render as AI.
    expect(engineKey("ANTHROPIC")).toBe("claude");
    expect(engineKey("SIMULATION")).toBe("simulation");
    expect(engineKey("anything")).toBe("simulation");
  });
});

describe("activity feed colors", () => {
  it("follows status semantics per event kind", () => {
    expect(activityColor("hash_generated")).toBe("#FFAA45"); // HASH_GENERATED
    expect(activityColor("integrity_verified")).toBe("#35C99A");
    expect(activityColor("integrity_mismatch")).toBe("#F15B64");
    expect(activityColor("tactic_detected")).toBe("#FFAA45");
    expect(activityColor("case_started")).toBe("#39D6E8");
  });
  it("falls back to neutral for unknown kinds", () => {
    expect(activityColor("something_new")).toBe("#91A4B2");
  });
});

describe("run/stage key normalization", () => {
  it("maps run statuses onto the shared config", () => {
    expect(runStatusKey("running")).toBe("active");
    expect(runStatusKey("paused")).toBe("paused");
    expect(runStatusKey("completed")).toBe("completed");
  });
  it("passes stage statuses through with a neutral fallback", () => {
    expect(stageStatusKey("active")).toBe("active");
    expect(stageStatusKey("detected")).toBe("detected");
    expect(stageStatusKey("bogus")).toBe("pending");
  });
});

describe("emitted CSS", () => {
  it("contains screen vars, paper vars, and print overrides", () => {
    expect(STATUS_COLOR_CSS).toContain("--st-integrity-verified-text:#35C99A");
    expect(STATUS_COLOR_CSS).toContain("--stp-integrity-verified-text:#238B69");
    expect(STATUS_COLOR_CSS).toContain("@media print");
    expect(STATUS_COLOR_CSS).toContain("--st-ind-email:#6CA6DF");
  });
});
