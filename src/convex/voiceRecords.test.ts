import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";

/**
 * Voice intake: authentication, ownership, idempotent report creation and the
 * single-flight processing lease. All audio is synthetic metadata; no file
 * bytes or provider calls are involved here.
 */

function base() {
  return convexTest(schema, modules);
}
type Base = ReturnType<typeof base>;

async function seedUser(t: Base, role: "consumer" | "investigator") {
  return t.run(async (ctx) => ctx.db.insert("users", { name: role, role }));
}

function signIn(t: Base, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|session-1` });
}

const HASH = "a".repeat(64);

function reportArgs(storageId: string) {
  return {
    storageId,
    fileName: "synthetic-call.mp3",
    mimeType: "audio/mpeg",
    sizeBytes: 1_000,
    fileHash: HASH,
    consentAccepted: true,
    consentVersion: "voice-consent-1",
  };
}

async function storeBlob(t: Base): Promise<string> {
  return t.run(async (ctx) =>
    ctx.storage.store(new Blob([new Uint8Array([1, 2, 3, 4])], { type: "audio/mpeg" })),
  );
}

async function counts(t: Base) {
  return t.run(async (ctx) => ({
    investigations: (await ctx.db.query("investigations").collect()).length,
    recordings: (await ctx.db.query("voice_recordings").collect()).length,
  }));
}

describe("createVoiceReport — authentication and validation", () => {
  it("rejects an unauthenticated caller before any write", async () => {
    const t = base();
    await expect(
      t.mutation(api.voice.createVoiceReport, reportArgs("storage-1")),
    ).rejects.toThrow(/Not authenticated/);
    expect(await counts(t)).toEqual({ investigations: 0, recordings: 0 });
  });

  it("restricts report creation to consumer accounts", async () => {
    const t = base();
    const investigator = await seedUser(t, "investigator");
    const asInvestigator = signIn(t, investigator);

    await expect(
      asInvestigator.mutation(api.voice.createVoiceReport, reportArgs("storage-1")),
    ).rejects.toThrow(/Access restricted to consumer/);
    expect(await counts(t)).toEqual({ investigations: 0, recordings: 0 });
  });

  it("enforces consent, format, size and hash at the server", async () => {
    const t = base();
    const consumer = await seedUser(t, "consumer");
    const asConsumer = signIn(t, consumer);

    await expect(
      asConsumer.mutation(api.voice.createVoiceReport, {
        ...reportArgs("s-consent"),
        consentAccepted: false,
      }),
    ).rejects.toThrow(/Consent is required/);

    await expect(
      asConsumer.mutation(api.voice.createVoiceReport, {
        ...reportArgs("s-format"),
        mimeType: "application/x-msdownload",
      }),
    ).rejects.toThrow(/Unsupported audio format/);

    await expect(
      asConsumer.mutation(api.voice.createVoiceReport, {
        ...reportArgs("s-size"),
        sizeBytes: 25 * 1024 * 1024 + 1,
      }),
    ).rejects.toThrow(/too large/);

    await expect(
      asConsumer.mutation(api.voice.createVoiceReport, {
        ...reportArgs("s-hash"),
        fileHash: "not-a-hash",
      }),
    ).rejects.toThrow(/Invalid file hash/);
  });
});

describe("createVoiceReport — idempotency", () => {
  it("returns the SAME report when the same upload is submitted twice", async () => {
    const t = base();
    const consumer = await seedUser(t, "consumer");
    const asConsumer = signIn(t, consumer);

    const first = await asConsumer.mutation(
      api.voice.createVoiceReport,
      reportArgs("storage-same"),
    );
    const second = await asConsumer.mutation(
      api.voice.createVoiceReport,
      reportArgs("storage-same"),
    );

    expect(second.recordingId).toBe(first.recordingId);
    expect(second.reportId).toBe(first.reportId);
    expect(second.caseId).toBe(first.caseId);
    expect(await counts(t)).toEqual({ investigations: 1, recordings: 1 });
  });

  it("deduplicates a retried tap that uploaded the bytes again", async () => {
    const t = base();
    const consumer = await seedUser(t, "consumer");
    const asConsumer = signIn(t, consumer);

    const first = await asConsumer.mutation(api.voice.createVoiceReport, {
      ...reportArgs("storage-attempt-1"),
      idempotencyKey: "submission-abc123",
    });
    // A retry re-uploads to a fresh storage id but reuses the submission key.
    const second = await asConsumer.mutation(api.voice.createVoiceReport, {
      ...reportArgs("storage-attempt-2"),
      idempotencyKey: "submission-abc123",
    });

    expect(second.recordingId).toBe(first.recordingId);
    expect(second.reportId).toBe(first.reportId);
    expect(await counts(t)).toEqual({ investigations: 1, recordings: 1 });
  });

  it("does not reuse another account's key", async () => {
    const t = base();
    const alice = signIn(t, await seedUser(t, "consumer"));
    const bobId = await seedUser(t, "consumer");
    const bob = signIn(t, bobId);

    const aliceReport = await alice.mutation(api.voice.createVoiceReport, {
      ...reportArgs("storage-alice"),
      idempotencyKey: "shared-key-0001",
    });
    const bobReport = await bob.mutation(api.voice.createVoiceReport, {
      ...reportArgs("storage-bob"),
      idempotencyKey: "shared-key-0001",
    });

    expect(bobReport.reportId).not.toBe(aliceReport.reportId);
    expect(await counts(t)).toEqual({ investigations: 2, recordings: 2 });
  });

  it("refuses to attach a storage id owned by another account", async () => {
    const t = base();
    const alice = signIn(t, await seedUser(t, "consumer"));
    const bob = signIn(t, await seedUser(t, "consumer"));

    await alice.mutation(api.voice.createVoiceReport, reportArgs("storage-x"));
    await expect(
      bob.mutation(api.voice.createVoiceReport, reportArgs("storage-x")),
    ).rejects.toThrow(/another account/);
    expect(await counts(t)).toEqual({ investigations: 1, recordings: 1 });
  });
});

describe("consumer reads — ownership", () => {
  it("shows a recording only to the consumer who owns it", async () => {
    const t = base();
    const owner = signIn(t, await seedUser(t, "consumer"));
    const otherId = await seedUser(t, "consumer");
    const other = signIn(t, otherId);

    const created = await owner.mutation(
      api.voice.createVoiceReport,
      reportArgs("storage-owned"),
    );
    const recordingId = created.recordingId as Id<"voice_recordings">;

    const mine = await owner.query(api.voice.getVoiceRecording, { recordingId });
    expect(mine._id).toBe(recordingId);

    await expect(
      other.query(api.voice.getVoiceRecording, { recordingId }),
    ).rejects.toThrow(/not found for your account/i);

    const otherQueue = await other.query(api.voice.getConsumerQueue, {});
    expect(otherQueue.rows).toHaveLength(0);

    const otherAudio = await other
      .query(api.voice.getAudioUrl, { recordingId })
      .catch(() => "denied");
    expect(otherAudio).toBe("denied");
  });

  it("keeps the investigator queue restricted for consumers", async () => {
    const t = base();
    const consumer = signIn(t, await seedUser(t, "consumer"));
    await consumer.mutation(api.voice.createVoiceReport, reportArgs("storage-q"));

    const queue = await consumer.query(api.voice.intakeQueue, {});
    expect(queue.restricted).toBe(true);

    const detail = await consumer.query(api.voice.getAudioUrl, {
      recordingId: (await consumer.query(api.voice.getConsumerQueue, {})).rows[0]
        ._id as Id<"voice_recordings">,
      asInvestigator: true,
    });
    expect(detail.restricted).toBe(true);
  });

  it("lets an investigator read the intake detail and audio", async () => {
    const t = base();
    const owner = signIn(t, await seedUser(t, "consumer"));
    const created = await owner.mutation(
      api.voice.createVoiceReport,
      reportArgs(await storeBlob(t)),
    );
    const recordingId = created.recordingId as Id<"voice_recordings">;

    const investigator = signIn(t, await seedUser(t, "investigator"));
    const detail = await investigator.query(api.voice.intakeDetail, {
      recordingId,
    });
    expect(detail.restricted).toBe(false);
    if (detail.restricted) throw new Error("unreachable");
    expect(detail.recording?.caseId).toBe(created.caseId);
    expect(detail.recording?.fileHash).toBe(HASH);

    const audio = await investigator.query(api.voice.getAudioUrl, {
      recordingId,
      asInvestigator: true,
    });
    expect(audio.restricted).toBe(false);
  });
});

describe("investigator review transitions", () => {
  it("rejects status changes from a consumer", async () => {
    const t = base();
    const owner = signIn(t, await seedUser(t, "consumer"));
    const created = await owner.mutation(
      api.voice.createVoiceReport,
      reportArgs("storage-review"),
    );

    await expect(
      owner.mutation(api.voice.setIntakeStatus, {
        recordingId: created.recordingId as Id<"voice_recordings">,
        status: "ACCEPTED",
      }),
    ).rejects.toThrow(/investigator/);
  });

  it("records every transition as an append-only audit entry", async () => {
    const t = base();
    const owner = signIn(t, await seedUser(t, "consumer"));
    const created = await owner.mutation(
      api.voice.createVoiceReport,
      reportArgs("storage-audit"),
    );
    const recordingId = created.recordingId as Id<"voice_recordings">;
    const investigator = signIn(t, await seedUser(t, "investigator"));

    await investigator.mutation(api.voice.setIntakeStatus, {
      recordingId,
      status: "UNDER_REVIEW",
    });
    await investigator.mutation(api.voice.setIntakeStatus, {
      recordingId,
      status: "ACCEPTED",
      note: "Evidence matches the reported call.",
    });

    const rec = await t.run(async (ctx) => ctx.db.get(recordingId));
    expect(rec?.intakeStatus).toBe("ACCEPTED");
    const notes = (rec?.internalNotes as { kind: string; text: string }[]) ?? [];
    expect(notes.map((n) => n.text)).toEqual([
      "SUBMITTED → UNDER_REVIEW",
      "Evidence matches the reported call.",
      "UNDER_REVIEW → ACCEPTED",
    ]);
  });

  it("lets an investigator request more information", async () => {
    const t = base();
    const owner = signIn(t, await seedUser(t, "consumer"));
    const created = await owner.mutation(
      api.voice.createVoiceReport,
      reportArgs("storage-more"),
    );
    const recordingId = created.recordingId as Id<"voice_recordings">;
    const investigator = signIn(t, await seedUser(t, "investigator"));

    await investigator.mutation(api.voice.requestMoreInfo, {
      recordingId,
      question: "Which number called you?",
    });
    const rec = await t.run(async (ctx) => ctx.db.get(recordingId));
    expect(rec?.intakeStatus).toBe("MORE_INFORMATION_NEEDED");
    expect((rec?.infoRequests as { question: string }[])[0]?.question).toBe(
      "Which number called you?",
    );
  });
});

describe("submitConsumerTranscript", () => {
  it("labels typed text as consumer-provided and invalidates stale analysis", async () => {
    const t = base();
    const owner = signIn(t, await seedUser(t, "consumer"));
    const created = await owner.mutation(
      api.voice.createVoiceReport,
      reportArgs("storage-text"),
    );
    const recordingId = created.recordingId as Id<"voice_recordings">;

    await t.run(async (ctx) => {
      await ctx.db.patch(recordingId, {
        analysis: {
          status: "COMPLETED",
          assessment: "WARNING_SIGNS_FOUND",
          summary: "Old analysis of different text.",
        },
      });
    });

    await owner.mutation(api.voice.submitConsumerTranscript, {
      recordingId,
      transcript: "They said they were from my bank and asked for an OTP.",
    });

    const rec = await t.run(async (ctx) => ctx.db.get(recordingId));
    expect(rec?.transcriptSource).toBe("CONSUMER_PROVIDED");
    expect(rec?.transcription.status).toBe("COMPLETED");
    expect(rec?.analysis.status).toBe("NOT_STARTED");
    expect(rec?.analysis.summary).toBeUndefined();
  });

  it("never overwrites a machine transcript", async () => {
    const t = base();
    const owner = signIn(t, await seedUser(t, "consumer"));
    const created = await owner.mutation(
      api.voice.createVoiceReport,
      reportArgs("storage-machine"),
    );
    const recordingId = created.recordingId as Id<"voice_recordings">;
    await t.run(async (ctx) => {
      await ctx.db.patch(recordingId, {
        transcript: "Real machine transcript.",
        transcriptSource: "SPEECH_PROVIDER",
      });
    });

    await expect(
      owner.mutation(api.voice.submitConsumerTranscript, {
        recordingId,
        transcript: "Replacement text.",
      }),
    ).rejects.toThrow(/machine transcript/);
  });
});

describe("processing lease", () => {
  async function newRecording(t: Base, owner: ReturnType<typeof signIn>, storageId: string) {
    const created = await owner.mutation(
      api.voice.createVoiceReport,
      reportArgs(storageId),
    );
    return created.recordingId as Id<"voice_recordings">;
  }

  it("allows exactly one run at a time per recording", async () => {
    const t = base();
    const owner = signIn(t, await seedUser(t, "consumer"));
    const recordingId = await newRecording(t, owner, "lease-1");

    const first = await owner.mutation(
      internal.voice.internalAcquireProcessingLease,
      { recordingId, runId: "run-a" },
    );
    expect(first.acquired).toBe(true);

    const second = await owner.mutation(
      internal.voice.internalAcquireProcessingLease,
      { recordingId, runId: "run-b" },
    );
    expect(second.acquired).toBe(false);
    if (second.acquired) throw new Error("unreachable");
    expect(second.reason).toBe("in-progress");

    // A duplicate run cannot release someone else's lease.
    const wrongRelease = await owner.mutation(
      internal.voice.internalReleaseProcessingLease,
      { recordingId, runId: "run-b" },
    );
    expect(wrongRelease.released).toBe(false);

    const release = await owner.mutation(
      internal.voice.internalReleaseProcessingLease,
      { recordingId, runId: "run-a" },
    );
    expect(release.released).toBe(true);
  });

  it("limits an account to one heavy pipeline at a time", async () => {
    const t = base();
    const owner = signIn(t, await seedUser(t, "consumer"));
    const a = await newRecording(t, owner, "lease-a");
    const b = await newRecording(t, owner, "lease-b");

    await owner.mutation(internal.voice.internalAcquireProcessingLease, {
      recordingId: a,
      runId: "run-a",
    });
    const other = await owner.mutation(
      internal.voice.internalAcquireProcessingLease,
      { recordingId: b, runId: "run-b" },
    );
    expect(other.acquired).toBe(false);
    if (other.acquired) throw new Error("unreachable");
    expect(other.reason).toBe("owner-busy");
  });

  it("recovers after an action restart once the lease expires", async () => {
    const t = base();
    const owner = signIn(t, await seedUser(t, "consumer"));
    const recordingId = await newRecording(t, owner, "lease-expired");

    await owner.mutation(internal.voice.internalAcquireProcessingLease, {
      recordingId,
      runId: "dead-run",
    });
    // Simulate a killed action: the lease lapsed, statuses stuck PROCESSING.
    await t.run(async (ctx) => {
      await ctx.db.patch(recordingId, {
        processLeaseUntil: Date.now() - 1,
        transcription: { status: "PROCESSING" },
        analysis: { status: "PROCESSING" },
      });
    });

    const retry = await owner.mutation(
      internal.voice.internalAcquireProcessingLease,
      { recordingId, runId: "run-after-restart" },
    );
    expect(retry.acquired).toBe(true);

    const rec = await t.run(async (ctx) => ctx.db.get(recordingId));
    expect(rec?.transcription.status).toBe("NOT_STARTED");
    expect(rec?.analysis.status).toBe("NOT_STARTED");
    expect(rec?.processRunId).toBe("run-after-restart");
  });

  it("does not let another account take a lease", async () => {
    const t = base();
    const owner = signIn(t, await seedUser(t, "consumer"));
    const other = signIn(t, await seedUser(t, "consumer"));
    const recordingId = await newRecording(t, owner, "lease-foreign");

    await expect(
      other.mutation(internal.voice.internalAcquireProcessingLease, {
        recordingId,
        runId: "intruder",
      }),
    ).rejects.toThrow(/not found for your account/i);
  });
});

describe("deletion", () => {
  it("removes the recording and archives the report for its owner only", async () => {
    const t = base();
    const owner = signIn(t, await seedUser(t, "consumer"));
    const other = signIn(t, await seedUser(t, "consumer"));
    const created = await owner.mutation(
      api.voice.createVoiceReport,
      reportArgs("storage-delete"),
    );
    const recordingId = created.recordingId as Id<"voice_recordings">;

    await expect(
      other.mutation(api.voice.deleteVoiceRecording, { recordingId }),
    ).rejects.toThrow(/not found for your account/i);

    await owner.mutation(api.voice.deleteVoiceRecording, { recordingId });

    const after = await t.run(async (ctx) => ({
      rec: await ctx.db.get(recordingId),
      inv: await ctx.db.get(created.reportId as Id<"investigations">),
    }));
    expect(after.rec).toBeNull();
    expect(after.inv?.status).toBe("archived");
  });
});

/** Guard: the seeded consumer doc really is what the identity resolves to. */
describe("identity resolution", () => {
  it("resolves the authenticated user to the stored owner", async () => {
    const t = base();
    const consumer = await seedUser(t, "consumer");
    const asConsumer = signIn(t, consumer);
    const created = await asConsumer.mutation(
      api.voice.createVoiceReport,
      reportArgs("storage-owner"),
    );
    const rec = await t.run(async (ctx) =>
      ctx.db.get(created.recordingId as Id<"voice_recordings">),
    );
    expect((rec as Doc<"voice_recordings"> | null)?.owner).toBe(consumer);
  });
});
