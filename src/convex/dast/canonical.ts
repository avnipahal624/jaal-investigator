/**
 * Deterministic JSON for security decisions.
 *
 * Approval digests and evidence hashes must not depend on object insertion
 * order, optional `undefined` values or incidental whitespace. Arrays keep
 * their order because request/response sequences are meaningful; object keys
 * are sorted recursively.
 */

export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, inner]) => inner !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return Object.fromEntries(entries.map(([key, inner]) => [key, canonicalize(inner)]));
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error("Canonical serialization refused a non-finite number.");
  }
  return value;
}

/** Compact canonical JSON, used for SHA-256 inputs. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

/** Human-readable canonical JSON, used for stored evidence. */
export function canonicalJsonPretty(value: unknown): string {
  return JSON.stringify(canonicalize(value), null, 2);
}
