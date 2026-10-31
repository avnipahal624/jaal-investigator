import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getOwner } from "./lib/backend";
import {
  docToInvestigation,
} from "./lib/backend";

// ---------------------------------------------------------------------------
// Consumer category → investigation title + short description mapping.
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
    const owner = await getOwner(ctx);
    const invDocs = await ctx.db
      .query("investigations")
      .withIndex("by_owner", (q) => q.eq("owner", owner))
      .collect();

    const total = invDocs.length;
    const underReview = invDocs.filter((d) =>
      d.status === "active" || d.status === "completed",
    ).length;
    const completed = invDocs.filter((d) => d.status === "completed").length;

    const recent = invDocs
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 6)
      .map((d) => ({ ...docToInvestigation(d), evidenceCount: 0 }));

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
    const owner = await getOwner(ctx);
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
 * count attached.
 */
export const createConsumerReport = mutation({
  args: {
    category: v.string(),
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
    const owner = await getOwner(ctx);
    const category = args.category as ConsumerCategoryKey | undefined;
    if (!category || !CONSUMER_CATEGORY_TITLE[category]) {
      throw new Error("Invalid report category.");
    }

    const title = CONSUMER_CATEGORY_TITLE[category];
    const scamCategory = CONSUMER_CATEGORY_CATEGORY[category];

    // Build a short description from the fields the consumer actually provided.
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

    const now = Date.now();

    const invId = await ctx.db.insert("investigations", {
      caseId,
      owner,
      title,
      category: scamCategory,
      description,
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
      completedAt: undefined,
      runStatus: "paused",
      startedAt: now,
      endedAt: undefined,
      cursor: 0,
      turnCount: 0,
      stages: undefined as undefined,
      schemaVersion: 1,
    });

    const attached: Id<"evidence">[] = [];

    // Attach any identifiers the consumer provided as evidence rows so they are
    // preserved and hashable. Treat all supplied text as untrusted — store the
    // verbatim value, never execute links or phone-dial.
    const attach = async (
      label: string,
      evidenceType: string,
      value: string,
      sourceText: string,
    ) => {
      const id = await ctx.db.insert("evidence", {
        investigationId: invId,
        owner,
        caseId,
        sourceMessageId: undefined,
        sourceMessageText: sourceText,
        label,
        evidenceType,
        extractedValue: value,
        normalizedValue: value,
        content: value,
        extractionMethod: "CONSUMER_PROVIDED",
        extractionTimestamp: now,
        confidence: undefined,
        integrityHash: undefined,
        integrityAlgorithm: undefined,
        integrityStatus: "NOT_HASHED",
        hashGeneratedAt: undefined,
        notes: "Provided by the reporter. Not independently verified.",
        tampered: undefined,
        originalContent: value,
        contentHistory: undefined,
        hashHistory: undefined,
        verificationHistory: undefined,
        manifest: undefined,
        manifestHash: undefined,
        reviewStatus: undefined,
        reviewNote: undefined,
        reviewedAt: undefined,
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

