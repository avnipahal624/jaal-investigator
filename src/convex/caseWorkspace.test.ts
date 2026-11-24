import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";
import type { EvidenceReport } from "@/types/report";
import {
  buildPrintableReportHtml,
  filterReportForExport,
} from "@/services/reportService";

const FLAGS = {
  tacticDetection: true,
  identifierExtraction: true,
  integrityHashing: true,
  aiSuggestions: true,
} as const;

const HASH = "b".repeat(64);

function setup(subject = "case-owner") {
  return convexTest(schema, modules).withIdentity({ subject });
}

async function createCase(
  t: ReturnType<typeof setup>,
  caseId = "JAAL-200",
  source: "simulation" | "import" = "simulation",
) {
  await t.mutation(api.jaal.createInvestigation, {
    caseId,
    title: "Synthetic parcel case",
    category: "Fake parcel/delivery scam",
    scenarioKey: "fake-parcel",
    description: "Controlled synthetic case for case-workspace tests.",
    notes: "No real identifiers.",
    source,
    detectionMode: "simulation",
    flags: { ...FLAGS },
  });
}

async function seedRecording(
  t: ReturnType<typeof setup>,
  overrides: Record<string, unknown> = {},
): Promise<Id<"voice_recordings">> {
  return t.run(async (ctx) => {
    const inv = await ctx.db.query("investigations").first();
    if (!inv) throw new Error("missing case");
    const now = Date.now();
    return ctx.db.insert("voice_recordings", {
      investigationId: inv._id,
      owner: inv.owner,
      caseId: inv.caseId,
      storageId: `storage-${Math.random()}`,
      fileName: "synthetic-parcel-call.mp3",
      mimeType: "audio/mpeg",
      sizeBytes: 2_048,
      fileHash: HASH,
      hashAlgorithm: "SHA-256",
      consentAt: now,
      consentVersion: "voice-consent-1",
      transcription: { status: "COMPLETED", provider: "synthetic-test" },
      analysis: { status: "COMPLETED" },
      intakeStatus: "UNDER_REVIEW",
      linkedInvestigationId: inv._id,
      provenance: "SIMULATION",
      createdAt: now,
      updatedAt: now,
      ...overrides,
    });
  });
}

describe("case voice — ownership and idempotency", () => {
  it("does not expose one owner's recording to another owner", async () => {
    const t = setup("owner-a");
    await createCase(t);
    const recordingId = await seedRecording(t);

    const foreign = t.withIdentity({ subject: "owner-b" });
    await expect(foreign.query(api.caseWorkspace.getCaseVoice, { caseId: "JAAL-200" })).rejects.toThrow(
      /not found/,
    );
    const audio = await foreign.query(api.caseWorkspace.getCaseAudioUrl, { recordingId });
    expect(audio.url).toBeNull();
  });

  it("returns the same recording when the same idempotency key is retried", async () => {
    const t = setup();
    await createCase(t);
    const args = {
      caseId: "JAAL-200",
      storageId: "storage-retry",
      fileName: "retry.mp3",
      mimeType: "audio/mpeg",
      sizeBytes: 1_000,
      fileHash: HASH,
      consentAccepted: true,
      consentVersion: "voice-consent-1",
      idempotencyKey: "submit-once",
    };
    const first = await t.mutation(api.caseWorkspace.attachCaseRecording, args);
    const second = await t.mutation(api.caseWorkspace.attachCaseRecording, args);
    expect(second.recordingId).toBe(first.recordingId);
    expect(second.replayed).toBe(true);
    const rows = await t.run(async (ctx) => ctx.db.query("voice_recordings").collect());
    expect(rows).toHaveLength(1);
  });
});

describe("case voice — honest processing and review", () => {
  it("keeps silent audio free of fabricated transcript and findings", async () => {
    const t = setup();
    await createCase(t);
    await seedRecording(t, {
      transcription: { status: "NO_SPEECH" },
      analysis: { status: "NOT_STARTED" },
      transcript: undefined,
      transcriptSegments: undefined,
    });
    const rows = await t.query(api.caseWorkspace.getCaseVoice, { caseId: "JAAL-200" });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.transcript).toBeNull();
    expect(rows[0]!.analysis.findings).toBeUndefined();
    expect(rows[0]!.transcription.status).toBe("NO_SPEECH");
  });

  it("retains the machine transcript when a human correction is saved", async () => {
    const t = setup();
    await createCase(t);
    const recordingId = await seedRecording(t, {
      transcript: "The parcel is held. Pay 500 rupees.",
      transcriptSource: "SPEECH_PROVIDER",
      transcriptSegments: [{ startMs: 1000, endMs: 4000, text: "The parcel is held." }],
    });
    await t.mutation(api.caseWorkspace.correctCaseTranscript, {
      recordingId,
      segmentIndex: 0,
      correctedText: "The parcel is held at the depot.",
    });
    const rows = await t.query(api.caseWorkspace.getCaseVoice, { caseId: "JAAL-200" });
    expect(rows[0]!.transcript).toBe("The parcel is held. Pay 500 rupees.");
    const corrections = rows[0]!.transcriptCorrections as Array<{ corrected: string; original?: string }>;
    expect(corrections).toHaveLength(1);
    expect(corrections[0]!.corrected).toBe("The parcel is held at the depot.");
    expect(corrections[0]!.original).toBe("The parcel is held.");
  });

  it("stores a dismissed finding as rejected, not accepted evidence", async () => {
    const t = setup();
    await createCase(t);
    const recordingId = await seedRecording(t, {
      analysis: {
        status: "COMPLETED",
        findings: [
          {
            id: "f-1",
            tactic: "Urgency",
            excerpt: "Pay in 15 minutes",
            explanation: "A deadline was used to pressure payment.",
          },
        ],
      },
    });
    await t.mutation(api.caseWorkspace.reviewCaseFinding, {
      recordingId,
      findingId: "f-1",
      verdict: "rejected",
    });
    const rows = await t.query(api.caseWorkspace.getCaseVoice, { caseId: "JAAL-200" });
    const reviews = rows[0]!.findingReviews as Record<string, { verdict: string }>;
    expect(reviews["f-1"]!.verdict).toBe("rejected");
    expect(Object.values(reviews).filter((r) => r.verdict === "accepted")).toHaveLength(0);
  });
});

describe("case timeline, actions and simulation", () => {
  it("marks an unknown call time instead of presenting upload time as the call time", async () => {
    const t = setup();
    await createCase(t);
    await seedRecording(t, { approximateCallAt: undefined });
    const rows = (await t.query(api.caseWorkspace.getCaseTimeline, { caseId: "JAAL-200" })) as Array<{
      kind: string;
      timeUnknown: boolean;
      occurredAt: number;
      addedAt: number;
    }>;
    const audio = rows.find((row) => row.kind === "audio");
    expect(audio).toBeDefined();
    expect(audio!.timeUnknown).toBe(true);
    expect(audio!.addedAt).toBeGreaterThan(0);
  });

  it("does not advance a paused decoy simulation", async () => {
    const t = setup();
    await createCase(t);
    const created = await t.mutation(api.caseWorkspace.createDecoyCall, {
      caseId: "JAAL-200",
      maxTurns: 5,
    });
    const sessionId = created.sessionId as Id<"call_sessions">;
    await t.mutation(api.caseWorkspace.setDecoyCallStatus, { sessionId, status: "paused" });
    await t.mutation(api.caseWorkspace.advanceDecoyCall, { sessionId });
    const sessions = await t.query(api.caseWorkspace.getCaseCalls, { caseId: "JAAL-200" });
    expect(sessions[0]!.status).toBe("paused");
    expect(sessions[0]!.turns).toHaveLength(0);
    expect(sessions[0]!.currentTurn).toBe(0);
  });

  it("records decoy claims, tactics and indicators without adding turns after ending", async () => {
    const t = setup();
    await createCase(t);
    const created = await t.mutation(api.caseWorkspace.createDecoyCall, {
      caseId: "JAAL-200",
      maxTurns: 3,
    });
    const sessionId = created.sessionId as Id<"call_sessions">;
    await t.mutation(api.caseWorkspace.advanceDecoyCall, { sessionId });
    await t.mutation(api.caseWorkspace.advanceDecoyCall, { sessionId });
    const inProgress = await t.query(api.caseWorkspace.getCaseCalls, { caseId: "JAAL-200" });
    const turns = inProgress[0]!.turns as Array<{
      speaker: string;
      text: string;
      claim?: string;
      tactics?: string[];
      indicators?: string[];
    }>;
    const scammerTurns = turns.filter((turn) => turn.speaker === "scammer");
    expect(scammerTurns.some((turn) => (turn.tactics?.length ?? 0) > 0)).toBe(true);
    expect(scammerTurns.some((turn) => turn.indicators?.some((item) => item.startsWith("URL:")))).toBe(true);
    expect(scammerTurns.some((turn) => Boolean(turn.claim))).toBe(true);

    await t.mutation(api.caseWorkspace.advanceDecoyCall, { sessionId });
    const ended = await t.query(api.caseWorkspace.getCaseCalls, { caseId: "JAAL-200" });
    expect(ended[0]!.status).toBe("ended");
    const endedTurns = ended[0]!.turns as Array<{ speaker: string }>;

    await t.mutation(api.caseWorkspace.advanceDecoyCall, { sessionId });
    const afterEnd = await t.query(api.caseWorkspace.getCaseCalls, { caseId: "JAAL-200" });
    expect(afterEnd[0]!.turns).toHaveLength(endedTurns.length);
  });

  it("labels a simulation report as simulated and preserves review exclusions and a note", async () => {
    const t = setup();
    await createCase(t);
    const report = await t.mutation(api.jaal.generateReport, { caseId: "JAAL-200" });
    expect(report.simulated).toBe(true);
    await t.mutation(api.caseWorkspace.updateCaseReportDraft, {
      caseId: "JAAL-200",
      reportId: report.id,
      narrative: "Reviewed narrative.",
      note: "Call time is approximate; the recording was supplied later.",
      excludedEvidenceIds: ["ev-1"],
      excludedTacticKeys: ["urgency:123"],
      redactSensitive: true,
    });
    const draft = await t.query(api.caseWorkspace.getCaseReportDraft, { caseId: "JAAL-200" });
    expect(draft!.simulated).toBe(true);
    expect(draft!.draftNarrative).toBe("Reviewed narrative.");
    expect(draft!.draftNote).toContain("Call time is approximate");
    expect(draft!.excludedEvidenceIds).toEqual(["ev-1"]);
    expect(draft!.redactSensitive).toBe(true);
    expect(draft!.reviewedAt).toBeGreaterThan(0);
  });

  it("returns a source-linked audio timeline event for an accepted finding", async () => {
    const t = setup();
    await createCase(t);
    const recordingId = await seedRecording(t, {
      transcriptSegments: [
        { startMs: 41_000, endMs: 48_000, text: "Pay the release fee now." },
      ],
      analysis: {
        status: "COMPLETED",
        findings: [
          {
            id: "accepted-timeline",
            tactic: "Payment request",
            excerpt: "Pay the release fee now.",
            explanation: "A payment was requested.",
            timestampMs: 42_000,
          },
          {
            id: "rejected-timeline",
            tactic: "Authority claim",
            excerpt: "I am from support.",
            explanation: "An identity was claimed.",
            timestampMs: 10_000,
          },
        ],
      },
    });
    await t.mutation(api.caseWorkspace.reviewCaseFinding, {
      recordingId,
      findingId: "accepted-timeline",
      verdict: "accepted",
    });
    await t.mutation(api.caseWorkspace.reviewCaseFinding, {
      recordingId,
      findingId: "rejected-timeline",
      verdict: "rejected",
    });
    const rows = (await t.query(api.caseWorkspace.getCaseTimeline, {
      caseId: "JAAL-200",
    })) as Array<{
      id: string;
      recordingId?: string;
      audioAtMs?: number;
    }>;
    const audioFinding = rows.find((row) => row.id.startsWith("voice-finding:"));
    expect(audioFinding).toBeDefined();
    expect(audioFinding!.recordingId).toBe(recordingId);
    expect(audioFinding!.audioAtMs).toBe(42_000);
    expect(rows.filter((row) => row.id.startsWith("voice-finding:"))).toHaveLength(1);
  });
});

describe("report includes only reviewed voice findings", () => {
  it("adds accepted findings and omits rejected ones", async () => {
    const t = setup();
    await createCase(t);
    const recordingId = await seedRecording(t, {
      analysis: {
        status: "COMPLETED",
        findings: [
          {
            id: "accepted",
            tactic: "Payment request",
            excerpt: "Pay the release fee today.",
            explanation: "A fee was requested under pressure.",
            timestampMs: 41_000,
          },
          {
            id: "rejected",
            tactic: "Authority claim",
            excerpt: "I am from the delivery company.",
            explanation: "A company identity was claimed.",
          },
        ],
      },
    });
    await t.mutation(api.caseWorkspace.reviewCaseFinding, {
      recordingId,
      findingId: "accepted",
      verdict: "accepted",
    });
    await t.mutation(api.caseWorkspace.reviewCaseFinding, {
      recordingId,
      findingId: "rejected",
      verdict: "rejected",
    });
    const report = await t.mutation(api.jaal.generateReport, { caseId: "JAAL-200" });
    const ids = report.evidence.map((row) => row.id);
    expect(ids.some((id) => id.startsWith("voice:") && id.endsWith(":accepted"))).toBe(true);
    expect(ids.some((id) => id.endsWith(":rejected"))).toBe(false);
    expect(report.summary.moments.some((moment) => moment.label.includes("0:41"))).toBe(true);
  });
});

describe("report export filtering", () => {
  it("excludes sensitive and explicitly removed rows from export by default", () => {
    const report = {
      id: "R-1",
      caseId: "JAAL-200",
      title: "Report",
      category: "Blackmail / coercion",
      generatedAt: 1,
      generatedBy: "tester",
      simulated: true,
      status: "active",
      currentStage: "contact",
      evidenceCount: 3,
      integrity: { collected: 3, hashed: 3, verified: 3, mismatched: 0, unhashed: 0 },
      description: "original",
      summary: { scenario: "original", tactics: "", payment: "", moments: [] },
      unknowns: [],
      transcript: [],
      tactics: [
        {
          tactic: "fear_threat",
          name: "Threat",
          timestamp: 10,
          sourceText: "threat",
          explanation: "threat",
        },
      ],
      stages: [],
      evidence: [
        { id: "safe", type: "url", label: "Link", value: "https://example.test", extractedAt: 1, hash: null, hashStatus: "HASHED", review: { status: null, note: null, reviewedAt: null } },
        { id: "removed", type: "phone", label: "Phone", value: "+910000000000", extractedAt: 2, hash: null, hashStatus: "HASHED", review: { status: null, note: null, reviewedAt: null } },
        { id: "sensitive", type: "note", label: "Intimate photo threat", value: "private photo", extractedAt: 3, hash: null, hashStatus: "HASHED", review: { status: null, note: null, reviewedAt: null } },
      ],
      timeline: [],
      verification: [],
      analystNotes: "",
    } as unknown as EvidenceReport;

    const exported = filterReportForExport(report, {
      narrative: "Reviewed narrative.",
      note: "The original call time is unknown.",
      actionsCompleted: [
        {
          key: "pause-payment",
          title: "Pause the payment",
          reason: "Money was requested before verification.",
          completedAt: 99,
        },
      ],
      excludedEvidenceIds: ["removed"],
      excludedTacticKeys: ["fear_threat:10"],
    });
    expect(exported.summary.scenario).toBe("Reviewed narrative.");
    expect(exported.analystNotes).toContain("The original call time is unknown.");
    expect(exported.actionsCompleted).toHaveLength(1);
    expect(exported.evidence.map((row) => row.id)).toEqual(["safe"]);
    expect(exported.tactics).toHaveLength(0);

    const printable = buildPrintableReportHtml(exported);
    expect(printable).toContain("Reviewed narrative.");
    expect(printable).toContain("The original call time is unknown.");
    expect(printable).toContain("Pause the payment");
    expect(printable).toContain("SIMULATION / DEMONSTRATION CASE");
    expect(printable).not.toContain("private photo");
  });
});
