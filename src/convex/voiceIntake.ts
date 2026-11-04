/**
 * Pure intake rules for the voice reporting flow.
 *
 * Extracted from `voice.ts` so the exact limits (consent, MIME allow-list,
 * size cap, hash shape, idempotency key shape) can be unit-tested without a
 * database. The mutation is still the only enforcement point; the mobile app
 * mirrors these rules for early feedback, never as the authority.
 */

/** Max uploaded recording size (25 MB) — a normal call recording fits. */
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

/** Longest accepted idempotency key; anything longer is truncated. */
export const MAX_IDEMPOTENCY_KEY_CHARS = 120;

export const ALLOWED_AUDIO_MIME = [
  "audio/mpeg", // mp3
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/mp4", // m4a /AAC in MP4
  "audio/m4a",
  "audio/x-m4a",
  "audio/aac",
  "audio/ogg",
  "audio/webm",
  "audio/amr",
] as const;

export function isAllowedAudioMime(mime: string): boolean {
  return (ALLOWED_AUDIO_MIME as readonly string[]).includes(
    (mime ?? "").toLowerCase(),
  );
}

export type VoiceUploadInput = {
  consentAccepted: boolean;
  mimeType: string;
  sizeBytes: number;
  fileHash: string;
};

/**
 * Validate the metadata a client sends with an upload. Returns a user-facing
 * message, or null when the upload may be recorded. Order matches the original
 * mutation so error text is unchanged for existing clients.
 */
export function validateVoiceUpload(input: VoiceUploadInput): string | null {
  if (!input.consentAccepted) {
    return "Consent is required before a recording can be uploaded and analysed.";
  }

  const mime = (input.mimeType ?? "").toLowerCase();
  if (!isAllowedAudioMime(mime)) {
    return `Unsupported audio format (${input.mimeType}). Please upload MP3, WAV, M4A, AAC, OGG, WebM or AMR.`;
  }
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    return "The uploaded file appears to be empty.";
  }
  if (input.sizeBytes > MAX_AUDIO_BYTES) {
    return `Recording is too large (${(input.sizeBytes / 1024 / 1024).toFixed(1)} MB). The maximum is ${MAX_AUDIO_BYTES / 1024 / 1024} MB.`;
  }
  if (!/^[0-9a-f]{64}$/.test(input.fileHash ?? "")) {
    return "Invalid file hash format.";
  }
  return null;
}

/**
 * Normalise a client idempotency key. Only a bounded, printable token is kept:
 * the value is used purely as a per-owner lookup key and is never shown.
 */
export function normaliseIdempotencyKey(
  raw: string | null | undefined,
): string | undefined {
  const value = (raw ?? "").trim();
  if (!value) return undefined;
  const bounded = value.slice(0, MAX_IDEMPOTENCY_KEY_CHARS);
  return /^[A-Za-z0-9:_-]{8,}$/.test(bounded) ? bounded : undefined;
}
