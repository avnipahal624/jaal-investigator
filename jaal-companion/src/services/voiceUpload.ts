import * as Crypto from "expo-crypto";
import { File } from "expo-file-system";

/** Mirrors the backend voice constants (single source of truth: src/convex/voice.ts). */
export const CONSENT_VERSION = "voice-consent-1";
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
export const ALLOWED_AUDIO_MIME = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/aac",
  "audio/ogg",
  "audio/webm",
  "audio/amr",
] as const;

/** Read the picked file's raw bytes (works with the cache file:// URI). */
export async function readBytes(uri: string): Promise<Uint8Array<ArrayBuffer>> {
  const buf = await new File(uri).arrayBuffer();
  return new Uint8Array(buf);
}

/** Stable key for one submission attempt (idempotent report creation). */
export function newSubmissionKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

/** SHA-256 (lowercase hex) of the exact bytes — verified server-side later. */
export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** A hung upload must not leave the screen spinning forever. */
export const UPLOAD_TIMEOUT_MS = 120_000;

/**
 * POST the raw bytes to the Convex upload URL; returns the storage id.
 *
 * Errors are actionable and never imply the file was saved: a timeout says the
 * file is still selected, a 429 says nothing was stored, and the caller keeps
 * the picked file so a retry needs no re-picking.
 */
export async function uploadBytes(
  uploadUrl: string,
  bytes: Uint8Array<ArrayBuffer>,
  mimeType: string,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  try {
    const res = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": mimeType },
      body: bytes,
      signal: controller.signal,
    });
    if (!res.ok) {
      if (res.status === 413) {
        throw new Error(
          "That recording is larger than the storage limit allows. Choose a shorter recording.",
        );
      }
      if (res.status === 429) {
        throw new Error(
          "Too many uploads right now. Nothing was saved — wait a moment and try again.",
        );
      }
      throw new Error(
        `Upload failed (${res.status}). Your file is still selected — please try again.`,
      );
    }
    const data = (await res.json()) as { storageId?: string };
    if (!data.storageId) throw new Error("Upload did not return a storage id.");
    return data.storageId;
  } catch (err) {
    if (
      err instanceof Error &&
      (err.name === "AbortError" || /abort|timed out/i.test(err.message))
    ) {
      throw new Error(
        "The upload timed out. Your file is still selected — check your connection and try again.",
      );
    }
    if (
      err instanceof TypeError ||
      (err instanceof Error && /network|failed to fetch|offline/i.test(err.message))
    ) {
      throw new Error(
        "You appear to be offline. Your file is still selected — reconnect and try again.",
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Best-effort MIME type from the picked asset (falls back to extension). */
export function resolveMimeType(mime: string | undefined, fileName: string): string {
  if (mime && (ALLOWED_AUDIO_MIME as readonly string[]).includes(mime.toLowerCase())) {
    return mime.toLowerCase();
  }
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const byExt: Record<string, string> = {
    mp3: "audio/mpeg",
    wav: "audio/wav",
    m4a: "audio/mp4",
    aac: "audio/aac",
    ogg: "audio/ogg",
    webm: "audio/webm",
    amr: "audio/amr",
  };
  return byExt[ext] ?? (mime ?? "audio/mpeg");
}

export function isAllowedMime(mime: string): boolean {
  return (ALLOWED_AUDIO_MIME as readonly string[]).includes(mime.toLowerCase());
}
