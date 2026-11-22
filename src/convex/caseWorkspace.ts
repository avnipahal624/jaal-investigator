import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getOwner } from "./lib/backend";
import {
  normaliseIdempotencyKey,
  validateVoiceUpload,
} from "./voiceIntake";
import { getScenario, scenarioTurn } from "@/data/scenarios";

/**
 * Case-centric projection of the existing JAAL records.
 *
 * This module adds no parallel case store. It reads the same investigations,
 * messages, evidence, tactics, events and voice_recordings rows, and adds only
 * narrow review/action/call state that cannot mutate the source evidence.
 */

async function requireCase(
  ctx: QueryCtx | MutationCtx,
  caseId: string,
): Promise<{ owner: string; inv: Doc<"investigations"> }> {
  const owner = await getOwner(ctx);
  const inv = await ctx.db
    .query("investigations")
    .withIndex("by_owner_case", (q) => q.eq("owner", owner).eq("caseId", caseId))
    .unique();
  if (!inv) throw new Error(`Investigation ${caseId} not found.`);
  return { owner, inv };
}

function provenanceOf(inv: Doc<"investigations">): "USER_PROVIDED" | "SIMULATION" {
  return inv.source === "simulation" ? "SIMULATION" : "USER_PROVIDED";
}

// ---------------------------------------------------------------------------
// Voice recordings attached directly to a case
// ---------------------------------------------------------------------------

export const generateCaseUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await getOwner(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const attachCaseRecording = mutation({
  args: {
    caseId: v.string(),
    storageId: v.string(),
    fileName: v.string(),
    mimeType: v.string(),
    sizeBytes: v.number(),
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
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { owner, inv } = await requireCase(ctx, args.caseId);
    const idempotencyKey = normaliseIdempotencyKey(args.idempotencyKey);
    if (idempotencyKey) {
      const existing = await ctx.db
        .query("voice_recordings")
        .withIndex("by_owner_idempotency", (q) =>
          q.eq("owner", owner).eq("idempotencyKey", idempotencyKey),
        )
        .first();
      if (existing) return { recordingId: existing._id as string, replayed: true };
    }

    const problem = validateVoiceUpload({
      consentAccepted: args.consentAccepted,
      mimeType: args.mimeType,
      sizeBytes: args.sizeBytes,
      fileHash: args.fileHash,
    });
    if (problem) throw new Error(problem);

    const duplicateStorage = await ctx.db
      .query("voice_recordings")
      .withIndex("by_storage", (q) => q.eq("storageId", args.storageId))
      .first();
    if (duplicateStorage) {
      throw new Error("This uploaded file is already attached to a case.");
    }

    const now = Date.now();
    const recordingId = await ctx.db.insert("voice_recordings", {
      investigationId: inv._id,
      owner,
      caseId: inv.caseId,
      storageId: args.storageId,
      fileName: args.fileName.slice(0, 180),
      mimeType: args.mimeType,
      sizeBytes: args.sizeBytes,
      fileHash: args.fileHash.toLowerCase(),
      hashAlgorithm: "SHA-256",
      durationSeconds: args.durationSeconds,
      consentAt: now,
      consentVersion: args.consentVersion.slice(0, 80),
      callerPhone: args.callerPhone?.slice(0, 80),
      claimedIdentity: args.claimedIdentity?.slice(0, 160),
      approximateCallAt: args.approximateCallAt,
      whatHappened: args.whatHappened?.slice(0, 2_000),
      moneyRequested: args.moneyRequested,
      credentialsRequested: args.credentialsRequested,
      moneyTransferredOrShared: args.moneyTransferredOrShared,
      transcription: { status: "NOT_STARTED" },
      analysis: { status: "NOT_STARTED" },
      intakeStatus: "UNDER_REVIEW",
      idempotencyKey,
      linkedInvestigationId: inv._id,
      provenance: provenanceOf(inv),
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(inv._id, { lastActivityAt: now });
    await ctx.db.insert("events", {
      investigationId: inv._id,
      owner,
      caseId: inv.caseId,
      kind: "voice_uploaded",
      title: "Recording added",
      detail: `${args.fileName} · ${args.sizeBytes} bytes · processing queued.`,
      timestamp: now,
    });
    return { recordingId: recordingId as string, replayed: false };
  },
});

export const getCaseVoice = query({
  args: { caseId: v.string() },
  handler: async (ctx, args) => {
    const { owner, inv } = await requireCase(ctx, args.caseId);
    const rows = await ctx.db
      .query("voice_recordings")
      .withIndex("by_investigation", (q) => q.eq("investigationId", inv._id))
      .collect();
    return rows
      .filter((r) => r.owner === owner)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((r) => ({
        _id: r._id as string,
        fileName: r.fileName,
        mimeType: r.mimeType,
        sizeBytes: r.sizeBytes,
        fileHash: r.fileHash,
        hashAlgorithm: r.hashAlgorithm,
        durationSeconds: r.durationSeconds ?? null,
        callerPhone: r.callerPhone ?? null,
        claimedIdentity: r.claimedIdentity ?? null,
        approximateCallAt: r.approximateCallAt ?? null,
        whatHappened: r.whatHappened ?? null,
        moneyRequested: r.moneyRequested ?? null,
        credentialsRequested: r.credentialsRequested ?? null,
        moneyTransferredOrShared: r.moneyTransferredOrShared ?? null,
        transcript: r.transcript ?? null,
        transcriptSegments: (r.transcriptSegments as unknown[] | null) ?? null,
        transcriptSource: r.transcriptSource ?? null,
        transcriptCorrections: (r.transcriptCorrections as unknown[] | null) ?? null,
        transcription: r.transcription,
        analysis: r.analysis,
        findingReviews: (r.findingReviews as Record<string, unknown> | null) ?? null,
        provenance: r.provenance ?? provenanceOf(inv),
        intakeStatus: r.intakeStatus,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }));
  },
});

export const getCaseAudioUrl = query({
  args: { recordingId: v.id("voice_recordings") },
  handler: async (ctx, args) => {
    const owner = await getOwner(ctx);
    const rec = await ctx.db.get(args.recordingId);
    if (!rec || rec.owner !== owner) {
      return { url: null, mimeType: null, fileName: null };
    }
    const url = await ctx.storage.getUrl(rec.storageId);
    return { url, mimeType: rec.mimeType, fileName: rec.fileName };
  },
});

export const reviewCaseFinding = mutation({
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
    const owner = await getOwner(ctx);
    const rec = await ctx.db.get(args.recordingId);
    if (!rec || rec.owner !== owner) throw new Error("Recording not found.");
    const reviews = (rec.findingReviews as Record<string, unknown> | null) ?? {};
    reviews[args.findingId] = {
      verdict: args.verdict,
      note: args.note?.slice(0, 1_000),
      at: Date.now(),
    };
    const now = Date.now();
    await ctx.db.patch(rec._id, { findingReviews: reviews, updatedAt: now });
    await ctx.db.insert("events", {
      investigationId: rec.investigationId,
      owner,
      caseId: rec.caseId,
      kind: "voice_finding_reviewed",
      title: "Voice finding reviewed",
      detail: `${args.findingId} · ${args.verdict}`,
      timestamp: now,
    });
    return { ok: true };
  },
});

export const correctCaseTranscript = mutation({
  args: {
    recordingId: v.id("voice_recordings"),
    segmentIndex: v.optional(v.number()),
    correctedText: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const owner = await getOwner(ctx);
    const rec = await ctx.db.get(args.recordingId);
    if (!rec || rec.owner !== owner) throw new Error("Recording not found.");
    const corrected = args.correctedText.trim();
    if (!corrected) throw new Error("Correction cannot be empty.");
    if (corrected.length > 4_000) throw new Error("Correction is too long.");
    const corrections = (rec.transcriptCorrections as unknown[] | null) ?? [];
    corrections.push({
      segmentIndex: args.segmentIndex,
      original:
        typeof args.segmentIndex === "number"
          ? (rec.transcriptSegments as { text?: string }[] | null)?.[args.segmentIndex]
              ?.text ?? rec.transcript ?? ""
          : rec.transcript ?? "",
      corrected,
      note: args.note?.slice(0, 1_000),
      at: Date.now(),
    });
    await ctx.db.patch(rec._id, {
      transcriptCorrections: corrections,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

// ---------------------------------------------------------------------------
// Actions and the direct questions that branch them
// ---------------------------------------------------------------------------

type ActionRow = {
  actionKey: string;
  title: string;
  reason: string;
  priority: "now" | "soon" | "optional";
  trigger: string;
  status: "not_started" | "done" | "not_applicable";
};

const DEFAULT_ANSWERS = {
  codeShared: false,
  moneySent: false,
  linkOpened: false,
  authorityClaimed: false,
};

export const getCaseActions = query({
  args: { caseId: v.string() },
  handler: async (ctx, args) => {
    const { owner, inv } = await requireCase(ctx, args.caseId);
    const [messages, evidence, tactics, voice, states, answerRow] = await Promise.all([
      ctx.db
        .query("messages")
        .withIndex("by_investigation", (q) => q.eq("investigationId", inv._id))
        .collect(),
      ctx.db
        .query("evidence")
        .withIndex("by_investigation", (q) => q.eq("investigationId", inv._id))
        .collect(),
      ctx.db
        .query("tactics")
        .withIndex("by_investigation", (q) => q.eq("investigationId", inv._id))
        .collect(),
      ctx.db
        .query("voice_recordings")
        .withIndex("by_investigation", (q) => q.eq("investigationId", inv._id))
        .collect(),
      ctx.db
        .query("case_action_states")
        .withIndex("by_investigation", (q) => q.eq("investigationId", inv._id))
        .collect(),
      ctx.db
        .query("case_answers")
        .withIndex("by_investigation", (q) => q.eq("investigationId", inv._id))
        .unique(),
    ]);

    const text = [
      ...messages.filter((m) => m.owner === owner).map((m) => m.content),
      ...voice.filter((r) => r.owner === owner && r.transcript).map((r) => r.transcript!),
    ]
      .join(" ")
      .toLowerCase();
    const tacticSet = new Set(tactics.filter((t) => t.owner === owner).map((t) => t.tactic));
    const evidenceTypes = new Set(
      evidence.filter((e) => e.owner === owner).map((e) => e.evidenceType),
    );
    const answers = answerRow ?? DEFAULT_ANSWERS;
    const stateMap = new Map(states.map((s) => [s.actionKey, s.status]));
    const actions: ActionRow[] = [];
    const add = (row: Omit<ActionRow, "status">) =>
      actions.push({ ...row, status: stateMap.get(row.actionKey) ?? "not_started" });

    const credentials =
      text.includes("otp") ||
      text.includes("one-time code") ||
      text.includes("verification code") ||
      text.includes("password") ||
      voice.some((r) => r.credentialsRequested === true);

    if (credentials) {
      add({
        actionKey: "do-not-share-code",
        title: "Do not share any code or password",
        reason: "The case contains a request for a one-time code, PIN or password.",
        priority: "now",
        trigger: "An OTP/code/password request appears in the evidence.",
      });
    }
    if (answers.codeShared) {
      add({
        actionKey: "secure-account",
        title: "Secure the account and change the password",
        reason: "You reported that a code or password was already shared.",
        priority: "now",
        trigger: "Answer: code or password was shared.",
      });
    }

    const moneyRequested =
      tacticSet.has("payment_request") ||
      evidenceTypes.has("payment_request") ||
      evidenceTypes.has("upi") ||
      text.includes("₹") ||
      text.includes("pay") ||
      voice.some((r) => r.moneyRequested === true);
    if (moneyRequested) {
      add({
        actionKey: "pause-payment",
        title: "Pause the payment",
        reason: "Money was requested before the claim could be independently verified.",
        priority: "now",
        trigger: "A payment request or payment identifier appears in the case.",
      });
      add({
        actionKey: "preserve-payment-details",
        title: "Keep the payment details with the report",
        reason: "The payment handle and the message that requested it belong together.",
        priority: "soon",
        trigger: "A payment request or payment identifier appears in the case.",
      });
    }
    if (answers.moneySent) {
      add({
        actionKey: "contact-bank",
        title: "Contact your bank through its official number",
        reason: "You reported that money was already sent. Ask the bank to trace or freeze the transfer.",
        priority: "now",
        trigger: "Answer: money was sent.",
      });
    }

    if (evidenceTypes.has("url") || text.includes("http")) {
      add({
        actionKey: "do-not-open-link",
        title: "Do not open the link again",
        reason: "A link in the case may lead to a lookalike site. Use the organisation's independently found app or website.",
        priority: "now",
        trigger: "A URL was extracted from the case.",
      });
    }
    if (answers.linkOpened) {
      add({
        actionKey: "monitor-account",
        title: "Check the account for unexpected activity",
        reason: "You reported opening the link. Review recent logins and payments, then change reused passwords.",
        priority: "now",
        trigger: "Answer: the link was opened.",
      });
    }

    if (tacticSet.has("authority_impersonation") || answers.authorityClaimed) {
      add({
        actionKey: "verify-organisation",
        title: "Verify the organisation independently",
        reason: "Someone claimed to represent an organisation. Do not use the contact details in the suspicious message.",
        priority: "now",
        trigger: "Authority/organisation claim in the case.",
      });
    }
    if (tacticSet.has("fear_threat") || inv.category.toLowerCase().includes("blackmail")) {
      add({
        actionKey: "talk-to-someone",
        title: "Pause and talk to someone you trust",
        reason: "The case contains pressure or a threat. You do not have to decide alone.",
        priority: "soon",
        trigger: "Fear, threat or coercion language in the case.",
      });
      add({
        actionKey: "preserve-threat",
        title: "Preserve the threat without engaging further",
        reason: "Keep the messages and recording together. Do not pay to make a threat stop.",
        priority: "soon",
        trigger: "Fear, threat or coercion language in the case.",
      });
    }

    add({
      actionKey: "review-and-report",
      title: "Review the findings and export a report",
      reason: "Only reviewed findings and the source evidence you choose should appear in the report.",
      priority: "optional",
      trigger: "Case review checkpoint.",
    });

    return {
      answers: {
        codeShared: answers.codeShared,
        moneySent: answers.moneySent,
        linkOpened: answers.linkOpened,
        authorityClaimed: answers.authorityClaimed,
      },
      actions,
    };
  },
});

export const setCaseAnswers = mutation({
  args: {
    caseId: v.string(),
    codeShared: v.boolean(),
    moneySent: v.boolean(),
    linkOpened: v.boolean(),
    authorityClaimed: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { owner, inv } = await requireCase(ctx, args.caseId);
    const existing = await ctx.db
      .query("case_answers")
      .withIndex("by_investigation", (q) => q.eq("investigationId", inv._id))
      .unique();
    const now = Date.now();
    const values = {
      codeShared: args.codeShared,
      moneySent: args.moneySent,
      linkOpened: args.linkOpened,
      authorityClaimed: args.authorityClaimed,
      updatedAt: now,
    };
    if (existing) await ctx.db.patch(existing._id, values);
    else
      await ctx.db.insert("case_answers", {
        investigationId: inv._id,
        owner,
        caseId: inv.caseId,
        ...values,
      });
    return { ok: true };
  },
});

export const setCaseActionStatus = mutation({
  args: {
    caseId: v.string(),
    actionKey: v.string(),
    status: v.union(
      v.literal("not_started"),
      v.literal("done"),
      v.literal("not_applicable"),
    ),
  },
  handler: async (ctx, args) => {
    const { owner, inv } = await requireCase(ctx, args.caseId);
    if (!/^[a-z0-9-]{3,80}$/.test(args.actionKey)) {
      throw new Error("Invalid action key.");
    }
    const existing = await ctx.db
      .query("case_action_states")
      .withIndex("by_investigation_action", (q) =>
        q.eq("investigationId", inv._id).eq("actionKey", args.actionKey),
      )
      .unique();
    const now = Date.now();
    if (existing) await ctx.db.patch(existing._id, { status: args.status, updatedAt: now });
    else
      await ctx.db.insert("case_action_states", {
        investigationId: inv._id,
        owner,
        caseId: inv.caseId,
        actionKey: args.actionKey,
        status: args.status,
        updatedAt: now,
      });
    if (args.status === "done") {
      await ctx.db.insert("events", {
        investigationId: inv._id,
        owner,
        caseId: inv.caseId,
        kind: "action_completed",
        title: "Action marked complete",
        detail: args.actionKey.replace(/-/g, " "),
        timestamp: now,
      });
    }
    await ctx.db.patch(inv._id, { lastActivityAt: now });
    return { ok: true };
  },
});

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

export const getCaseTimeline = query({
  args: { caseId: v.string() },
  handler: async (ctx, args) => {
    const { owner, inv } = await requireCase(ctx, args.caseId);
    const [messages, evidence, events, voice, actions] = await Promise.all([
      ctx.db
        .query("messages")
        .withIndex("by_investigation", (q) => q.eq("investigationId", inv._id))
        .collect(),
      ctx.db
        .query("evidence")
        .withIndex("by_investigation", (q) => q.eq("investigationId", inv._id))
        .collect(),
      ctx.db
        .query("events")
        .withIndex("by_investigation", (q) => q.eq("investigationId", inv._id))
        .collect(),
      ctx.db
        .query("voice_recordings")
        .withIndex("by_investigation", (q) => q.eq("investigationId", inv._id))
        .collect(),
      ctx.db
        .query("case_action_states")
        .withIndex("by_investigation", (q) => q.eq("investigationId", inv._id))
        .collect(),
    ]);

    const messageTime = new Map(
      messages.filter((m) => m.owner === owner).map((m) => [m._id as string, m.timestamp]),
    );
    const source = provenanceOf(inv);
    const rows = [];

    for (const message of messages.filter((m) => m.owner === owner && m.sender !== "system")) {
      rows.push({
        id: `message:${message._id}`,
        kind: "message" as const,
        title: `${message.sender === "scammer" ? "Suspicious" : "Decoy"} message #${message.messageNumber}`,
        detail: message.content.slice(0, 240),
        occurredAt: message.timestamp,
        addedAt: message.timestamp,
        timeUnknown: false,
        source,
        reviewStatus: message.status ?? null,
        sourceId: message._id as string,
        messageId: message._id as string,
      });
    }

    for (const e of evidence.filter((row) => row.owner === owner)) {
      const original = e.sourceMessageId ? messageTime.get(e.sourceMessageId) : undefined;
      rows.push({
        id: `evidence:${e._id}`,
        kind: "finding" as const,
        title: e.label,
        detail: `${e.extractedValue} · ${e.integrityStatus.toLowerCase().replace(/_/g, " ")}`,
        occurredAt: original ?? e.extractionTimestamp,
        addedAt: e.extractionTimestamp,
        timeUnknown: original === undefined,
        source,
        reviewStatus: e.reviewStatus ?? "needs_review",
        sourceId: e._id as string,
        messageId: e.sourceMessageId ?? null,
      });
    }

    for (const r of voice.filter((row) => row.owner === owner)) {
      rows.push({
        id: `voice:${r._id}`,
        kind: "audio" as const,
        title: r.fileName,
        detail: r.transcription.status === "COMPLETED" ? "Transcript ready" : `Transcription ${r.transcription.status.toLowerCase()}`,
        occurredAt: r.approximateCallAt ?? r.createdAt,
        addedAt: r.createdAt,
        timeUnknown: r.approximateCallAt === undefined,
        source: r.provenance === "SIMULATION" ? "SIMULATION" as const : "USER_PROVIDED" as const,
        reviewStatus: r.analysis.status,
        sourceId: r._id as string,
        messageId: null,
      });
    }

    for (const event of events.filter((row) => row.owner === owner)) {
      rows.push({
        id: `event:${event._id}`,
        kind: "event" as const,
        title: event.title,
        detail: event.detail,
        occurredAt: event.timestamp,
        addedAt: event.timestamp,
        timeUnknown: false,
        source,
        reviewStatus: null,
        sourceId: event._id as string,
        messageId: null,
      });
    }

    for (const action of actions.filter((row) => row.owner === owner && row.status !== "not_started")) {
      rows.push({
        id: `action:${action._id}`,
        kind: "action" as const,
        title: action.status === "done" ? "Action marked complete" : "Action marked not applicable",
        detail: action.actionKey.replace(/-/g, " "),
        occurredAt: action.updatedAt,
        addedAt: action.updatedAt,
        timeUnknown: false,
        source: "USER_PROVIDED" as const,
        reviewStatus: "done",
        sourceId: action._id as string,
        messageId: null,
      });
    }

    return rows.sort((a, b) => a.occurredAt - b.occurredAt);
  },
});

// ---------------------------------------------------------------------------
// Decoy call simulation (deterministic; no telephony)
// ---------------------------------------------------------------------------

type CallTurn = {
  id: string;
  speaker: "jaal" | "scammer";
  text: string;
  at: number;
  stage?: string;
  reason?: string;
};

const JAAL_QUESTIONS = [
  "Which organisation are you calling from, and what is your reference or badge number?",
  "What exactly do you need from me, and why is it needed now?",
  "Where should a payment go if I decided to proceed? Please give the exact handle.",
  "What is the official website or phone number I can use to verify this independently?",
  "Who else can confirm this case, and what happens if I wait?",
  "Please repeat the claimed identity, payment destination and deadline.",
];

async function loadSession(
  ctx: QueryCtx | MutationCtx,
  sessionId: Id<"call_sessions">,
  owner: string,
) {
  const session = await ctx.db.get(sessionId);
  if (!session || session.owner !== owner) throw new Error("Call session not found.");
  return session;
}

export const getCaseCalls = query({
  args: { caseId: v.string() },
  handler: async (ctx, args) => {
    const { owner, inv } = await requireCase(ctx, args.caseId);
    const rows = await ctx.db
      .query("call_sessions")
      .withIndex("by_investigation", (q) => q.eq("investigationId", inv._id))
      .collect();
    return rows
      .filter((r) => r.owner === owner)
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const createDecoyCall = mutation({
  args: { caseId: v.string(), scenarioKey: v.optional(v.string()), maxTurns: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { owner, inv } = await requireCase(ctx, args.caseId);
    const scenarioKey = args.scenarioKey ?? inv.scenarioKey ?? "digital-arrest";
    const scenario = getScenario(scenarioKey);
    if (!scenario) throw new Error("Unknown simulation scenario.");
    const now = Date.now();
    const sessionId = await ctx.db.insert("call_sessions", {
      investigationId: inv._id,
      owner,
      caseId: inv.caseId,
      mode: "decoy",
      scenarioKey,
      status: "running",
      engine: "DETERMINISTIC",
      maxTurns: Math.min(Math.max(args.maxTurns ?? 5, 2), 8),
      currentTurn: 0,
      turns: [],
      createdAt: now,
      updatedAt: now,
    });
    return { sessionId: sessionId as string };
  },
});

export const advanceDecoyCall = mutation({
  args: { sessionId: v.id("call_sessions") },
  handler: async (ctx, args) => {
    const owner = await getOwner(ctx);
    const session = await loadSession(ctx, args.sessionId, owner);
    if (session.status !== "running") return session;
    if (session.currentTurn >= session.maxTurns) {
      await ctx.db.patch(session._id, {
        status: "ended",
        endedAt: Date.now(),
        updatedAt: Date.now(),
      });
      return await ctx.db.get(session._id);
    }
    const turn = scenarioTurn(session.scenarioKey, session.currentTurn);
    if (!turn) {
      await ctx.db.patch(session._id, {
        status: "ended",
        endedAt: Date.now(),
        updatedAt: Date.now(),
      });
      return await ctx.db.get(session._id);
    }
    const now = Date.now();
    const turns = (session.turns as CallTurn[] | null) ?? [];
    const question = JAAL_QUESTIONS[session.currentTurn % JAAL_QUESTIONS.length]!;
    turns.push({
      id: `call-${session.currentTurn}-jaal`,
      speaker: "jaal",
      text: question,
      at: now,
      reason: "Asking the caller to state a concrete claim that can be checked later.",
    });
    turns.push({
      id: `call-${session.currentTurn}-scammer`,
      speaker: "scammer",
      text: turn.text,
      at: now + 1200,
      stage: turn.stage,
    });
    const nextTurn = session.currentTurn + 1;
    const ended = nextTurn >= session.maxTurns || !scenarioTurn(session.scenarioKey, nextTurn);
    await ctx.db.patch(session._id, {
      turns,
      currentTurn: nextTurn,
      status: ended ? "ended" : "running",
      endedAt: ended ? Date.now() : undefined,
      updatedAt: now,
    });
    return await ctx.db.get(session._id);
  },
});

export const setDecoyCallStatus = mutation({
  args: {
    sessionId: v.id("call_sessions"),
    status: v.union(v.literal("running"), v.literal("paused"), v.literal("ended")),
  },
  handler: async (ctx, args) => {
    const owner = await getOwner(ctx);
    const session = await loadSession(ctx, args.sessionId, owner);
    if (session.status === "ended") return session;
    const now = Date.now();
    await ctx.db.patch(session._id, {
      status: args.status,
      endedAt: args.status === "ended" ? now : undefined,
      updatedAt: now,
    });
    return await ctx.db.get(session._id);
  },
});

// ---------------------------------------------------------------------------
// Reviewed report draft
// ---------------------------------------------------------------------------

export const getCaseReportDraft = query({
  args: { caseId: v.string() },
  handler: async (ctx, args) => {
    const { owner, inv } = await requireCase(ctx, args.caseId);
    const rows = await ctx.db
      .query("reports")
      .withIndex("by_investigation", (q) => q.eq("investigationId", inv._id))
      .collect();
    const report = rows
      .filter((r) => r.owner === owner)
      .sort((a, b) => b.generatedAt - a.generatedAt)[0];
    return report
      ? {
          reportId: report.reportId,
          generatedAt: report.generatedAt,
          reportData: report.reportData,
          simulated: report.simulated,
          draftNarrative: report.draftNarrative ?? null,
          excludedEvidenceIds: report.excludedEvidenceIds ?? [],
          excludedTacticKeys: report.excludedTacticKeys ?? [],
          redactSensitive: report.redactSensitive ?? true,
          reviewedAt: report.reviewedAt ?? null,
        }
      : null;
  },
});

export const updateCaseReportDraft = mutation({
  args: {
    caseId: v.string(),
    reportId: v.string(),
    narrative: v.string(),
    excludedEvidenceIds: v.array(v.string()),
    excludedTacticKeys: v.array(v.string()),
    redactSensitive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { owner, inv } = await requireCase(ctx, args.caseId);
    if (args.narrative.length > 8_000) throw new Error("Report narrative is too long.");
    const rows = await ctx.db
      .query("reports")
      .withIndex("by_investigation", (q) => q.eq("investigationId", inv._id))
      .collect();
    const report = rows.find((r) => r.owner === owner && r.reportId === args.reportId);
    if (!report) throw new Error("Report not found for this case.");
    const now = Date.now();
    await ctx.db.patch(report._id, {
      draftNarrative: args.narrative.trim(),
      excludedEvidenceIds: args.excludedEvidenceIds.slice(0, 300),
      excludedTacticKeys: args.excludedTacticKeys.slice(0, 300),
      redactSensitive: args.redactSensitive,
      reviewedAt: now,
      reviewedBy: owner,
    });
    await ctx.db.patch(inv._id, { lastActivityAt: now });
    await ctx.db.insert("events", {
      investigationId: inv._id,
      owner,
      caseId: inv.caseId,
      kind: "report_reviewed",
      title: "Report draft reviewed",
      detail: "Narrative and export exclusions saved.",
      timestamp: now,
    });
    return { ok: true };
  },
});
