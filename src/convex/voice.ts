import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  AI_RATE_MAX,
  AI_RATE_WINDOW_MS,
  assertLength,
  getOwner,
  requireRole,
} from "./lib/backend";
import {
  validateVoiceUpload,
  normaliseIdempotencyKey,
} from "./voiceIntake";

// ---------------------------------------------------------------------------
// Limits + allowed audio formats (enforced server-side regardless of client).
// ---------------------------------------------------------------------------

// Upload limits and the MIME allow-list live in ./voiceIntake (pure, tested).
export { ALLOWED_AUDIO_MIME, MAX_AUDIO_BYTES } from "./voiceIntake";

/** How long one processing run may hold the single-flight lease. */
export const PROCESSING_LEASE_MS = 240_000;
/** At most one heavy voice pipeline per account at a time. */
export const MAX_CONCURRENT_PROCESSING_PER_OWNER = 1;

const MAX_TRANSCRIPT_CHARS = 60_000;

const MAX_CONTEXT_CHARS = 4_000;

export const CONSENT_VERSION = "voice-consent-1";

/** One audio segment with an optional timestamp range (ms) + speaker label. */
type Segment = {
  speaker?: string;
  startMs?: number;
  endMs?: number;
  text: string;
};

type Finding = {
  id: string;
  tactic: string;
  category: string;
  excerpt: string;
  timestampMs?: number;
  explanation: string;
  confidence: "low" | "medium" | "high";
  severity: "low" | "medium" | "high";
  recommendedAction: string;
  /** true = directly observed in the transcript; false = AI interpretation. */
  observed: boolean;
};

/** An identifier quoted in the transcript — extracted text, never verified. */
type Indicator = {
  type:
    | "phone"
    | "url"
    | "upi"
    | "organization"
    | "payment_instruction"
    | "other";
  value: string;
  context?: string;
};

type AnalysisStatus =
  | "NOT_STARTED"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "UNAVAILABLE";

/** Transcription can additionally finish with positive no-speech evidence. */
type TranscriptionState = AnalysisStatus | "NO_SPEECH";

type TranscriptionStatus = TranscriptionState;

// ---------------------------------------------------------------------------
// Shared lookups + access control
// ---------------------------------------------------------------------------

async function loadRecording(
  ctx: QueryCtx | MutationCtx,
  recordingId: Id<"voice_recordings">,
): Promise<Doc<"voice_recordings">> {
  const rec = await ctx.db.get(recordingId);
  if (!rec) throw new Error("Recording not found.");
  return rec;
}

/** Load a recording the CALLER owns (the consumer who uploaded it). */
async function loadOwnedRecording(
  ctx: QueryCtx | MutationCtx,
  recordingId: Id<"voice_recordings">,
): Promise<Doc<"voice_recordings">> {
  const owner = await getOwner(ctx);
  const rec = await loadRecording(ctx, recordingId);
  if (rec.owner !== owner) {
    // Either not found for this caller, or owned by someone else.
    throw new Error("Recording not found for your account.");
  }
  return rec;
}

async function roleOf(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<"users">["role"] | null> {
  const userId = await getAuthUserId(ctx as never);
  if (!userId) return null;
  const user = await ctx.db.get(userId);
  return user?.role ?? null;
}

/** Consumer-safe projection of a recording (never exposes storage internals). */
function toConsumerRecording(rec: Doc<"voice_recordings">) {
  return {
    _id: rec._id as string,
    investigationId: rec.investigationId as string,
    caseId: rec.caseId,
    fileName: rec.fileName,
    mimeType: rec.mimeType,
    sizeBytes: rec.sizeBytes,
    fileHash: rec.fileHash,
    hashAlgorithm: rec.hashAlgorithm,
    durationSeconds: rec.durationSeconds ?? null,
    consentAt: rec.consentAt,
    consentVersion: rec.consentVersion,

    callerPhone: rec.callerPhone ?? null,
    claimedIdentity: rec.claimedIdentity ?? null,
    approximateCallAt: rec.approximateCallAt ?? null,
    whatHappened: rec.whatHappened ?? null,
    moneyRequested: rec.moneyRequested ?? null,
    credentialsRequested: rec.credentialsRequested ?? null,
    moneyTransferredOrShared: rec.moneyTransferredOrShared ?? null,

    transcript: rec.transcript ?? null,
    transcriptSegments: (rec.transcriptSegments as Segment[] | null) ?? null,
    transcriptSource: rec.transcriptSource ?? null,
    transcription: {
      status: rec.transcription.status,
      provider: rec.transcription.provider ?? null,
      language: rec.transcription.language ?? null,
      error: rec.transcription.error ?? null,
      at: rec.transcription.at ?? null,
    },
    analysis: {
      status: rec.analysis.status,
      assessment: rec.analysis.assessment ?? null,
      summary: rec.analysis.summary ?? null,
      findings: (rec.analysis.findings as Finding[] | null) ?? null,
      indicators: (rec.analysis.indicators as Indicator[] | null) ?? null,
      recommendedSteps: rec.analysis.recommendedSteps ?? null,
      limitations: rec.analysis.limitations ?? null,
      provider: rec.analysis.provider ?? null,
      model: rec.analysis.model ?? null,
      error: rec.analysis.error ?? null,
      at: rec.analysis.at ?? null,
    },

    intakeStatus: rec.intakeStatus,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
  };
}

/**
 * Response for a submission that already exists. Returning the ORIGINAL ids
 * means a retried tap, network retry or screen re-entry lands on the same
 * report and the same evidence — never a second report.
 */
async function reportReplay(
  ctx: MutationCtx,
  rec: Doc<"voice_recordings">,
) {
  const inv = await ctx.db.get(rec.investigationId);
  return {
    recordingId: rec._id as string,
    reportId: rec.investigationId as string,
    caseId: rec.caseId,
    report: {
      _id: rec.investigationId as string,
      caseId: rec.caseId,
      category: inv?.category ?? "Voice scam",
      title: inv?.title ?? "Voice call scam",
      status: inv?.status ?? "active",
      createdAt: inv?.createdAt ?? rec.createdAt,
    },
    replayed: true,
  };
}

/** Investigator projection — adds intake/review state + provenance. */
function toInvestigatorRecording(rec: Doc<"voice_recordings">) {
  return {
    ...toConsumerRecording(rec),
    owner: rec.owner,
    linkedInvestigationId: rec.linkedInvestigationId ?? null,
    reviewedBy: rec.reviewedBy ?? null,
    reviewedAt: rec.reviewedAt ?? null,
    findingReviews: (rec.findingReviews as Record<string, unknown> | null) ?? null,
    internalNotes: (rec.internalNotes as unknown[] | null) ?? null,
    infoRequests: (rec.infoRequests as unknown[] | null) ?? null,
  };
}

// ---------------------------------------------------------------------------
// Storage + upload
// ---------------------------------------------------------------------------

/**
 * Produce a short-lived signed upload URL. The client POSTs the file bytes
 * directly to Convex storage; the server never sees them in this call. The
 * returned storageId is passed to `createVoiceReport`.
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, ["consumer"]);
    return await ctx.storage.generateUploadUrl();
  },
});

// ---------------------------------------------------------------------------
// Report + recording creation
// ---------------------------------------------------------------------------

/**
 * Create a consumer Voice Call Scam report and attach the uploaded recording.
 *
 * Preserves the ORIGINAL file (by storageId + SHA-256 computed over the exact
 * uploaded bytes) and records explicit consent. Creates an `investigations`
 * row (the JAAL report, category "Voice scam") plus a `voice_recordings` row
 * that references it — no new report table, full provenance preserved.
 *
 * All context fields are OPTIONAL — the consumer is never forced to supply a
 * phone number or any detail they do not have.
 */
export const createVoiceReport = mutation({
  args: {
    storageId: v.string(),
    fileName: v.string(),
    mimeType: v.string(),
    sizeBytes: v.number(),
    /** SHA-256 (lowercase hex) of the original bytes, computed by the client
     *  over the exact file it uploaded. The processing action re-verifies it
     *  server-side against the stored blob before analysis. */
    fileHash: v.string(),
    durationSeconds: v.optional(v.number()),

    consentAccepted: v.boolean(),
    consentVersion: v.string(),

    callerPhone: v.optional(v.string()),
    claimedIdentity: v.optional(v.string()),
    approximateCallAt: v.optional(v.number()),
    whatHappened: v.optional(v.string()),
    moneyRequested: v.optional(v.boolean()),
    credentialsRequested: v.optional(v.boolean()),
    moneyTransferredOrShared: v.optional(v.boolean()),

    /** Optional self-reported transcript the consumer already has. */
    consumerTranscript: v.optional(v.string()),
    /** Client-generated submission key — makes retries idempotent. */
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const owner = await requireRole(ctx, ["consumer"]);

    // A retried submission returns the report it already created. Checked
    // before validation so a retry with a slightly different payload (e.g. a
    // re-read file size) still resolves to the same report.
    const idempotencyKey = normaliseIdempotencyKey(args.idempotencyKey);
    if (idempotencyKey) {
      const existing = await ctx.db
        .query("voice_recordings")
        .withIndex("by_owner_idempotency", (q) =>
          q.eq("owner", owner).eq("idempotencyKey", idempotencyKey),
        )
        .first();
      if (existing) return await reportReplay(ctx, existing);
    }

    const uploadProblem = validateVoiceUpload(args);
    if (uploadProblem) throw new Error(uploadProblem);
    const mime = args.mimeType.toLowerCase();

    // Re-submitting the same uploaded blob must not create a second report.
    // A storage id that already belongs to another account is rejected: one
    // consumer can never attach (or claim) another consumer's evidence.
    const storageId = args.storageId.trim();
    if (!storageId) throw new Error("The upload reference is missing.");
    const reuse = await ctx.db
      .query("voice_recordings")
      .withIndex("by_storage", (q) => q.eq("storageId", storageId))
      .first();
    if (reuse) {
      if (reuse.owner !== owner) {
        throw new Error("That upload belongs to another account.");
      }
      if (idempotencyKey && !reuse.idempotencyKey) {
        await ctx.db.patch(reuse._id, { idempotencyKey, updatedAt: Date.now() });
      }
      return await reportReplay(ctx, reuse);
    }

    const fileName = assertLength(args.fileName, 200, "File name");
    const whatHappened = args.whatHappened
      ? assertLength(args.whatHappened, MAX_CONTEXT_CHARS, "Description")
      : undefined;
    const claimedIdentity = args.claimedIdentity
      ? assertLength(args.claimedIdentity, 200, "Claimed identity")
      : undefined;
    const callerPhone = args.callerPhone
      ? assertLength(args.callerPhone, 40, "Caller phone")
      : undefined;
    const consumerTranscript = args.consumerTranscript
      ? assertLength(args.consumerTranscript, MAX_TRANSCRIPT_CHARS, "Transcript")
      : undefined;

    // Allocate the human-readable report reference for this consumer.
    const existing = await ctx.db
      .query("investigations")
      .withIndex("by_owner", (q) => q.eq("owner", owner))
      .collect();
    const caseId = `JAAL-${String(existing.length + 1).padStart(3, "0")}`;

    const now = Date.now();

    const contextBits: string[] = [
      `Voice call recording submitted (${fileName}, ${(args.sizeBytes / 1024).toFixed(0)} KB).`,
    ];
    if (callerPhone) contextBits.push(`Caller number (as reported): ${callerPhone}.`);
    if (claimedIdentity) contextBits.push(`Caller claimed to be: ${claimedIdentity}.`);
    if (args.moneyRequested) contextBits.push("Money was requested during the call.");
    if (args.credentialsRequested)
      contextBits.push("OTP, PIN, password or banking details were requested.");
    if (args.moneyTransferredOrShared)
      contextBits.push("The reporter transferred money or shared information.");
    if (whatHappened) contextBits.push(whatHappened);

    const invId = await ctx.db.insert("investigations", {
      caseId,
      owner,
      title: "Voice call scam",
      category: "Voice scam",
      description: contextBits.join(" "),
      notes: "",
      status: "active",
      source: "import",
      detectionMode: "manual",
      flags: {
        tacticDetection: false,
        identifierExtraction: false,
        integrityHashing: true,
        aiSuggestions: false,
      },
      currentStage: "contact",
      createdAt: now,
      lastActivityAt: now,
      runStatus: "paused",
      startedAt: now,
      cursor: 0,
      turnCount: 0,
      stages: undefined,
      schemaVersion: 1,
    });

    const recId = await ctx.db.insert("voice_recordings", {
      investigationId: invId,
      owner,
      caseId,

      storageId,
      fileName,
      mimeType: mime,
      sizeBytes: args.sizeBytes,
      idempotencyKey,
      fileHash: args.fileHash,
      hashAlgorithm: "SHA-256",
      durationSeconds: args.durationSeconds,
      consentAt: now,
      consentVersion: args.consentVersion || CONSENT_VERSION,

      callerPhone,
      claimedIdentity,
      approximateCallAt: args.approximateCallAt,
      whatHappened,
      moneyRequested: args.moneyRequested ?? undefined,
      credentialsRequested: args.credentialsRequested ?? undefined,
      moneyTransferredOrShared: args.moneyTransferredOrShared ?? undefined,

      // If the consumer supplied their own transcript text, record it now and
      // mark its SOURCE honestly. A machine transcript is produced later (or
      // reported UNAVAILABLE) by the processing action.
      transcript: consumerTranscript,
      transcription: consumerTranscript
        ? { status: "COMPLETED" as TranscriptionStatus }
        : { status: "NOT_STARTED" as TranscriptionStatus },
      transcriptSource: consumerTranscript
        ? ("CONSUMER_PROVIDED" as const)
        : undefined,

      analysis: { status: "NOT_STARTED" as AnalysisStatus },

      intakeStatus: "SUBMITTED" as const,

      createdAt: now,
      updatedAt: now,
    });

    return {
      recordingId: recId as string,
      reportId: invId as string,
      caseId,
      report: {
        _id: invId as string,
        caseId,
        category: "Voice scam",
        title: "Voice call scam",
        status: "active" as const,
        createdAt: now,
      },
    };
  },
});

/**
 * Consumer-supplied transcript (optional). Lets someone paste what was said on
 * the call when no speech-to-text provider is configured. It is stored with
 * `transcriptSource: "CONSUMER_PROVIDED"` so it is never mistaken for a machine
 * transcript of the audio.
 */
export const submitConsumerTranscript = mutation({
  args: {
    recordingId: v.id("voice_recordings"),
    transcript: v.string(),
  },
  handler: async (ctx, args) => {
    const rec = await loadOwnedRecording(ctx, args.recordingId);
    if (rec.transcriptSource === "SPEECH_PROVIDER") {
      // Never let a self-report overwrite a real machine transcript.
      throw new Error(
        "A machine transcript already exists for this recording and cannot be replaced.",
      );
    }
    if (rec.transcription.status === "PROCESSING") {
      throw new Error(
        "This recording is still being transcribed. Add your text once it finishes.",
      );
    }
    if (typeof rec.processLeaseUntil === "number" && rec.processLeaseUntil > Date.now()) {
      throw new Error(
        "This recording is still being analysed. Try again in a moment.",
      );
    }
    const transcript = assertLength(
      args.transcript.trim(),
      MAX_TRANSCRIPT_CHARS,
      "Transcript",
    );
    if (!transcript) throw new Error("Transcript text is empty.");
    const now = Date.now();
    await ctx.db.patch(rec._id, {
      transcript,
      transcriptSource: "CONSUMER_PROVIDED",
      // Re-open transcription as complete (self-reported). Any earlier
      // analysis described DIFFERENT text, so it is invalidated rather than
      // left on screen as if it still applied; the action will re-run it.
      transcription: { status: "COMPLETED" as TranscriptionStatus, at: now },
      analysis: { status: "NOT_STARTED" as AnalysisStatus },
      updatedAt: now,
    });
    return { ok: true };
  },
});

// ---------------------------------------------------------------------------
// Processing results (written only by the node action, via internal mutations)
// ---------------------------------------------------------------------------

/** Rate-limit check for one voice AI/processing request per owner. */
export const recordVoiceRequest = internalMutation({
  args: { kind: v.string() },
  handler: async (ctx, args) => {
    const owner = await getOwner(ctx);
    const now = Date.now();
    const cutoff = now - AI_RATE_WINDOW_MS;
    const recent = await ctx.db
      .query("ai_requests")
      .withIndex("by_owner_at", (q) => q.eq("owner", owner).gte("at", cutoff))
      .collect();
    if (recent.length >= AI_RATE_MAX) {
      throw new Error(
        `AI rate limit exceeded — at most ${AI_RATE_MAX} requests per ${AI_RATE_WINDOW_MS / 1000}s.`,
      );
    }
    await ctx.db.insert("ai_requests", {
      owner,
      caseId: "voice",
      kind: args.kind,
      at: now,
    });
    return { allowed: true };
  },
});

/**
 * Owner-scoped read used ONLY by the processing action. Verifies the caller
 * owns the recording before any processing or storage happens — a caller can
 * never transcribe/analyse someone else's audio.
 */
export const internalGetRecording = internalQuery({
  args: { recordingId: v.id("voice_recordings") },
  handler: async (ctx, args) => {
    const rec = await loadOwnedRecording(ctx, args.recordingId);
    return {
      storageId: rec.storageId,
      mimeType: rec.mimeType,
      fileHash: rec.fileHash,
      transcript: rec.transcript ?? null,
      transcriptSource: rec.transcriptSource ?? null,
      transcriptSegments: rec.transcriptSegments ?? null,
      transcriptLanguage: rec.transcription?.language ?? null,
      transcriptionStatus: rec.transcription.status,
      analysisStatus: rec.analysis.status,
      assessment: rec.analysis.assessment ?? null,
      sizeBytes: rec.sizeBytes,
      callerPhone: rec.callerPhone ?? null,
      claimedIdentity: rec.claimedIdentity ?? null,
      moneyRequested: rec.moneyRequested ?? false,
      credentialsRequested: rec.credentialsRequested ?? false,
      whatHappened: rec.whatHappened ?? null,
      owner: rec.owner,
    };
  },
});

/**
 * Acquire the single-flight processing lease.
 *
 * One run per recording AND one heavy voice pipeline per owner. A lease that
 * outlives its action expires, so a retry after an action restart resumes
 * instead of being blocked forever. Stale PROCESSING flags from a killed run
 * are reset here — completed transcripts/analyses are never touched.
 */
export const internalAcquireProcessingLease = internalMutation({
  args: {
    recordingId: v.id("voice_recordings"),
    runId: v.string(),
    leaseMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const rec = await loadOwnedRecording(ctx, args.recordingId);
    const now = Date.now();
    const leaseMs = Math.min(
      Math.max(Math.round(args.leaseMs ?? PROCESSING_LEASE_MS), 30_000),
      600_000,
    );

    if (
      typeof rec.processLeaseUntil === "number" &&
      rec.processLeaseUntil > now
    ) {
      return {
        acquired: false as const,
        reason: "in-progress" as const,
        leaseUntil: rec.processLeaseUntil,
      };
    }

    const siblings = await ctx.db
      .query("voice_recordings")
      .withIndex("by_owner", (q) => q.eq("owner", rec.owner))
      .collect();
    const busy = siblings.find(
      (r) =>
        r._id !== rec._id &&
        typeof r.processLeaseUntil === "number" &&
        r.processLeaseUntil > now,
    );
    if (busy && MAX_CONCURRENT_PROCESSING_PER_OWNER <= 1) {
      return {
        acquired: false as const,
        reason: "owner-busy" as const,
        leaseUntil: busy.processLeaseUntil as number,
      };
    }

    const patch: Record<string, unknown> = {
      processLeaseUntil: now + leaseMs,
      processRunId: args.runId,
      updatedAt: now,
    };
    // Reset only in-flight markers from a run that died mid-flight.
    if (rec.transcription.status === "PROCESSING") {
      patch.transcription = { status: "NOT_STARTED" as TranscriptionStatus };
    }
    if (rec.analysis.status === "PROCESSING") {
      patch.analysis = { status: "NOT_STARTED" as AnalysisStatus };
    }
    await ctx.db.patch(rec._id, patch);
    return {
      acquired: true as const,
      reason: null,
      leaseUntil: now + leaseMs,
    };
  },
});

/** Release the lease, but only for the run that still holds it. */
export const internalReleaseProcessingLease = internalMutation({
  args: { recordingId: v.id("voice_recordings"), runId: v.string() },
  handler: async (ctx, args) => {
    const rec = await ctx.db.get(args.recordingId);
    if (!rec || rec.processRunId !== args.runId) return { released: false };
    await ctx.db.patch(rec._id, {
      processLeaseUntil: undefined,
      processRunId: undefined,
      updatedAt: Date.now(),
    });
    return { released: true };
  },
});

/** Mark a recording as transcribing (optimistic UI). */
export const internalMarkTranscribing = internalMutation({
  args: { recordingId: v.id("voice_recordings"), runId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (args.runId) {
      const rec = await ctx.db.get(args.recordingId);
      if (!rec || rec.processRunId !== args.runId) return;
    }
    await ctx.db.patch(args.recordingId, {
      transcription: { status: "PROCESSING" as TranscriptionStatus },
      updatedAt: Date.now(),
    });
  },
});

/** Store the transcription outcome (honest about provider + failures). */
export const internalSetTranscription = internalMutation({
  args: {
    recordingId: v.id("voice_recordings"),
    status: v.union(
      v.literal("COMPLETED"),
      v.literal("FAILED"),
      v.literal("UNAVAILABLE"),
      v.literal("NO_SPEECH"),
    ),
    provider: v.optional(v.string()),
    language: v.optional(v.string()),
    error: v.optional(v.string()),
    transcript: v.optional(v.string()),
    segments: v.optional(
      v.array(
        v.object({
          speaker: v.optional(v.string()),
          startMs: v.optional(v.number()),
          endMs: v.optional(v.number()),
          text: v.string(),
        }),
      ),
    ),
    runId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.runId) {
      const current = await ctx.db.get(args.recordingId);
      if (!current || current.processRunId !== args.runId) return;
    }
    const now = Date.now();
    const patch: Record<string, unknown> = {
      transcription: {
        status: args.status,
        provider: args.provider,
        language: args.language,
        error: args.error,
        at: now,
      },
      updatedAt: now,
    };
    if (args.status === "COMPLETED") {
      patch.transcript = args.transcript ?? "";
      patch.transcriptSegments = args.segments ?? undefined;
      patch.transcriptSource = "SPEECH_PROVIDER";
    }
    await ctx.db.patch(args.recordingId, patch);
  },
});

/** Mark analysis as processing (optimistic UI). */
export const internalMarkAnalysing = internalMutation({
  args: { recordingId: v.id("voice_recordings"), runId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (args.runId) {
      const rec = await ctx.db.get(args.recordingId);
      if (!rec || rec.processRunId !== args.runId) return;
    }
    await ctx.db.patch(args.recordingId, {
      analysis: { status: "PROCESSING" as AnalysisStatus },
      updatedAt: Date.now(),
    });
  },
});

/** Store the validated AI analysis outcome (never fabricated). */
export const internalSetAnalysis = internalMutation({
  args: {
    recordingId: v.id("voice_recordings"),
    status: v.union(v.literal("COMPLETED"), v.literal("FAILED"), v.literal("UNAVAILABLE")),
    assessment: v.optional(
      v.union(
        v.literal("HIGH_CONCERN"),
        v.literal("WARNING_SIGNS_FOUND"),
        v.literal("NO_OBVIOUS_WARNING_SIGNS"),
        v.literal("UNABLE_TO_ASSESS"),
      ),
    ),
    summary: v.optional(v.string()),
    findings: v.optional(v.any()),
    indicators: v.optional(v.any()),
    recommendedSteps: v.optional(v.array(v.string())),
    limitations: v.optional(v.array(v.string())),
    provider: v.optional(v.string()),
    model: v.optional(v.string()),
    error: v.optional(v.string()),
    runId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.runId) {
      const current = await ctx.db.get(args.recordingId);
      if (!current || current.processRunId !== args.runId) return;
    }
    const now = Date.now();
    await ctx.db.patch(args.recordingId, {
      analysis: {
        status: args.status,
        assessment: args.assessment,
        summary: args.summary,
        findings: args.findings,
        indicators: args.indicators,
        recommendedSteps: args.recommendedSteps,
        limitations: args.limitations,
        provider: args.provider,
        model: args.model,
        error: args.error,
        at: now,
      },
      updatedAt: now,
    });
  },
});

// ---------------------------------------------------------------------------
// Consumer reads
// ---------------------------------------------------------------------------

/** One recording the caller owns — full consumer-safe view. */
export const getVoiceRecording = query({
  args: { recordingId: v.id("voice_recordings") },
  handler: async (ctx, args) => {
    const rec = await loadOwnedRecording(ctx, args.recordingId);
    return toConsumerRecording(rec);
  },
});

/**
 * Self-only list of this account's submitted voice intake recordings, newest
 * first. For consumers — never exposes other accounts' recordings.
 */
export const getConsumerQueue = query({
  args: {},
  handler: async (ctx) => {
    const owner = await getOwner(ctx);
    const rows = await ctx.db
      .query("voice_recordings")
      .withIndex("by_owner", (q) => q.eq("owner", owner))
      .collect();
    const sorted = [...rows].sort((a, b) => b.createdAt - a.createdAt);
    return {
      restricted: false as const,
      rows: sorted.map((r) => ({
        _id: r._id as string,
        caseId: r.caseId,
        fileName: r.fileName,
        sizeBytes: r.sizeBytes,
        durationSeconds: r.durationSeconds ?? null,
        callerPhone: r.callerPhone ?? null,
        claimedIdentity: r.claimedIdentity ?? null,
        intakeStatus: r.intakeStatus,
        assessment: r.analysis.assessment ?? null,
        analysisStatus: r.analysis.status,
        transcriptionStatus: r.transcription.status,
        createdAt: r.createdAt,
      })),
    };
  },
});

/**
 * Temporary signed playback URL for a recording the caller owns. The URL
 * expires quickly; there is no permanent public link to any audio.
 */
export const getAudioUrl = query({
  args: {
    recordingId: v.id("voice_recordings"),
    /** Investigator review path — cross-owner, role-gated. */
    asInvestigator: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (args.asInvestigator) {
      // Access-gated query: RETURN a structured "restricted" result instead of
      // throwing. A thrown error inside a Convex query propagates into React and
      // hard-crashes the page (useQuery never surfaces it as a catchable value),
      // so the UI can render a clean access-denied state instead.
      const role = await roleOf(ctx);
      if (role !== "investigator" && role !== "admin") {
        return { restricted: true as const, url: null, mimeType: null, fileName: null };
      }
      const rec = await ctx.db.get(args.recordingId);
      if (!rec) {
        return { restricted: false as const, url: null, mimeType: null, fileName: null };
      }
      const url = await ctx.storage.getUrl(rec.storageId);
      return { restricted: false as const, url, mimeType: rec.mimeType, fileName: rec.fileName };
    }
    const rec = await loadOwnedRecording(ctx, args.recordingId);
    // Signed storage URL. Convex issues these with a server-managed expiry;
    // there is no permanent public link to any audio.
    const url = await ctx.storage.getUrl(rec.storageId);
    return { restricted: false as const, url, mimeType: rec.mimeType, fileName: rec.fileName };
  },
});

// ---------------------------------------------------------------------------
// Investigator intake queue + review
// ---------------------------------------------------------------------------

/**
 * Cross-consumer intake queue of submitted voice recordings. Visible ONLY to
 * authorised investigator/admin accounts. Each row is a consumer report waiting
 * for review — this is the consumer → investigator bridge.
 */
export const intakeQueue = query({
  args: {},
  handler: async (ctx) => {
    // Access-gated query: RETURN a structured "restricted" result instead of
    // throwing. A thrown error inside a Convex query propagates into React and
    // hard-crashes the page (useQuery never surfaces it as a catchable value),
    // so the UI can render a clean access-denied state instead.
    const role = await roleOf(ctx);
    if (role !== "investigator" && role !== "admin") {
      return { restricted: true as const };
    }
    const rows = await ctx.db.query("voice_recordings").collect();
    const sorted = [...rows].sort((a, b) => b.createdAt - a.createdAt);
    return {
      restricted: false as const,
      rows: sorted.map((r) => ({
        _id: r._id as string,
        caseId: r.caseId,
        fileName: r.fileName,
        sizeBytes: r.sizeBytes,
        durationSeconds: r.durationSeconds ?? null,
        callerPhone: r.callerPhone ?? null,
        claimedIdentity: r.claimedIdentity ?? null,
        intakeStatus: r.intakeStatus,
        assessment: r.analysis.assessment ?? null,
        analysisStatus: r.analysis.status,
        transcriptionStatus: r.transcription.status,
        createdAt: r.createdAt,
      })),
    };
  },
});

/** Full detail for one intake recording (investigator-only). */
export const intakeDetail = query({
  args: { recordingId: v.id("voice_recordings") },
  handler: async (ctx, args) => {
    // Access-gated query: RETURN a structured "restricted" result instead of
    // throwing, so a non-investigator gets a clean access-denied state rather
    // than a hard page crash.
    const role = await roleOf(ctx);
    if (role !== "investigator" && role !== "admin") {
      return { restricted: true as const };
    }
    const rec = await ctx.db.get(args.recordingId);
    return {
      restricted: false as const,
      recording: rec ? toInvestigatorRecording(rec) : null,
    };
  },
});

/** Update intake status (review lifecycle) — investigator-only, audited. */
export const setIntakeStatus = mutation({
  args: {
    recordingId: v.id("voice_recordings"),
    status: v.union(
      v.literal("SUBMITTED"),
      v.literal("UNDER_REVIEW"),
      v.literal("MORE_INFORMATION_NEEDED"),
      v.literal("ACCEPTED"),
      v.literal("CLOSED"),
    ),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, ["investigator"]);
    const rec = await loadRecording(ctx, args.recordingId);
    const identity = await ctx.auth.getUserIdentity();
    const now = Date.now();
    const notes = (rec.internalNotes as unknown[] | null) ?? [];
    if (args.note) {
      notes.push({
        at: now,
        by: identity?.subject ?? "investigator",
        kind: "note",
        text: assertLength(args.note, 1_000, "Note"),
      });
    }
    // Audit every actual transition, even when no note was supplied. This is
    // append-only metadata; the intake row and the evidence are untouched.
    if (rec.intakeStatus !== args.status) {
      notes.push({
        at: now,
        by: identity?.subject ?? "investigator",
        kind: "status",
        text: `${rec.intakeStatus} → ${args.status}`,
        from: rec.intakeStatus,
        to: args.status,
      });
    }
    await ctx.db.patch(rec._id, {
      intakeStatus: args.status,
      reviewedBy: identity?.subject ?? undefined,
      reviewedAt: now,
      internalNotes: notes,
      updatedAt: now,
    });
    return { ok: true };
  },
});

/** Mark one AI finding accepted / rejected / needs-further-review. */
export const reviewFinding = mutation({
  args: {
    recordingId: v.id("voice_recordings"),
    findingId: v.string(),
    verdict: v.union(
      v.literal("accepted"),
      v.literal("rejected"),
      v.literal("needs_further_review"),
    ),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, ["investigator"]);
    const rec = await loadRecording(ctx, args.recordingId);
    const identity = await ctx.auth.getUserIdentity();
    const reviews =
      (rec.findingReviews as Record<string, unknown> | null) ?? {};
    // Stored SEPARATELY from the AI output — the original `analysis.findings`
    // is never overwritten by a reviewer verdict.
    reviews[args.findingId] = {
      verdict: args.verdict,
      note: args.note ? assertLength(args.note, 1_000, "Note") : undefined,
      by: identity?.subject ?? "investigator",
      at: Date.now(),
    };
    await ctx.db.patch(rec._id, {
      findingReviews: reviews,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

/** Add an internal investigation note — investigator-only. */
export const addInternalNote = mutation({
  args: {
    recordingId: v.id("voice_recordings"),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, ["investigator"]);
    const rec = await loadRecording(ctx, args.recordingId);
    const identity = await ctx.auth.getUserIdentity();
    const notes = (rec.internalNotes as unknown[] | null) ?? [];
    notes.push({
      at: Date.now(),
      by: identity?.subject ?? "investigator",
      kind: "note",
      text: assertLength(args.text, 2_000, "Note"),
    });
    await ctx.db.patch(rec._id, {
      internalNotes: notes,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

/** Request more information from the consumer — investigator-only. */
export const requestMoreInfo = mutation({
  args: {
    recordingId: v.id("voice_recordings"),
    question: v.string(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, ["investigator"]);
    const rec = await loadRecording(ctx, args.recordingId);
    const identity = await ctx.auth.getUserIdentity();
    const requests = (rec.infoRequests as unknown[] | null) ?? [];
    requests.push({
      at: Date.now(),
      by: identity?.subject ?? "investigator",
      question: assertLength(args.question, 1_000, "Question"),
      answered: false,
    });
    await ctx.db.patch(rec._id, {
      infoRequests: requests,
      intakeStatus: "MORE_INFORMATION_NEEDED",
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

/**
 * Link an accepted intake recording to an investigation case. The ORIGINAL
 * report ID and evidence provenance are preserved — this only records the
 * investigator's linkage decision on top of the existing report.
 */
export const linkToCase = mutation({
  args: {
    recordingId: v.id("voice_recordings"),
    investigationId: v.id("investigations"),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, ["investigator"]);
    const rec = await loadRecording(ctx, args.recordingId);
    const inv = await ctx.db.get(args.investigationId);
    if (!inv) throw new Error("Target investigation not found.");
    await ctx.db.patch(rec._id, {
      linkedInvestigationId: args.investigationId,
      intakeStatus: "ACCEPTED",
      updatedAt: Date.now(),
    });
    // Record the linkage as an event on the case (provenance, not mutation of
    // the original recording).
    await ctx.db.insert("events", {
      investigationId: args.investigationId,
      owner: inv.owner,
      caseId: inv.caseId,
      kind: "voice_recording_linked",
      title: "Voice recording linked",
      detail: `Recording ${rec.caseId} (${rec.fileName}) linked to this investigation.`,
      timestamp: Date.now(),
    });
    return { ok: true };
  },
});

// ---------------------------------------------------------------------------
// Retention / deletion controls
// ---------------------------------------------------------------------------

/**
 * Consumer data-control: delete their own recording and its stored audio.
 * The investigation report row is kept (status archived) so the report history
 * remains, but the audio bytes and voice metadata are removed.
 */
export const deleteVoiceRecording = mutation({
  args: { recordingId: v.id("voice_recordings") },
  handler: async (ctx, args) => {
    const rec = await loadOwnedRecording(ctx, args.recordingId);
    await ctx.storage.delete(rec.storageId as Id<"_storage">).catch(() => {
      /* file may already be gone */
    });
    await ctx.db.delete(rec._id);
    const inv = await ctx.db.get(rec.investigationId);
    if (inv) {
      await ctx.db.patch(rec.investigationId, {
        status: "archived" as const,
        lastActivityAt: Date.now(),
      });
    }
    return { ok: true };
  },
});
