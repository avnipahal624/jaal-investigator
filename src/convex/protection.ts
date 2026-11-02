import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { getAccountRole, maskIdentifier } from "./lib/backend";
import { requireConsumer } from "./consumer";

/**
 * JAAL PROTECTION — threat-intelligence lookups, indicator submission,
 * per-user protection settings and the user-visible alert history.
 *
 * Design rules (see schema.ts for the table contracts):
 *  - Provenance is never invented. `USER_REPORTED` is a JAAL user's report,
 *    not proof of fraud; `VERIFIED` is set only by an investigator.
 *  - Lookups return aggregates only — never another user's identity, case
 *    contents or report text beyond the short `reason` the reporter chose
 *    to publish with the indicator.
 *  - Writes and lookups are rate-limited and always authenticated.
 *  - Nothing here fabricates a detection: a miss is an honest NOT_FOUND.
 */

export const INDICATOR_TYPES = [
  "phone",
  "url",
  "domain",
  "upi",
  "message_pattern",
] as const;
export type IndicatorType = (typeof INDICATOR_TYPES)[number];

export const LOOKUP_RATE_WINDOW_MS = 60_000;
/** Generous read budget — protection checks must never lock a user out. */
export const LOOKUP_RATE_MAX = 60;
export const REPORT_RATE_WINDOW_MS = 60_000;
export const REPORT_RATE_MAX = 10;
export const MAX_REASON_LENGTH = 160;
/** Do not re-raise the same alert for the same indicator more than this often. */
export const ALERT_DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

export type LookupStatus =
  | "FOUND"
  | "NOT_FOUND"
  | "INVALID"
  | "RATE_LIMITED";

// ---------------------------------------------------------------------------
// Normalisation — one canonical key per indicator so lookups actually match.
// ---------------------------------------------------------------------------

/**
 * Normalise an indicator into its canonical lookup key, or `null` when the
 * input is not a usable indicator of that type. Purely string-based: it never
 * opens a URL, never resolves a domain and never makes a network request.
 */
export function normalizeIndicator(
  type: IndicatorType,
  raw: string,
): string | null {
  const input = raw.trim();
  if (!input) return null;

  switch (type) {
    case "phone": {
      let digits = input.replace(/[^\d]/g, "");
      if (digits.startsWith("00")) digits = digits.slice(2);
      // Indian trunk/country-code folding so +91 98765… and 098765… match.
      if (digits.length === 12 && digits.startsWith("91")) {
        digits = digits.slice(2);
      }
      while (digits.startsWith("0") && digits.length > 10) {
        digits = digits.slice(1);
      }
      if (digits.length < 6 || digits.length > 15) return null;
      return digits;
    }

    case "url": {
      let parsed: URL;
      try {
        parsed = new URL(
          input.includes("://") ? input : `https://${input}`,
        );
      } catch {
        return null;
      }
      const host = parsed.hostname
        .toLowerCase()
        .replace(/\.$/, "")
        .replace(/^www\./, "");
      if (!host || !host.includes(".")) return null;
      const port =
        parsed.port && parsed.port !== "443" && parsed.port !== "80"
          ? `:${parsed.port}`
          : "";
      const path =
        parsed.pathname === "/" && !parsed.search ? "" : parsed.pathname;
      return `${host}${port}${path}${parsed.search}`.slice(0, 400);
    }

    case "domain": {
      let host = input.toLowerCase();
      if (host.includes("://") || host.includes("/")) {
        try {
          host = new URL(
            host.includes("://") ? host : `https://${host}`,
          ).hostname;
        } catch {
          return null;
        }
      }
      host = host.replace(/\.$/, "").replace(/^www\./, "");
      if (!host.includes(".") || !/^[a-z0-9.-]+$/.test(host)) return null;
      if (host.split(".").some((part) => part.length === 0)) return null;
      return host;
    }

    case "upi": {
      const value = input
        .toLowerCase()
        .replace(/^upi:\/\//, "")
        .replace(/^paytmmp:\/\//, "")
        .trim();
      if (!/^[a-z0-9._-]{2,64}@[a-z0-9.-]{2,32}$/.test(value)) return null;
      return value;
    }

    case "message_pattern": {
      const pattern = input
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 300);
      return pattern.length >= 8 ? pattern : null;
    }
  }
}

/** The host component of a normalised URL key (used for domain fallback). */
function hostOfUrlKey(urlKey: string): string | null {
  const host = urlKey.split("/")[0]?.split(":")[0] ?? "";
  return host.includes(".") ? host : null;
}

function displayFor(type: IndicatorType, normalized: string): string {
  if (type === "phone") return maskIdentifier("phone", normalized);
  if (type === "upi") return maskIdentifier("upi", normalized);
  return normalized.length > 80 ? `${normalized.slice(0, 80)}…` : normalized;
}

// ---------------------------------------------------------------------------
// Rate limiting — reuses the existing per-owner `ai_requests` rolling window.
// ---------------------------------------------------------------------------

async function overBudget(
  ctx: MutationCtx | QueryCtx,
  owner: string,
  kind: string,
  windowMs: number,
  max: number,
): Promise<boolean> {
  const cutoff = Date.now() - windowMs;
  const recent = await ctx.db
    .query("ai_requests")
    .withIndex("by_owner_at", (q) => q.eq("owner", owner).gte("at", cutoff))
    .collect();
  return recent.filter((r) => r.kind === kind).length >= max;
}

async function consumeBudget(
  ctx: MutationCtx,
  owner: string,
  kind: string,
): Promise<void> {
  await ctx.db.insert("ai_requests", {
    owner,
    caseId: "protection",
    kind,
    at: Date.now(),
  });
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

export interface AlertInput {
  owner: string;
  kind: "caller" | "message" | "link" | "analysis" | "report";
  title: string;
  explanation: string;
  evidence: string;
  recommendedAction: string;
  origin: "THREAT_INTEL" | "AI_ANALYSIS";
  indicatorType?: IndicatorType;
  indicatorValue?: string;
}

/**
 * Raise a protection alert, unless an identical one for this owner was raised
 * within the dedupe window. Called from other backend functions so alerting
 * stays consistent (and quiet) across caller, link and analysis flows.
 */
export async function createAlert(
  ctx: MutationCtx,
  input: AlertInput,
): Promise<{ created: boolean; alertId?: Doc<"protection_alerts">["_id"] }> {
  const now = Date.now();
  const recent = await ctx.db
    .query("protection_alerts")
    .withIndex("by_owner_created", (q) =>
      q.eq("owner", input.owner).gte("createdAt", now - ALERT_DEDUPE_WINDOW_MS),
    )
    .collect();

  const dup = recent.find(
    (a) =>
      a.kind === input.kind &&
      a.title === input.title &&
      (input.indicatorValue === undefined ||
        a.indicatorValue === input.indicatorValue),
  );
  if (dup) return { created: false };

  const alertId = await ctx.db.insert("protection_alerts", {
    owner: input.owner,
    kind: input.kind,
    title: input.title.slice(0, 160),
    explanation: input.explanation.slice(0, 500),
    evidence: input.evidence.slice(0, 300),
    recommendedAction: input.recommendedAction.slice(0, 300),
    origin: input.origin,
    indicatorType: input.indicatorType,
    indicatorValue: input.indicatorValue,
    read: false,
    createdAt: now,
  });

  // Opportunistic bound so the alert history stays small.
  const stale = await ctx.db
    .query("protection_alerts")
    .withIndex("by_owner_created", (q) =>
      q
        .eq("owner", input.owner)
        .lt("createdAt", now - 90 * 24 * 60 * 60 * 1000),
    )
    .take(25);
  for (const row of stale) await ctx.db.delete(row._id);

  return { created: true, alertId };
}

// ---------------------------------------------------------------------------
// Settings — every feature defaults to OFF.
// ---------------------------------------------------------------------------

export interface ProtectionSettings {
  callerProtection: boolean;
  messageProtection: boolean;
  linkProtection: boolean;
  aiProcessing: boolean;
  alertNotifications: boolean;
  shareToJaal: boolean;
}

/** Every protection feature is OFF until the user turns it on. */
export const DEFAULT_PROTECTION_SETTINGS: ProtectionSettings = {
  callerProtection: false,
  messageProtection: false,
  linkProtection: false,
  aiProcessing: false,
  alertNotifications: false,
  shareToJaal: false,
};

async function readSettings(
  ctx: QueryCtx | MutationCtx,
  owner: string,
): Promise<ProtectionSettings> {
  const row = await ctx.db
    .query("protection_settings")
    .withIndex("by_owner", (q) => q.eq("owner", owner))
    .first();
  if (!row) return { ...DEFAULT_PROTECTION_SETTINGS };
  return {
    callerProtection: row.callerProtection,
    messageProtection: row.messageProtection,
    linkProtection: row.linkProtection,
    aiProcessing: row.aiProcessing,
    alertNotifications: row.alertNotifications,
    shareToJaal: row.shareToJaal,
  };
}

/** The owner's protection preferences (all-off by default). */
export const getProtectionSettings = query({
  args: {},
  handler: async (ctx) => {
    const owner = await requireConsumer(ctx);
    return await readSettings(ctx, owner);
  },
});

/** Save protection preferences. Only the fields supplied are changed. */
export const saveProtectionSettings = mutation({
  args: {
    callerProtection: v.optional(v.boolean()),
    messageProtection: v.optional(v.boolean()),
    linkProtection: v.optional(v.boolean()),
    aiProcessing: v.optional(v.boolean()),
    alertNotifications: v.optional(v.boolean()),
    shareToJaal: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const owner = await requireConsumer(ctx);
    const current = await readSettings(ctx, owner);
    const next: ProtectionSettings = {
      callerProtection: args.callerProtection ?? current.callerProtection,
      messageProtection: args.messageProtection ?? current.messageProtection,
      linkProtection: args.linkProtection ?? current.linkProtection,
      aiProcessing: args.aiProcessing ?? current.aiProcessing,
      alertNotifications:
        args.alertNotifications ?? current.alertNotifications,
      shareToJaal: args.shareToJaal ?? current.shareToJaal,
    };

    const existing = await ctx.db
      .query("protection_settings")
      .withIndex("by_owner", (q) => q.eq("owner", owner))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { ...next, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("protection_settings", {
        owner,
        ...next,
        updatedAt: Date.now(),
      });
    }
    return next;
  },
});

// ---------------------------------------------------------------------------
// Indicator lookup
// ---------------------------------------------------------------------------

export interface LookupResult {
  status: LookupStatus;
  /** Normalised key actually checked (null when INVALID / RATE_LIMITED). */
  value: string | null;
  displayValue: string | null;
  /** Only set when status is FOUND. */
  provenance?: "USER_REPORTED" | "VERIFIED";
  reason?: string;
  reportCount?: number;
  reporterCount?: number;
  updatedAt?: number;
  lastReportedAt?: number;
  /** True when this exact identifier also appears in the caller's own reports. */
  alsoInMyReports?: boolean;
  /** Plain-language caveat shown alongside every result. */
  notice: string;
}

const PROVENANCE_NOTICE: Record<string, string> = {
  USER_REPORTED:
    "Reported by JAAL users. This is a user report, not a verified finding — treat it as a reason to double-check, not proof of wrongdoing.",
  VERIFIED:
    "Reviewed and confirmed by a JAAL investigator against the evidence on file.",
};

const NOT_FOUND_NOTICE =
  "No record in JAAL's threat intelligence for this identifier. That does not prove it is safe.";
const INVALID_NOTICE =
  "That value could not be read as a valid indicator of the requested type.";
const RATE_LIMITED_NOTICE =
  "Too many checks in the last minute. Wait a moment and try again.";

async function findIndicator(
  ctx: QueryCtx | MutationCtx,
  type: IndicatorType,
  normalized: string,
): Promise<Doc<"indicators"> | null> {
  const direct = await ctx.db
    .query("indicators")
    .withIndex("by_type_value", (q) => q.eq("type", type).eq("value", normalized))
    .first();
  if (direct) return direct;

  // A URL indicator should also match a domain-level report and vice versa.
  if (type === "url") {
    const host = hostOfUrlKey(normalized);
    if (host) {
      return await ctx.db
        .query("indicators")
        .withIndex("by_type_value", (q) =>
          q.eq("type", "domain").eq("value", host),
        )
        .first();
    }
  }
  if (type === "domain") {
    const broader = await ctx.db
      .query("indicators")
      .withIndex("by_type_updated", (q) => q.eq("type", "url"))
      .order("desc")
      .take(200);
    return broader.find((row) => hostOfUrlKey(row.value) === normalized) ?? null;
  }
  return null;
}

/** Has this owner already filed this identifier in one of their own reports? */
async function inOwnReports(
  ctx: QueryCtx,
  owner: string,
  type: IndicatorType,
  normalized: string,
): Promise<boolean> {
  const investigations = await ctx.db
    .query("investigations")
    .withIndex("by_owner", (q) => q.eq("owner", owner))
    .order("desc")
    .take(40);
  for (const inv of investigations) {
    const rows = await ctx.db
      .query("evidence")
      .withIndex("by_investigation", (q) =>
        q.eq("investigationId", inv._id),
      )
      .collect();
    for (const row of rows) {
      if (row.owner !== owner) continue;
      const candidate =
        row.evidenceType === type ||
        (type === "url" && row.evidenceType === "url") ||
        (type === "phone" && row.evidenceType === "phone");
      if (!candidate) continue;
      const norm = normalizeIndicator(
        type,
        row.normalizedValue || row.extractedValue,
      );
      if (norm && norm === normalized) return true;
    }
  }
  return false;
}

/**
 * Check an identifier against JAAL threat intelligence.
 *
 * Authenticated and rate-limited. Returns aggregates only — never another
 * account's identity or report contents. An honest NOT_FOUND is returned when
 * nothing matches; no detection is ever manufactured.
 */
export const lookupIndicator = mutation({
  args: {
    type: v.string(),
    value: v.string(),
    /** Raise a `link`/`caller` alert when this lookup finds a match. */
    raiseAlert: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<LookupResult> => {
    const owner = await requireConsumer(ctx);
    const type = args.type as IndicatorType;

    if (!INDICATOR_TYPES.includes(type)) {
      return { status: "INVALID", value: null, displayValue: null, notice: INVALID_NOTICE };
    }
    const normalized = normalizeIndicator(type, args.value);
    if (!normalized) {
      return { status: "INVALID", value: null, displayValue: null, notice: INVALID_NOTICE };
    }

    if (
      await overBudget(
        ctx,
        owner,
        "indicator_lookup",
        LOOKUP_RATE_WINDOW_MS,
        LOOKUP_RATE_MAX,
      )
    ) {
      return {
        status: "RATE_LIMITED",
        value: normalized,
        displayValue: null,
        notice: RATE_LIMITED_NOTICE,
      };
    }
    await consumeBudget(ctx, owner, "indicator_lookup");

    const match = await findIndicator(ctx, type, normalized);
    const mine = await inOwnReports(ctx, owner, type, normalized);

    if (!match) {
      return {
        status: "NOT_FOUND",
        value: normalized,
        displayValue: displayFor(type, normalized),
        alsoInMyReports: mine,
        notice: NOT_FOUND_NOTICE,
      };
    }

    if (args.raiseAlert) {
      await createAlert(ctx, {
        owner,
        kind: type === "phone" ? "caller" : "link",
        title:
          type === "phone"
            ? "A number you checked is on JAAL's watchlist"
            : "A link you checked is on JAAL's watchlist",
        explanation:
          "JAAL matched this identifier against threat intelligence built from user reports.",
        evidence: `${displayFor(type, normalized)} — ${match.reason}`,
        recommendedAction:
          "Do not share money, OTPs or personal details with this contact. Verify through a channel you already trust before acting.",
        origin: "THREAT_INTEL",
        indicatorType: type,
        indicatorValue: normalized,
      });
    }

    return {
      status: "FOUND",
      value: normalized,
      displayValue: displayFor(type, normalized),
      provenance: match.provenance,
      reason: match.reason,
      reportCount: match.reportCount,
      reporterCount: match.reporterCount,
      updatedAt: match.updatedAt,
      lastReportedAt: match.lastReportedAt,
      alsoInMyReports: mine,
      notice: PROVENANCE_NOTICE[match.provenance] ?? NOT_FOUND_NOTICE,
    };
  },
});

// ---------------------------------------------------------------------------
// Indicator submission
// ---------------------------------------------------------------------------

/**
 * Submit an indicator JAAL's threat intelligence.
 *
 * The reporter's own account is recorded for dedupe only and is never
 * returned to anyone else. Submitting always creates a `USER_REPORTED`
 * indicator — a consumer can never mark anything `VERIFIED`.
 */
export const reportIndicator = mutation({
  args: {
    type: v.string(),
    value: v.string(),
    reason: v.string(),
    sourceCaseId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const owner = await requireConsumer(ctx);
    const type = args.type as IndicatorType;
    if (!INDICATOR_TYPES.includes(type)) {
      throw new Error("Unsupported indicator type.");
    }
    const normalized = normalizeIndicator(type, args.value);
    if (!normalized) {
      throw new Error(
        "That value is not a valid indicator of the selected type.",
      );
    }
    const reason = args.reason.trim().slice(0, MAX_REASON_LENGTH);
    if (reason.length < 4) {
      throw new Error(
        "Please give a short reason (at least 4 characters) so others know why it was flagged.",
      );
    }

    if (
      await overBudget(
        ctx,
        owner,
        "indicator_report",
        REPORT_RATE_WINDOW_MS,
        REPORT_RATE_MAX,
      )
    ) {
      throw new Error(
        `Indicator reports are limited to ${REPORT_RATE_MAX} per minute. Please try again shortly.`,
      );
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("indicators")
      .withIndex("by_type_value", (q) =>
        q.eq("type", type).eq("value", normalized),
      )
      .first();

    if (existing) {
      if (existing.createdBy === owner) {
        // The same account re-reporting its own indicator: refresh, no double count.
        await ctx.db.patch(existing._id, {
          reason,
          updatedAt: now,
          lastReportedAt: now,
        });
        return {
          indicatorId: existing._id,
          reportCount: existing.reportCount,
          reporterCount: existing.reporterCount,
          provenance: existing.provenance,
          deduped: true,
        };
      }
      await ctx.db.patch(existing._id, {
        reason,
        reportCount: existing.reportCount + 1,
        reporterCount: existing.reporterCount + 1,
        updatedAt: now,
        lastReportedAt: now,
        sourceCaseId: args.sourceCaseId ?? existing.sourceCaseId,
      });
      await consumeBudget(ctx, owner, "indicator_report");
      return {
        indicatorId: existing._id,
        reportCount: existing.reportCount + 1,
        reporterCount: existing.reporterCount + 1,
        provenance: existing.provenance,
        deduped: false,
      };
    }

    const indicatorId = await ctx.db.insert("indicators", {
      type,
      value: normalized,
      displayValue: displayFor(type, normalized),
      provenance: "USER_REPORTED",
      reason,
      reportCount: 1,
      reporterCount: 1,
      sourceCaseId: args.sourceCaseId,
      createdBy: owner,
      createdAt: now,
      updatedAt: now,
      lastReportedAt: now,
    });
    await consumeBudget(ctx, owner, "indicator_report");
    return {
      indicatorId,
      reportCount: 1,
      reporterCount: 1,
      provenance: "USER_REPORTED" as const,
      deduped: false,
    };
  },
});

/**
 * Promote a user-reported indicator to verified intelligence.
 * Investigator-only — the role check runs server-side.
 */
export const verifyIndicator = mutation({
  args: { indicatorId: v.id("indicators"), reason: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.subject) {
      throw new Error("Not authenticated.");
    }
    const role = await getAccountRole(ctx);
    if (role !== "investigator") {
      throw new Error(
        "Access restricted to investigator accounts. Your account is not authorised for this action.",
      );
    }
    const doc = await ctx.db.get(args.indicatorId);
    if (!doc) throw new Error("Indicator not found.");
    await ctx.db.patch(args.indicatorId, {
      provenance: "VERIFIED",
      verifiedAt: Date.now(),
      verifiedBy: identity.subject,
      reason: args.reason.trim().slice(0, MAX_REASON_LENGTH) || doc.reason,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

/**
 * Indicator cache for the Android call-screening service.
 *
 * The screening service runs inside the app process and may be started by the
 * OS with no JS running, so it needs the watchlist locally. This returns only
 * the normalised value, provenance and short reason — never a reporter's
 * identity or their report contents — and only when the user has actually
 * turned caller protection on.
 */
export const listIndicatorCache = query({
  args: { type: v.string() },
  handler: async (ctx, args) => {
    const owner = await requireConsumer(ctx);
    const settings = await readSettings(ctx, owner);
    const type = args.type as IndicatorType;
    if (type !== "phone" && type !== "domain" && type !== "url") {
      throw new Error("Unsupported indicator type for a local cache.");
    }
    if (!settings.callerProtection) {
      return { enabled: false as const, indicators: [] };
    }
    const rows = await ctx.db
      .query("indicators")
      .withIndex("by_type_updated", (q) => q.eq("type", type))
      .order("desc")
      .take(500);
    return {
      enabled: true as const,
      indicators: rows.map((r) => ({
        type: r.type,
        value: r.value,
        displayValue: r.displayValue,
        provenance: r.provenance,
        reason: r.reason,
        updatedAt: r.updatedAt,
      })),
    };
  },
});

// ---------------------------------------------------------------------------
// Alert history
// ---------------------------------------------------------------------------

/** The owner's alert history, newest first. */
export const listProtectionAlerts = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const owner = await requireConsumer(ctx);
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 100);
    const rows = await ctx.db
      .query("protection_alerts")
      .withIndex("by_owner_created", (q) => q.eq("owner", owner))
      .order("desc")
      .take(limit);
    return rows.map((a) => ({
      _id: a._id,
      kind: a.kind,
      title: a.title,
      explanation: a.explanation,
      evidence: a.evidence,
      recommendedAction: a.recommendedAction,
      origin: a.origin,
      indicatorType: a.indicatorType,
      read: a.read,
      createdAt: a.createdAt,
    }));
  },
});

/** Unread alert count for the Protection Centre badge. */
export const unreadAlertCount = query({
  args: {},
  handler: async (ctx) => {
    const owner = await requireConsumer(ctx);
    const rows = await ctx.db
      .query("protection_alerts")
      .withIndex("by_owner_read", (q) => q.eq("owner", owner).eq("read", false))
      .take(100);
    return rows.length;
  },
});

export const markAlertRead = mutation({
  args: { alertId: v.id("protection_alerts") },
  handler: async (ctx, args) => {
    const owner = await requireConsumer(ctx);
    const doc = await ctx.db.get(args.alertId);
    if (!doc || doc.owner !== owner) return { ok: false };
    await ctx.db.patch(args.alertId, { read: true });
    return { ok: true };
  },
});

export const markAllAlertsRead = mutation({
  args: {},
  handler: async (ctx) => {
    const owner = await requireConsumer(ctx);
    const rows = await ctx.db
      .query("protection_alerts")
      .withIndex("by_owner_read", (q) => q.eq("owner", owner).eq("read", false))
      .take(100);
    for (const row of rows) await ctx.db.patch(row._id, { read: true });
    return { updated: rows.length };
  },
});
