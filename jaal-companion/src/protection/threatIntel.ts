/**
 * THREAT-INTELLIGENCE SERVICE.
 *
 * Thin client over the shared JAAL backend (`protection:*`). It never
 * invents a detection: a miss is reported as an honest NO_RECORD /
 * SAFE_LOOKING with the backend's own notice text, and an unavailable
 * backend surfaces as UNAVAILABLE rather than a fabricated verdict.
 */

import { useMutation, useQuery } from "convex/react";
import type { Id } from "@convex-dataModel";
import { api } from "../services/api";
import { checkLink } from "../utils/linkCheck";
import type {
  CallerIntelligence,
  LinkIntelligence,
  ProtectionSettings,
  ThreatAlert,
} from "./types";

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/** The user's protection preferences (undefined while loading). */
export function useProtectionSettings(): ProtectionSettings | undefined {
  return useQuery(api.protection.getProtectionSettings);
}

export function useSaveProtectionSettings() {
  return useMutation(api.protection.saveProtectionSettings);
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

export function useProtectionAlerts(limit = 50): ThreatAlert[] | undefined {
  return useQuery(api.protection.listProtectionAlerts, { limit });
}

export function useUnreadAlertCount(): number | undefined {
  return useQuery(api.protection.unreadAlertCount);
}

export function useMarkAlertRead() {
  const mutate = useMutation(api.protection.markAlertRead);
  // The wire type is a Convex `Id`; alerts cross the UI boundary as plain
  // strings, so the cast happens here, once, instead of at every call site.
  return (args: { alertId: string }) =>
    mutate({ alertId: args.alertId as Id<"protection_alerts"> });
}

export function useMarkAllAlertsRead() {
  return useMutation(api.protection.markAllAlertsRead);
}

// ---------------------------------------------------------------------------
// Indicator submission
// ---------------------------------------------------------------------------

export function useReportIndicator() {
  return useMutation(api.protection.reportIndicator);
}

// ---------------------------------------------------------------------------
// Wire shapes returned by the backend (mirrors protection.ts)
// ---------------------------------------------------------------------------

export interface LookupResult {
  status: "FOUND" | "NOT_FOUND" | "INVALID" | "RATE_LIMITED";
  value: string | null;
  displayValue: string | null;
  provenance?: "USER_REPORTED" | "VERIFIED";
  reason?: string;
  reportCount?: number;
  reporterCount?: number;
  updatedAt?: number;
  lastReportedAt?: number;
  alsoInMyReports?: boolean;
  notice: string;
}

export type LookupFn = (args: {
  type: "phone" | "url" | "domain" | "upi" | "message_pattern";
  value: string;
  raiseAlert?: boolean;
}) => Promise<LookupResult>;

// ---------------------------------------------------------------------------
// Caller intelligence
// ---------------------------------------------------------------------------

/** Strip a number down to the digits a lookup can match on. */
export function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/[^\d]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  while (digits.startsWith("0") && digits.length > 10) digits = digits.slice(1);
  if (digits.length < 6 || digits.length > 15) return null;
  return digits;
}

const NO_RECORD_NOTICE =
  "No record in JAAL's threat intelligence for this number. That does not prove the caller is safe — an unknown number is not automatically a suspicious one.";

const LOOKUP_FAILED_NOTICE =
  "JAAL could not check this number right now (offline or the lookup service is unavailable). No conclusion is available.";

/**
 * Check one phone number against JAAL threat intelligence.
 *
 * An unknown number is NEVER called suspicious — `risk` only escalates when a
 * stored indicator actually matches, and the provenance of that match is
 * always reported so a user report is never mistaken for a verified finding.
 */
export async function checkCallerIntelligence(input: {
  number: string;
  lookup: LookupFn;
}): Promise<CallerIntelligence> {
  const trimmed = input.number.trim();
  const normalized = normalizePhone(trimmed);

  const base: CallerIntelligence = {
    number: trimmed,
    normalizedNumber: normalized,
    risk: "NO_RECORD",
    reason: "",
    provenance: null,
    reporterCount: 0,
    lastUpdatedAt: null,
    inMyReports: false,
    isUnknownNumber: true,
    notice: NO_RECORD_NOTICE,
  };

  if (!normalized) {
    return {
      ...base,
      risk: "UNKNOWN",
      notice: "That phone number could not be read as a valid number.",
    };
  }

  let result: LookupResult;
  try {
    result = await input.lookup({ type: "phone", value: normalized });
  } catch {
    return { ...base, risk: "UNKNOWN", notice: LOOKUP_FAILED_NOTICE };
  }

  if (result.status === "INVALID") {
    return {
      ...base,
      risk: "UNKNOWN",
      notice: result.notice,
    };
  }
  if (result.status === "RATE_LIMITED") {
    return { ...base, risk: "UNKNOWN", notice: result.notice };
  }
  if (result.status === "NOT_FOUND") {
    return {
      ...base,
      inMyReports: result.alsoInMyReports === true,
      notice: NO_RECORD_NOTICE,
    };
  }

  const verified = result.provenance === "VERIFIED";
  return {
    ...base,
    risk: verified ? "VERIFIED_SUSPICIOUS" : "USER_REPORTED",
    reason: result.reason ?? "",
    provenance: result.provenance ?? null,
    reporterCount: result.reporterCount ?? 0,
    lastUpdatedAt: result.updatedAt ?? null,
    inMyReports: result.alsoInMyReports === true,
    notice: result.notice,
  };
}

// ---------------------------------------------------------------------------
// Link intelligence
// ---------------------------------------------------------------------------

const LINK_UNAVAILABLE_NOTICE =
  "JAAL could not check this link against threat intelligence right now. The URL still has not been opened.";

/**
 * Check a link WITHOUT ever opening, fetching or resolving it.
 *
 * Combines deterministic string analysis (local) with the JAAL indicator
 * lookup (backend). An AI assessment is only attached when the user has
 * consented to AI processing and an analyser was supplied.
 */
export async function checkLinkIntelligence(input: {
  raw: string;
  lookup: LookupFn;
  /** The user's AI-processing consent. Without it, no content is sent. */
  aiConsent: boolean;
  /** Optional AI analyser — only invoked when `aiConsent` is true. */
  analyse?: (text: string) => Promise<string | null>;
}): Promise<LinkIntelligence> {
  const local = checkLink(input.raw);

  const base: LinkIntelligence = {
    raw: input.raw,
    normalized: null,
    host: local.host,
    verdict: "INVALID",
    localFlags: local.flags,
    provenance: null,
    reason: "",
    matchedThreatIntel: false,
    aiSummary: null,
    neverOpened: true,
    notice: local.valid
      ? "This link has not been opened."
      : local.flags[0]?.label ?? "That is not a complete URL.",
  };

  if (!local.valid) return base;

  let lookup: LookupResult | null = null;
  try {
    lookup = await input.lookup({ type: "url", value: input.raw, raiseAlert: true });
  } catch {
    lookup = null;
  }

  let matchedThreatIntel = false;
  let provenance: "USER_REPORTED" | "VERIFIED" | null = null;
  let reason = "";
  let notice = base.notice;

  if (lookup && lookup.status === "FOUND") {
    matchedThreatIntel = true;
    provenance = lookup.provenance ?? null;
    reason = lookup.reason ?? "";
    notice = lookup.notice;
  } else if (lookup && lookup.status !== "NOT_FOUND") {
    // INVALID / RATE_LIMITED / thrown — honest, never a clean bill of health.
    notice = lookup.status === "RATE_LIMITED" ? lookup.notice : LINK_UNAVAILABLE_NOTICE;
  } else if (!lookup) {
    notice = LINK_UNAVAILABLE_NOTICE;
  }

  const highLocal = local.flags.some((f) => f.level === "HIGH");
  const verdict: LinkIntelligence["verdict"] = matchedThreatIntel
    ? "KNOWN_INDICATOR"
    : lookup === null || lookup.status === "RATE_LIMITED"
      ? "UNAVAILABLE"
      : highLocal || local.flags.some((f) => f.level === "MEDIUM")
        ? "SUSPICIOUS"
        : "SAFE_LOOKING";

  // AI assessment — only when the user consented and content was submitted.
  let aiSummary: string | null = null;
  if (input.aiConsent && input.analyse) {
    try {
      aiSummary = await input.analyse(input.raw);
    } catch {
      aiSummary = null;
    }
  }

  return {
    ...base,
    verdict,
    normalized: lookup?.value ?? null,
    provenance,
    reason,
    matchedThreatIntel,
    aiSummary,
    notice,
  };
}
