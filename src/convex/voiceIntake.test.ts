import { describe, expect, it } from "vitest";
import {
  ALLOWED_AUDIO_MIME,
  MAX_AUDIO_BYTES,
  MAX_IDEMPOTENCY_KEY_CHARS,
  isAllowedAudioMime,
  normaliseIdempotencyKey,
  validateVoiceUpload,
} from "./voiceIntake";

/**
 * Pure intake rules. These are the same checks the mutation runs, so a client
 * cannot bypass them by skipping its own validation.
 */

const HASH = "a".repeat(64);

function valid(overrides: Partial<Parameters<typeof validateVoiceUpload>[0]> = {}) {
  return {
    consentAccepted: true,
    mimeType: "audio/mpeg",
    sizeBytes: 1_024,
    fileHash: HASH,
    ...overrides,
  };
}

describe("validateVoiceUpload", () => {
  it("accepts every supported audio type", () => {
    for (const mime of ALLOWED_AUDIO_MIME) {
      expect(validateVoiceUpload(valid({ mimeType: mime }))).toBeNull();
    }
  });

  it("requires explicit consent", () => {
    expect(validateVoiceUpload(valid({ consentAccepted: false }))).toMatch(
      /Consent is required/,
    );
  });

  it("rejects an unsupported or disguised format", () => {
    expect(validateVoiceUpload(valid({ mimeType: "video/mp4" }))).toMatch(
      /Unsupported audio format/,
    );
    expect(validateVoiceUpload(valid({ mimeType: "application/pdf" }))).toMatch(
      /Unsupported audio format/,
    );
  });

  it("rejects empty and oversized files with a clear limit", () => {
    expect(validateVoiceUpload(valid({ sizeBytes: 0 }))).toMatch(/empty/);
    expect(validateVoiceUpload(valid({ sizeBytes: -1 }))).toMatch(/empty/);
    expect(validateVoiceUpload(valid({ sizeBytes: MAX_AUDIO_BYTES + 1 }))).toMatch(
      /too large/,
    );
    expect(validateVoiceUpload(valid({ sizeBytes: MAX_AUDIO_BYTES }))).toBeNull();
  });

  it("accepts only a lowercase 64-character SHA-256 hex digest", () => {
    expect(validateVoiceUpload(valid({ fileHash: "ABC" }))).toMatch(
      /Invalid file hash/,
    );
    expect(validateVoiceUpload(valid({ fileHash: "A".repeat(64) }))).toMatch(
      /Invalid file hash/,
    );
    expect(validateVoiceUpload(valid({ fileHash: "a".repeat(63) }))).toMatch(
      /Invalid file hash/,
    );
  });

  it("is case-insensitive about the MIME type", () => {
    expect(isAllowedAudioMime("AUDIO/MPEG")).toBe(true);
    expect(validateVoiceUpload(valid({ mimeType: "AUDIO/WAV" }))).toBeNull();
  });
});

describe("normaliseIdempotencyKey", () => {
  it("keeps a bounded printable token", () => {
    expect(normaliseIdempotencyKey("  abcdef123456  ")).toBe("abcdef123456");
    expect(normaliseIdempotencyKey("m1x2-abc_def:9")).toBe("m1x2-abc_def:9");
  });

  it("truncates to the stored maximum", () => {
    const long = "k".repeat(MAX_IDEMPOTENCY_KEY_CHARS + 40);
    expect(normaliseIdempotencyKey(long)).toHaveLength(MAX_IDEMPOTENCY_KEY_CHARS);
  });

  it("ignores empty and unsafe values instead of throwing", () => {
    expect(normaliseIdempotencyKey("")).toBeUndefined();
    expect(normaliseIdempotencyKey(null)).toBeUndefined();
    expect(normaliseIdempotencyKey("short")).toBeUndefined();
    expect(normaliseIdempotencyKey("bad key with spaces")).toBeUndefined();
    expect(normaliseIdempotencyKey("drop;table--")).toBeUndefined();
  });
});
