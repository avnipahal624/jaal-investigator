import { canonicalJsonPretty } from "./canonical";

const SENSITIVE_KEY =
  /authorization|proxy-authorization|cookie|set-cookie|token|password|passwd|secret|api[-_]?key|session[-_]?id|csrf|xsrf/i;
const EMAIL_KEY = /e-?mail/i;
const PNR_KEY = /pnr|booking[-_]?ref|passenger[-_]?record/i;

function maskEmail(value: string): string {
  const [local, domain] = value.split("@");
  if (!domain) return value;
  return `${(local ?? "?")[0] ?? "?"}•••@${domain}`;
}

function maskPnr(value: string): string {
  if (value.length < 3) return "•••";
  return `${value.slice(0, 2)}-••`;
}

function redactString(value: string): string {
  return value
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, (match) => maskEmail(match))
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer [REDACTED]")
    .replace(
      /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g,
      "[REDACTED_JWT]",
    )
    .replace(/\b(?:sk|pk|rk)_[A-Za-z0-9_-]{12,}\b/g, "[REDACTED_KEY]")
    .replace(/\b(session|csrf|xsrf)=([^;\s]+)/gi, "$1=[REDACTED]");
}

/**
 * Recursively sanitize untrusted request/response material before it is
 * persisted. This is deliberately applied to object keys at every depth,
 * including nested headers, arrays and body values.
 */
export function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY.test(key)) {
        out[key] = "[REDACTED]";
      } else if (EMAIL_KEY.test(key) && typeof inner === "string") {
        out[key] = maskEmail(inner);
      } else if (PNR_KEY.test(key) && typeof inner === "string") {
        out[key] = maskPnr(inner);
      } else {
        out[key] = redactSensitive(inner);
      }
    }
    return out;
  }
  return typeof value === "string" ? redactString(value) : value;
}

/** Canonical, sanitized JSON. The hash is always computed over this exact text. */
export function canonicalEvidence(value: unknown): string {
  return canonicalJsonPretty(redactSensitive(value));
}
