/**
 * Real client-side SHA-256 hashing via the Web Crypto API.
 *
 * A hash only proves that content has not changed since it was recorded.
 * It does not prove an identifier is genuine, that a person is real, or
 * that any crime was committed.
 */

export async function sha256Hex(content: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("Web Crypto API unavailable (requires secure context)");
  }
  const bytes = new TextEncoder().encode(content);
  const digest = await subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * SHA-256 of raw bytes (hex). Used for uploaded audio/evidence files where the
 * hash must cover the exact original bytes, not a text encoding of them.
 */
export async function sha256HexBytes(bytes: ArrayBuffer): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("Web Crypto API unavailable (requires secure context)");
  }
  const digest = await subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyHash(
  content: string,
  recordedHash: string,
): Promise<boolean> {
  const next = await sha256Hex(content);
  return next.toLowerCase() === recordedHash.toLowerCase();
}

export function shortHash(hash: string | null, size = 10): string {
  if (!hash) return "—";
  return `${hash.slice(0, size)}…${hash.slice(-4)}`;
}
