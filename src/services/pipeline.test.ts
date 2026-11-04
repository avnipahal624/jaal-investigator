import { describe, expect, it } from "vitest";
import {
  advanceStage,
  createStages,
  currentStageId,
  detectStage,
  detectTactics,
  normalizeStages,
} from "./investigationService";
import {
  extractIdentifiers,
  transcriptEvidence,
  verifyEvidenceIntegrity,
} from "./evidenceService";
import { sha256Hex, verifyHash, shortHash } from "@/utils/hash";
import { buildStrategy, classifyIntent, unexploredGoals } from "./strategyService";
import { nextScammerTurn, arcExhausted } from "./simulationService";
import { buildReport } from "./reportService";
import type { ConversationMessage } from "@/types/message";
import type { CaseRuntime, Investigation } from "@/types/investigation";

/** All fixtures are synthetic demo content. */
function scammer(text: string, id = "m1"): ConversationMessage {
  return {
    id,
    caseId: "JAAL-T",
    author: "scammer",
    text,
    timestamp: 1_700_000_000_000,
    source: "SIM-ENGINE",
  };
}
function decoy(text: string, id = "d1"): ConversationMessage {
  return { ...scammer(text, id), author: "decoy", source: "OPERATOR" };
}

describe("tactic detection (rule-based, content-derived)", () => {
  it("detects authority, fear, isolation and payment tactics in scammer text", () => {
    const hits = detectTactics(
      scammer(
        "This is the cyber crime unit. Your Aadhaar-linked parcel contains contraband and a non-bailable warrant has been issued. Stay on this chat and deposit ₹25,000 for verification.",
      ),
    );
    const ids = hits.map((h) => h.tactic);
    expect(ids).toContain("authority_impersonation");
    expect(ids).toContain("fear_threat");
    expect(ids).toContain("isolation");
    expect(ids).toContain("payment_request");
    // Each hit explains itself with the matched text.
    expect(hits.every((h) => h.explanation.includes("matched"))).toBe(true);
  });

  it("never analyzes decoy messages", () => {
    expect(detectTactics(decoy("Pay me ₹100 now, police!"))).toEqual([]);
  });

  it("returns nothing for benign scammer chatter", () => {
    expect(detectTactics(scammer("Hello, are you there?"))).toEqual([]);
  });
});

describe("kill-chain progression", () => {
  it("advances only on content that evidences a stage", () => {
    let stages = createStages();
    const contactMsg = scammer("Good morning, parcel desk here.");
    const contact = detectStage(contactMsg)!;
    expect(contact.stage).toBe("contact");
    stages = normalizeStages(advanceStage(stages, contact, contactMsg, []));
    expect(currentStageId(stages)).toBe("contact");
    // Payment stage still pending — nothing demanded yet.
    expect(stages.find((s) => s.id === "payment")!.status).toBe("pending");

    const payMsg = scammer("Deposit ₹25,000 immediately.");
    const pay = detectStage(payMsg)!;
    expect(pay.stage).toBe("payment");
    stages = normalizeStages(
      advanceStage(stages, pay, payMsg, ["payment_request"]),
    );
    expect(currentStageId(stages)).toBe("payment");
    // Earlier detected stage completes; later stages remain pending.
    expect(stages.find((s) => s.id === "contact")!.status).toBe("completed");
    expect(stages.find((s) => s.id === "exploit")!.status).toBe("pending");
  });

  it("keeps all five frontend stages", () => {
    const stages = createStages();
    expect(stages.map((s) => s.id)).toEqual([
      "contact",
      "authority",
      "fear",
      "payment",
      "exploit",
    ]);
  });
});

describe("identifier extraction", () => {
  it("extracts UPI, phone, URL and payment amounts with validation", () => {
    const drafts = extractIdentifiers(
      scammer(
        "Pay ₹25,000 to jaal.demo@upi or call +91 98765 43210, portal: https://india-post-verify.example",
      ),
    );
    const types = drafts.map((d) => d.type);
    expect(types).toContain("upi");
    expect(types).toContain("phone");
    expect(types).toContain("url");
    expect(types).toContain("payment_request");
    // Each draft references the source text it came from.
    expect(drafts.every((d) => d.content.includes("Source message"))).toBe(true);
  });

  it("does not treat ordinary numbers as phone numbers", () => {
    const drafts = extractIdentifiers(
      scammer("Your reference is 12345 within 15 minutes."),
    );
    expect(drafts.some((d) => d.type === "phone")).toBe(false);
  });

  it("dedupes repeated identifiers within one message", () => {
    const drafts = extractIdentifiers(
      scammer("Send to jaal.demo@upi — again, jaal.demo@upi."),
    );
    expect(drafts.filter((d) => d.type === "upi")).toHaveLength(1);
  });

  it("classifies email addresses separately and never double-labels them as UPI", () => {
    const drafts = extractIdentifiers(
      scammer(
        "Write to support@refunds-portal.com or pay to cyber.verify@jaaldemo.",
      ),
    );
    const emails = drafts.filter((d) => d.type === "email");
    expect(emails).toHaveLength(1);
    expect(emails[0]!.value.toLowerCase()).toBe("support@refunds-portal.com");
    // The VPA handle (no dot-TLD after @) is still extracted as UPI …
    expect(
      drafts.some(
        (d) => d.type === "upi" && d.value.toLowerCase() === "cyber.verify@jaaldemo",
      ),
    ).toBe(true);
    // … and the email address never leaks into the UPI type.
    expect(
      drafts.some(
        (d) => d.type === "upi" && d.value.toLowerCase().includes("refunds-portal"),
      ),
    ).toBe(false);
  });

  it("keeps a bare VPA-shaped handle classified as UPI, not email", () => {
    const drafts = extractIdentifiers(scammer("Refund goes to refunds.desk@jaaldemo only."));
    expect(drafts.some((d) => d.type === "upi" && d.value === "refunds.desk@jaaldemo")).toBe(
      true,
    );
    expect(drafts.some((d) => d.type === "email")).toBe(false);
  });

  it("extracts nothing from decoy messages", () => {
    expect(extractIdentifiers(decoy("Call me on 9876543210 please"))).toEqual([]);
  });
});

describe("identifier extraction — multiple matches, obfuscation, confidence", () => {
  it("finds every distinct indicator of a type in one message (multi-match)", () => {
    const drafts = extractIdentifiers(
      scammer(
        "Pay alpha.qa@okaxis or beta.qa@okaxis, call 9876543210 or 9112233445, portals https://a.example and https://b.example",
      ),
    );
    expect(drafts.filter((d) => d.type === "upi")).toHaveLength(2);
    expect(drafts.filter((d) => d.type === "phone")).toHaveLength(2);
    expect(drafts.filter((d) => d.type === "url")).toHaveLength(2);
    const values = drafts.map((d) => d.value);
    expect(values).toContain("alpha.qa@okaxis");
    expect(values).toContain("9112233445");
  });

  it("detects obfuscated URLs and labels them with the obfuscation method", () => {
    const drafts = extractIdentifiers(
      scammer(
        "Open hxxp://portal.secure-verify.example or type portal[dot]mail[dot]example or https[:]//login.verify-jaal.example now",
      ),
    );
    const urls = drafts.filter((d) => d.type === "url");
    expect(urls).toHaveLength(3);
    expect(
      urls.every((d) => d.method === "RULE_BASED_REGEX:url_obfuscated"),
    ).toBe(true);
    // Obfuscated matches carry a lower heuristic confidence than clean ones.
    expect(Math.max(...urls.map((d) => d.confidence))).toBeLessThan(0.9);
    // Original obfuscated text is preserved verbatim, not normalized away.
    expect(urls.map((d) => d.value)).toContain("hxxp://portal.secure-verify.example");
    expect(urls.map((d) => d.value)).toContain("portal[dot]mail[dot]example");
  });

  it("keeps a clean URL distinct from its obfuscated siblings with higher confidence", () => {
    const drafts = extractIdentifiers(
      scammer("See https://track.india-post.example and hxxp://india-post.example"),
    );
    const urls = drafts.filter((d) => d.type === "url");
    expect(urls).toHaveLength(2);
    const clean = urls.find((d) => d.value.startsWith("https://"))!;
    const obfuscated = urls.find((d) => d.value.startsWith("hxxp"))!;
    expect(clean.method).toBe("RULE_BASED_REGEX:url");
    expect(obfuscated.method).toBe("RULE_BASED_REGEX:url_obfuscated");
    expect(clean.confidence).toBeGreaterThan(obfuscated.confidence);
  });

  it("rejects phone numbers that are short, long, or do not start 6–9", () => {
    expect(
      extractIdentifiers(scammer("Dial 4123456789 for the desk")).some(
        (d) => d.type === "phone",
      ),
    ).toBe(false);
    expect(
      extractIdentifiers(scammer("Dial 98765432101234 for the desk")).some(
        (d) => d.type === "phone",
      ),
    ).toBe(false);
    expect(
      extractIdentifiers(scammer("Dial 9876543210 for the desk")).filter(
        (d) => d.type === "phone",
      ),
    ).toHaveLength(1);
  });

  it("every draft carries a detection method, confidence and its source text", () => {
    const drafts = extractIdentifiers(
      scammer("Pay ₹500 to scams.demo@okhdfc and read https://x.example"),
    );
    expect(drafts.length).toBeGreaterThanOrEqual(3);
    for (const d of drafts) {
      expect(d.method).toMatch(/^RULE_BASED_REGEX:/);
      expect(d.confidence).toBeGreaterThan(0);
      expect(d.confidence).toBeLessThanOrEqual(1);
      expect(d.content).toContain("Source message");
      expect(d.content).toContain("Pay ₹500");
    }
  });
});

describe("SHA-256 integrity", () => {
  it("matches the canonical SHA-256 test vector", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("verifies matching content and rejects altered content", async () => {
    const content = "Payment request: ₹25,000\nSource message: deposit now";
    const hash = await sha256Hex(content);
    expect(await verifyHash(content, hash)).toBe(true);
    expect(await verifyHash(content + " tampered", hash)).toBe(false);
    expect(shortHash(hash)).toBe(hash.slice(0, 10) + "…" + hash.slice(-4));
  });

  it("verifyEvidenceIntegrity reports tampered snapshots", async () => {
    const original = await sha256Hex("original content");
    const item = {
      id: "ev-1",
      caseId: "JAAL-T",
      type: "payment_request" as const,
      label: "Payment request",
      value: "₹25,000",
      content: "altered content",
      sourceMessageId: null,
      sourceMessageText: "deposit now",
      extractedAt: 0,
      notes: "",
      hash: original,
      hashGeneratedAt: 0,
      hashStatus: "generated" as const,
    };
    const result = await verifyEvidenceIntegrity(item);
    expect(result.match).toBe(false);
  });
});

describe("investigation strategy", () => {
  function runtimeWith(decoyMessages: ConversationMessage[]): CaseRuntime {
    return {
      caseId: "JAAL-T",
      messages: decoyMessages,
      evidence: [],
      tactics: [],
      stages: createStages(),
      logs: [],
      activities: [],
      cursor: 1,
      turnCount: 1,
      status: "running",
      startedAt: 0,
      endedAt: null,
      typing: false,
      exhausted: false,
    };
  }

  it("suggests the first unexplored knowledge goal", () => {
    const strategy = buildStrategy(runtimeWith([]))!;
    expect(strategy.question.length).toBeGreaterThan(10);
    expect(strategy.reason.length).toBeGreaterThan(10);
    expect(strategy.missing.length).toBeGreaterThan(5);
  });

  it("moves to later goals once earlier ones were pursued", () => {
    const asked = runtimeWith([
      decoy("Which department is issuing this notice?"),
      decoy("What is your official website?"),
      decoy("What is my case reference?"),
      decoy("Why is a payment required?"),
    ]);
    const strategy = buildStrategy(asked)!;
    expect(strategy.question).toMatch(/upi|pay/i);
    expect(unexploredGoals(asked).some((u) => /payment delay/i.test(u))).toBe(
      true,
    );
  });

  it("prefers a backend (Groq-labeled) strategy override when present", () => {
    const rt = runtimeWith([]);
    rt.strategy = {
      objective: "Pin the claimed unit",
      missing: "The inspector's name",
      question: "What is your name and batch number?",
      reason: "Named authority claims are checkable.",
      source: "GROQ",
      approved: false,
    };
    const strategy = buildStrategy(rt)!;
    expect(strategy.question).toContain("batch number");
    expect(strategy.source).toBe("GROQ");
  });

  it("classifies intent from tactics without inventing confidence", () => {
    expect(classifyIntent(["payment_request"], null)).toBe("PAYMENT PRESSURE");
    expect(classifyIntent(["authority_impersonation"], null)).toBe(
      "AUTHORITY CLAIM",
    );
    expect(classifyIntent([], "fear")).toBe("FEAR / THREAT");
  });
});

describe("simulation engine", () => {
  it("answers contextual decoy questions from scripted branches", () => {
    const upi = nextScammerTurn("Which UPI ID should I pay?", 2, 2);
    expect(upi.branch).toBeTruthy();
    expect(upi.text.length).toBeGreaterThan(10);
    expect(upi.exhausted).toBe(false);
  });

  it("reports exhaustion when the arc and branches are consumed", () => {
    const done = nextScammerTurn("", 999, 999);
    expect(done.exhausted).toBe(true);
    expect(arcExhausted(999)).toBe(true);
    expect(arcExhausted(1)).toBe(false);
  });
});

describe("report generation", () => {
  it("builds the report from stored session data and marks it simulated", () => {
    const now = Date.now();
    const inv: Investigation = {
      id: "JAAL-T",
      title: "Digital Arrest Scam — Parcel Flag",
      category: "Digital arrest scam",
      description: "Synthetic test case",
      notes: "n",
      status: "completed",
      createdAt: now - 60_000,
      lastActivityAt: now,
      currentStage: "payment",
      source: "simulation",
      detectionMode: "simulation",
      flags: {
        tacticDetection: true,
        identifierExtraction: true,
        integrityHashing: true,
        aiSuggestions: true,
      },
    };
    const runtime: CaseRuntime = {
      caseId: "JAAL-T",
      messages: [
        scammer("Parcel flagged. Deposit ₹25,000 for verification.", "m1"),
        decoy("Why is a payment required?", "d1"),
      ],
      evidence: [],
      tactics: [],
      stages: createStages(),
      logs: [],
      activities: [],
      cursor: 1,
      turnCount: 2,
      status: "completed",
      startedAt: now - 60_000,
      endedAt: now,
      typing: false,
      exhausted: true,
    };
    const report = buildReport(inv, runtime, "Test operator");
    expect(report.simulated).toBe(true);
    expect(report.caseId).toBe("JAAL-T");
    expect(report.transcript).toHaveLength(2);
    expect(report.stages).toHaveLength(5);
    expect(report.summary.scenario.length).toBeGreaterThan(10);
    // Unknowns are stated, never fabricated.
    expect(Array.isArray(report.unknowns)).toBe(true);
  });
});

describe("transcript evidence", () => {
  it("serializes imported messages deterministically", () => {
    const draft = transcriptEvidence("JAAL-T", [
      scammer("First line", "a"),
      decoy("Second line", "b"),
    ]);
    expect(draft.type).toBe("transcript");
    expect(draft.content).toContain("SCAMMER: First line");
    expect(draft.content).toContain("DECOY: Second line");
  });
});
