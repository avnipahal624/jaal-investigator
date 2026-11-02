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
export async function readBytes(uri: string): Promise<Uint8Array> {
  const buf = await new File(uri).arrayBuffer();
  return new Uint8Array(buf);
}

/** SHA-256 (lowercase hex) of the exact bytes — verified server-side later. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** POST the raw bytes to the Convex upload URL; returns the storage id. */
export async function uploadBytes(
  uploadUrl: string,
  bytes: Uint8Array,
  mimeType: string,
): Promise<string> {
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": mimeType },
    body: bytes,
  });
  if (!res.ok) throw new Error(`Upload failed (${res.status}). Please try again.`);
  const data = (await res.json()) as { storageId?: string };
  if (!data.storageId) throw new Error("Upload did not return a storage id.");
  return data.storageId;
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
