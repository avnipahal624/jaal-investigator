import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { DatabaseReader } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  getOwner,
  AI_RATE_WINDOW_MS,
  AI_RATE_MAX,
} from "./lib/backend";

export const CONSUMER_ROLE = "consumer";

// ---------------------------------------------------------------------------
// Consumer category → investigation title + scam category mapping.
// ---------------------------------------------------------------------------

export const CONSUMER_CATEGORIES = [
  { key: "message", label: "Suspicious Message", icon: "message" },
  { key: "call", label: "Suspicious Phone Call", icon: "call" },
  { key: "voice", label: "Voice Call Scam", icon: "voice" },
  { key: "payment", label: "Payment Request", icon: "payment" },
  { key: "link", label: "Suspicious Link", icon: "link" },
  { key: "other", label: "Something Else", icon: "other" },
] as const;

export type ConsumerCategoryKey =
  (typeof CONSUMER_CATEGORIES)[number]["key"];

const CONSUMER_CATEGORY_TITLE: Record<ConsumerCategoryKey, string> = {
  message: "Suspicious message",
  call: "Suspicious phone call",
  voice: "Voice call scam",
  payment: "Payment request",
  link: "Suspicious link",
  other: "Suspicious activity",
};

const CONSUMER_CATEGORY_CATEGORY: Record<ConsumerCategoryKey, string> = {
  message: "Phishing",
  call: "Impersonation",
  voice: "Voice scam",
  payment: "UPI/payment scam",
  link: "Phishing",
  other: "Other",
};

/**
 * Consumer-safe view of one report. Exposes only what a reporter should see:
 * reference, category, title, description, submission date, status, evidence
 * count. Never exposes owner, notes, investigator-only fields or internal
 * correlation data.
 */
function toConsumerReport(
  doc: Doc<"investigations">,
  evidenceCount = 0,
) {
  return {
    _id: doc._id as string,
    caseId: doc.caseId,
    category: doc.category,
    title: doc.title,
    description: doc.description,
    createdAt: doc.createdAt,
    lastActivityAt: doc.lastActivityAt,
    status: doc.status,
    evidenceCount,
  };
}

async function countEvidence(
  db: DatabaseReader,
  investigationId: Id<"investigations">,
): Promise<number> {
  const items = await db
    .query("evidence")
    .withIndex("by_investigation", (q) =>
      q.eq("investigationId", investigationId),
    )
    .collect();
  return items.length;
}

// ---------------------------------------------------------------------------
// Dashboard + list surfaces (read-only, owner-scoped, reuse jaal tables).
// ---------------------------------------------------------------------------

/** Consumer dashboard summary — real counts from the owner's records. */
export const consumerDashboard = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || identity.role !== CONSUMER_ROLE) {
      throw new Error("Consumer access restricted to Normal People accounts.");
    }
    const owner = await getOwner(ctx);
    const invDocs = await ctx.db
      .query("investigations")
      .withIndex("by_owner", (q) => q.eq("owner", owner))
      .collect();

    const total = invDocs.length;
    const underReview = invDocs.filter(
      (d) => d.status === "active" || d.status === "completed",
    ).length;
    const completed = invDocs.filter((d) => d.status === "completed").length;

    const sorted = [...invDocs].sort((a, b) => b.createdAt - a.createdAt);
    const recent = await Promise.all(
      sorted.slice(0, 6).map(async (d) => {
        const evidenceCount = await countEvidence(ctx.db, d._id);
        return toConsumerReport(d, evidenceCount);
      }),
    );

    let evidenceCount = 0;
    for (const inv of invDocs) {
      evidenceCount += await countEvidence(ctx.db, inv._id);
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || identity.role !== CONSUMER_ROLE) {
      throw new Error("Consumer access restricted to Normal People accounts.");
    }
    const owner = await getOwner(ctx);
    const docs = await ctx.db
      .query("investigations")
      .withIndex("by_owner", (q) => q.eq("owner", owner))
      .collect();
    const sorted = [...docs].sort((a, b) => b.createdAt - a.createdAt);
    return Promise.all(
      sorted.map(async (d) => {
        const evidenceCount = await countEvidence(ctx.db, d._id);
        return toConsumerReport(d, evidenceCount);
      }),
    );
  },
});

/**
 * Evidence rows attached to a consumer report (owner-scoped).
 *
 * `investigationId` is the Convex document `_id` of the investigation. We load
 * the doc directly and verify the caller owns it and is a consumer before
 * returning anything — cross-user access is rejected exactly like the rest of
 * the JAAL backend.
 */
export const getConsumerEvidence = query({
  args: {
    investigationId: v.id("investigations"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || identity.role !== CONSUMER_ROLE) {
      throw new Error("Consumer access restricted to Normal People accounts.");
    }
    const owner = await getOwner(ctx);
    const inv = await ctx.db.get(args.investigationId);
    if (!inv || inv.owner !== owner) {
      // Either not found, or not owned by the caller — return nothing.
      return [];
    }
    const rows = await ctx.db
      .query("evidence")
      .withIndex("by_investigation", (q) =>
        q.eq("investigationId", inv._id),
      )
      .collect();
    return rows
      .filter((e) => e.owner === owner)
      .map((e) => ({
        _id: e._id as string,
        label: e.label,
        evidenceType: e.evidenceType,
        extractedValue: e.extractedValue,
        content: e.content,
        sourceMessageText: e.sourceMessageText,
        integrityStatus: e.integrityStatus,
        notes: e.notes,
        createdAt: e.createdAt,
      }));
  },
});

// ---------------------------------------------------------------------------
// Safety Assistant (chat) — per-owner AI rate limit
// ---------------------------------------------------------------------------

/**
 * Consume one unit of the owner's AI budget for a Safety Assistant chat turn.
 * Reuses the existing `ai_requests` rolling-window table with a sentinel
 * `caseId` so chat shares the same per-owner budget as the other AI modules
 * (a consumer chat is not tied to any investigation). Throws when the owner
 * is over budget; the action surfaces that as an honest error.
 */
export const recordAssistantRequest = mutation({
  args: {},
  handler: async (ctx) => {
    const owner = await getOwner(ctx);
    const now = Date.now();
    const cutoff = now - AI_RATE_WINDOW_MS;
    const recent = await ctx.db
      .query("ai_requests")
      .withIndex("by_owner_at", (q) => q.eq("owner", owner).gte("at", cutoff))
      .collect();
    if (recent.length >= AI_RATE_MAX) {
      throw new Error(
        `AI rate limit exceeded — at most ${AI_RATE_MAX} requests per ${
          AI_RATE_WINDOW_MS / 1000
        }s. Wait a moment before asking again.`,
      );
    }
    await ctx.db.insert("ai_requests", {
      owner,
      caseId: "assistant",
      kind: "assistant",
      at: now,
    });
    // Opportunistic sweep so the table stays bounded.
    const stale = await ctx.db
      .query("ai_requests")
      .withIndex("by_owner_at", (q) => q.eq("owner", owner).lt("at", now - 3_600_000))
      .take(50);
    for (const row of stale) await ctx.db.delete(row._id);
    return { allowed: true };
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
 * Returns the created report (consumer-safe view) plus the evidence count
 * attached.
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
      runStatus: "paused",
      startedAt: now,
      cursor: 0,
      turnCount: 0,
      stages: undefined,
      schemaVersion: 1,
    });

    const attach = async (
      label: string,
      evidenceType: string,
      value: string,
      sourceText: string,
    ) => {
      await ctx.db.insert("evidence", {
        investigationId: invId,
        owner,
        caseId,
        sourceMessageText: sourceText,
        label,
        evidenceType,
        extractedValue: value,
        normalizedValue: value,
        content: value,
        extractionMethod: "CONSUMER_PROVIDED",
        extractionTimestamp: now,
        integrityStatus: "NOT_HASHED",
        notes: "Provided by the reporter. Not independently verified.",
        originalContent: value,
        createdAt: now,
      });
    };

    if (args.messageText) {
      await attach("Message", "scam_message", args.messageText, "Reporter-provided message text.");
    }
    if (args.conversationText) {
      await attach("Conversation", "transcript", args.conversationText, "Reporter-provided conversation.");
    }
    if (args.phoneNumber) {
      await attach("Phone number", "phone", args.phoneNumber, "Reporter-provided phone number.");
    }
    if (args.upiId) {
      await attach("UPI ID", "upi", args.upiId, "Reporter-provided UPI ID.");
    }
    if (args.paymentDetails) {
      await attach("Payment details", "payment_request", args.paymentDetails, "Reporter-provided payment details.");
    }
    if (args.amount) {
      await attach("Amount", "payment_request", args.amount, "Reporter-provided amount.");
    }
    if (args.url) {
      await attach("Link", "url", args.url, args.urlWhereReceived ?? "Reporter-provided link.");
    }
    if (args.description) {
      await attach("Description", "other", args.description, "Reporter-provided description.");
    }
    if (args.attachmentText && args.attachmentLabel) {
      await attach(args.attachmentLabel, "other", args.attachmentText, "Reporter-provided attachment.");
    }

    const inv = await ctx.db.get(invId);
    if (!inv) throw new Error("Report creation failed.");

    const evidenceCount = await countEvidence(ctx.db, invId);
    return {
      report: toConsumerReport(inv, evidenceCount),
      attachedEvidenceCount: evidenceCount,
    };
  },
});
