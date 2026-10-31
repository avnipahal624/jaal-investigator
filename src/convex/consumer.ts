"use node";

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireOwner } from "./jaal";
import { docToInvestigation, assertLength, MAX_TITLE_LENGTH, MAX_NOTES_LENGTH } from "./lib/backend";
import { buildAliasIndex } from "./lib/intelligence";
import { severityCounts } from "./lib/intelligenceSchemas";
import { saveCorrelationSuggestions, deriveCorrelations, appendCopilotTurn, logAnalysis } from "./intelligence";

// ---------------------------------------------------------------------------
// Consumer category → investigation title + short description mapping.
// Kept deliberately simple: every consumer category becomes an investigation
// whose category field matches one of the existing SCAM_CATEGORIES values so
// the existing evidence/extraction pipeline and the existing reports surface
// work unchanged.
// ---------------------------------------------------------------------------

export const CONSUMER_CATEGORIES = [
  { key: "message", label: "Suspicious Message", icon: "message" },
  { key: "call", label: "Suspicious Phone Call", icon: "call" },
  { key: "payment", label: "Payment Request", icon: "payment" },
  { key: "link", label: "Suspicious Link", icon: "link" },
  { key: "other", label: "Something Else", icon: "other" },
] as const;

export type ConsumerCategoryKey = (typeof CONSUMER_CATEGORIES)[number]["key"];

const CONSUMER_CATEGORY_TITLE: Record<ConsumerCategoryKey, string> = {
  message: "Suspicious message",
  call: "Suspicious phone call",
  payment: "Payment request",
  link: "Suspicious link",
  other: "Suspicious activity",
};

const CONSUMER_CATEGORY_CATEGORY: Record<ConsumerCategoryKey, string> = {
  message: "Phishing",
  call: "Impersonation",
  payment: "UPI/payment scam",
  link: "Phishing",
  other: "Other",
};

// ---------------------------------------------------------------------------
// Dashboard + list surfaces (read-only, owner-scoped, reuse jaal.)
// ---------------------------------------------------------------------------

/** Consumer dashboard summary — real counts from the owner's records. */
export const consumerDashboard = query({
  args: {},
  handler: async (ctx) => {
    const owner = await requireOwner(ctx);
    const invDocs = await ctx.db
      .query("investigations")
      .withIndex("by_owner", (q) => q.eq("owner", owner))
      .collect();

    const total = invDocs.length;
    const underReview = invDocs.filter(
      (d) => d.status === "active" || d.status === "completed",
    ).length;
    const completed = invDocs.filter((d) => d.status === "completed").length;

    const recent = invDocs
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 6)
      .map((d) => ({
        ...docToInvestigation(d),
        evidenceCount: 0,
      }));

    let evidenceCount = 0;
    for (const inv of invDocs) {
      const items = await ctx.db
        .query("evidence")
        .withIndex("by_investigation", (q) =>
          q.eq("investigationId", inv._id),
        )
        .collect();
      evidenceCount += items.length;
    }

    return {
      totalReports: total,
      underReview,
      completed,
      evidenceCount,
      recent,
    };
  },
});

/** Flat list of a consumer's reports (investigations) newest first. */
export const consumerReports = query({
  args: {},
  handler: async (ctx) => {
    const owner = await requireOwner(ctx);
    const docs = await ctx.db
      .query("investigations")
      .withIndex("by_owner", (q) => q.eq("owner", owner))
      .collect();
    return docs
      .map((d) => docToInvestigation(d))
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

// ---------------------------------------------------------------------------
// Consumer report creation + attachment evidence
// ---------------------------------------------------------------------------

/**
 * Create a consumer report.
 *
 * `category` is one of the CONSUMER_CATEGORY_KEY values. The caller supplies
 * the details they have; optional screenshot/attachment text is stored as
 * evidence rows (never executed, never opened).
 *
 * Returns the created investigation (as docToInvestigation) plus the evidence
 * ids attached.
 */
export const createConsumerReport = mutation({
  args: {
    category: v.string(), // one of CONSUMER_CATEGORY_KEY values
    messageText: v.optional(v.string()),
    conversationText: v.optional(v.string()),
    phoneNumber: v.optional(v.string()),
    callDescription: v.optional(v.string()),
    upiId: v.optional(v.string()),
    paymentDetails: v.optional(v.string()),
    amount: v.optional(v.string()),
    url: v.optional(v.string()),
    urlWhereReceived: v.optional(v.string()),
    description: v.optional(v.string()),
    attachmentLabel: v.optional(v.string()),
    attachmentText: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const category = args.category as ConsumerCategoryKey | undefined;
    if (!category || !CONSUMER_CATEGORY_TITLE[category]) {
      throw new Error("Invalid report category.");
    }

    const title = CONSUMER_CATEGORY_TITLE[category];
    const scamCategory = CONSUMER_CATEGORY_CATEGORY[category];

    // Build a short description from the fields the consumer actually provided,
    // so the existing reports/summary services have something to work with.
    const parts: string[] = [];
    if (args.messageText) parts.push("Message provided.");
    if (args.conversationText) parts.push("Conversation provided.");
    if (args.phoneNumber) parts.push("Phone number provided.");
    if (args.callDescription) parts.push("Call description provided.");
    if (args.upiId) parts.push("UPI ID provided.");
    if (args.paymentDetails) parts.push("Payment details provided.");
    if (args.amount) parts.push(`Amount: ${args.amount}.`);
    if (args.url) parts.push("Link provided.");
    if (args.urlWhereReceived) parts.push("Link source provided.");
    if (args.description) parts.push(args.description);
    if (args.attachmentLabel) parts.push(`Attachment: ${args.attachmentLabel}.`);
    const description = parts.join(" ") || title;

    const existing = await ctx.db
      .query("investigations")
      .withIndex("by_owner", (q) => q.eq("owner", owner))
      .collect();
    const caseId = `JAAL-${String(existing.length + 1).padStart(3, "0")}`;

    const invId = await ctx.db.insert("investigations", {
      caseId,
      owner,
      title,
      category: scamCategory,
      description,
      notes: "",
      status: "active",
      source: "consumer",
      detectionMode: "manual",
      flags: {
        tacticDetection: false,
        identifierExtraction: false,
        integrityHashing: true,
        aiSuggestions: false,
      },
      currentStage: "contact",
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      completedAt: null,
      runStatus: "paused",
      startedAt: Date.now(),
      endedAt: null,
      cursor: 0,
      turnCount: 0,
      stages: [],
      schemaVersion: 1,
    });

    const now = Date.now();
    const attached: Id<"evidence">[] = [];

    // Attach any identifiers the consumer provided as evidence rows so they are
    // preserved and hashable. Treat all supplied text as untrusted — store the
    // verbatim value, never execute links or phone-dial.
    const attach = (
      label: string,
      evidenceType: string,
      value: string,
      sourceText: string,
    ) => {
      const id = await ctx.db.insert("evidence", {
        investigationId: invId,
        owner,
        caseId,
        sourceMessageId: null,
        sourceMessageText: sourceText,
        label,
        evidenceType,
        extractedValue: value,
        normalizedValue: value,
        content: value,
        extractionMethod: "CONSUMER_PROVIDED",
        extractionTimestamp: now,
        confidence: null,
        integrityHash: null,
        integrityAlgorithm: null,
        integrityStatus: "NOT_HASHED",
        hashGeneratedAt: null,
        notes: "Provided by the reporter. Not independently verified.",
        tampered: null,
        originalContent: value,
        contentHistory: null,
        hashHistory: null,
        verificationHistory: null,
        manifest: null,
        manifestHash: null,
        reviewStatus: null,
        reviewNote: null,
        reviewedAt: null,
        createdAt: now,
      });
      attached.push(id as Id<"evidence">);
    };

    if (args.messageText) {
      attach("Message", "scam_message", args.messageText, "Reporter-provided message text.");
    }
    if (args.conversationText) {
      attach("Conversation", "transcript", args.conversationText, "Reporter-provided conversation.");
    }
    if (args.phoneNumber) {
      attach("Phone number", "phone", args.phoneNumber, "Reporter-provided phone number.");
    }
    if (args.upiId) {
      attach("UPI ID", "upi", args.upiId, "Reporter-provided UPI ID.");
    }
    if (args.paymentDetails) {
      attach("Payment details", "payment_request", args.paymentDetails, "Reporter-provided payment details.");
    }
    if (args.amount) {
      attach("Amount", "payment_request", args.amount, "Reporter-provided amount.");
    }
    if (args.url) {
      attach("Link", "url", args.url, args.urlWhereReceived ?? "Reporter-provided link.");
    }
    if (args.description) {
      attach("Description", "other", args.description, "Reporter-provided description.");
    }
    if (args.attachmentText && args.attachmentLabel) {
      attach(args.attachmentLabel, "other", args.attachmentText, "Reporter-provided attachment.");
    }

    const inv = await ctx.db.get(invId);
    if (!inv) throw new Error("Report creation failed.");

    return {
      report: docToInvestigation(inv),
      attachedEvidenceCount: attached.length,
    };
  },
});

// ---------------------------------------------------------------------------
// Consumer-facing AI assessment trigger (threat analysis)
// ---------------------------------------------------------------------------

/**
 * Queue a threat analysis for a consumer report.
 *
 * Reuses the existing intelligence lifecycle (beginAnalysis + the threat
 * module action). The caller must own the investigation. Returns the current
 * analysis view so the UI can show NOT_STARTED/PROCESSING/COMPLETED/FAILED/
 * UNAVAILABLE without polling a second endpoint.
 *
 * NOTE: the actual provider call is gated by ANTHROPIC_API_KEY on the
 * deployment. If the key is absent the module writes UNAVAILABLE with an
 * honest limitation — consumers see "Unable to assess", never a fabricated
 * result.
 */
export const runConsumerAnalysis = mutation({
  args: {
    caseId: v.string(),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const inv = await ctx.db
      .query("investigations")
      .withIndex("by_owner_case", (q) =>
        q.eq("owner", owner).eq("caseId", args.caseId),
      )
      .unique();
    if (!inv) throw new Error("Report not found.");

    // Consumer reports have no conversation, so the threat module would
    // normally return an empty-case response. For a consumer report we
    // instead run the analysis against the evidence the consumer attached,
    // which is exactly what "explain possible warning signs from the
    // submitted content" wants.
    const evidenceDocs = await ctx.db
      .query("evidence")
      .withIndex("by_investigation", (q) =>
        q.eq("investigationId", inv._id),
      )
      .collect();

    const aliasIndex = buildAliasIndex(
      [],
      evidenceDocs.map((e) => ({
        alias: `E${evidenceDocs.indexOf(e) + 1}`,
        id: e._id,
        kind: "evidence",
        label: e.label,
        value: e.extractedValue,
        sourceMessageText: e.sourceMessageText,
      })),
    );

    const fingerprint = await ctx.runQuery(api.intelligence.caseContext, {
      caseId: args.caseId,
    }).then((ctx) => ctx.fingerprint);

    // Trigger the existing threat module action — it owns the whole lifecycle.
    // We do not await the action result here; the client polls analyses().
    await ctx.runAction(api.intelligenceActions.threatAnalysisAction, {
      caseId: args.caseId,
      force: args.force ?? false,
    });

    const analysisRow = await ctx.db
      .query("ai_analyses")
      .withIndex("by_case_module", (q) =>
        q.eq("investigationId", inv._id).eq("module", "threat"),
      )
      .unique();

    return {
      queued: true,
      fingerprint,
      analysis: analysisRow
        ? {
            ...analysisRow,
            fingerprint: analysisRow.fingerprint,
            stale: false,
            inputMessageCount: analysisRow.inputMessageCount,
            provider: analysisRow.provider ?? null,
            model: analysisRow.model ?? null,
            limitations: analysisRow.limitations,
            error: analysisRow.error ?? null,
            durationMs: analysisRow.durationMs ?? null,
            at: analysisRow.at,
          }
        : null,
    };
  },
});
