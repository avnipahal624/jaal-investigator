/**
 * VOICE PIPELINE — pure, testable pieces of the recorded-call pipeline.
 *
 * Everything here is deterministic and side-effect free (the one exception is
 * `transcribeAudio`, which takes an injectable fetch so tests can run without
 * touching a provider). `voiceActions.ts` orchestrates these; this module owns
 * the rules that must not drift:
 *
 *  - provider configuration resolution (missing key ≠ invalid endpoint),
 *  - endpoint construction that can never produce `undefined/audio/...`,
 *  - provider response parsing (units, ordering, clamping, text fallback),
 *  - timestamp grounding, so an AI finding can only carry a time that matches
 *    a real transcript segment,
 *  - indicator provenance, so an extracted identifier must appear in the
 *    transcript, and
 *  - bounded error descriptions that never leak a key.
 */

export type SttSegment = {
  speaker?: string;
  startMs?: number;
  endMs?: number;
  text: string;
};

export type SttResult = {
  text: string;
  /** Present only when the provider returned real segment timings. */
  segments?: SttSegment[];
  language?: string;
  /** True only when the provider actually labels who spoke. */
  diarized: boolean;
};

export const DEFAULT_STT_ENDPOINT = "https://api.openai.com/v1";
export const DEFAULT_STT_MODEL = "whisper-1";
export const DEFAULT_STT_TIMEOUT_MS = 120_000;
export const DEFAULT_STT_MAX_ATTEMPTS = 2;
export const MAX_STT_SEGMENTS = 2_000;

/**
 * How far a model-supplied time may sit from a real segment start before we
 * refuse to attach it to the audio. Documented, and used by the tests.
 */
export const TIMESTAMP_TOLERANCE_MS = 1_500;

// ---------------------------------------------------------------------------
// Provider configuration
// ---------------------------------------------------------------------------

export type SttConfig =
  | {
      configured: false;
      reason: "missing-key" | "invalid-endpoint";
      detail: string;
    }
  | {
      configured: true;
      name: string;
      model: string;
      url: string;
      apiKey: string;
      timeoutMs: number;
      maxAttempts: number;
    };

/**
 * Build the transcription URL from either a base URL or the full path.
 * Returns null for anything that is not an absolute http(s) URL — that is how
 * `undefined/audio/transcriptions` and `not-a-url/audio/transcriptions` are
 * rejected before a request is ever attempted.
 */
export function sttTranscriptionUrl(base: string): string | null {
  const raw = (base ?? "").trim();
  if (!raw || raw === "undefined" || raw === "null") return null;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  if (!parsed.hostname) return null;

  const trimmed = raw.replace(/\/+$/, "");
  return trimmed.endsWith("/audio/transcriptions")
    ? trimmed
    : `${trimmed}/audio/transcriptions`;
}

function boundedInt(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** Single source of truth for how a deployment configures speech-to-text. */
export function resolveSttConfig(
  env: Record<string, string | undefined>,
): SttConfig {
  const apiKey = (env.STT_API_KEY ?? "").trim();
  if (!apiKey) {
    return {
      configured: false,
      reason: "missing-key",
      detail:
        "STT_API_KEY is not set on this deployment, so audio cannot be transcribed.",
    };
  }

  const url = sttTranscriptionUrl(env.STT_ENDPOINT || DEFAULT_STT_ENDPOINT);
  if (!url) {
    return {
      configured: false,
      reason: "invalid-endpoint",
      detail:
        "STT_ENDPOINT must be an absolute http(s) URL (base URL or full /audio/transcriptions path).",
    };
  }

  return {
    configured: true,
    name: (env.STT_PROVIDER_NAME ?? "").trim() || "openai-compatible-stt",
    model: (env.STT_MODEL ?? "").trim() || DEFAULT_STT_MODEL,
    url,
    apiKey,
    timeoutMs: boundedInt(
      env.STT_TIMEOUT_MS,
      DEFAULT_STT_TIMEOUT_MS,
      5_000,
      300_000,
    ),
    maxAttempts: boundedInt(
      env.STT_MAX_ATTEMPTS,
      DEFAULT_STT_MAX_ATTEMPTS,
      1,
      3,
    ),
  };
}

export function extensionFor(mimeType: string): string {
  const mime = (mimeType ?? "").toLowerCase();
  if (mime.includes("wav")) return "wav";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("mp4") || mime.includes("m4a")) return "m4a";
  if (mime.includes("aac")) return "aac";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("amr")) return "amr";
  return "mp3";
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

function finiteSeconds(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Parse an OpenAI-compatible `verbose_json` transcription response.
 *
 * - provider timings are in SECONDS → milliseconds here, once,
 * - segments are filtered to non-empty text, ordered, and clamped so
 *   `endMs >= startMs >= 0`,
 * - when the provider omits `text` but returns segments, the transcript is
 *   assembled from the segments instead of being lost.
 */
export function parseSttResponse(data: unknown): SttResult {
  const body = (data ?? {}) as {
    text?: unknown;
    language?: unknown;
    segments?: unknown;
  };

  const rawSegments = Array.isArray(body.segments) ? body.segments : [];
  const segments: SttSegment[] = rawSegments
    .slice(0, MAX_STT_SEGMENTS)
    .map((entry) => {
      const s = (entry ?? {}) as {
        start?: unknown;
        end?: unknown;
        text?: unknown;
        speaker?: unknown;
      };
      const start = finiteSeconds(s.start);
      const end = finiteSeconds(s.end);
      const startMs =
        start === null ? undefined : Math.max(0, Math.round(start * 1000));
      const endMs =
        end === null
          ? undefined
          : Math.max(startMs ?? 0, Math.max(0, Math.round(end * 1000)));
      return {
        ...(typeof s.speaker === "string" && s.speaker.trim()
          ? { speaker: s.speaker.trim().slice(0, 40) }
          : {}),
        ...(startMs !== undefined ? { startMs } : {}),
        ...(endMs !== undefined ? { endMs } : {}),
        text: typeof s.text === "string" ? s.text.trim() : "",
      };
    })
    .filter((s) => s.text.length > 0);

  // Stable order by start time; segments without a time keep their order at the
  // end rather than being dropped.
  const timed = segments
    .filter((s) => typeof s.startMs === "number")
    .sort((a, b) => (a.startMs as number) - (b.startMs as number));
  const untimed = segments.filter((s) => typeof s.startMs !== "number");
  const ordered = [...timed, ...untimed];

  const providerText =
    typeof body.text === "string" ? body.text.trim().slice(0, 100_000) : "";
  const text = providerText || ordered.map((s) => s.text).join(" ");

  const language =
    typeof body.language === "string" && body.language.trim()
      ? body.language.trim().slice(0, 40)
      : undefined;

  return {
    text,
    segments: ordered.length > 0 ? ordered : undefined,
    ...(language ? { language } : {}),
    // Whisper-style endpoints do not diarize; a speaker label is only kept if
    // the provider actually sent one (see parse above).
    diarized: ordered.some((s) => typeof s.speaker === "string"),
  };
}

// ---------------------------------------------------------------------------
// Provider call — timeout + bounded retry
// ---------------------------------------------------------------------------

export type FetchLike = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: unknown;
    signal?: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}>;

/** Bounded, key-free description of a provider failure for storage/UI. */
export function describeSttError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err ?? "");
  const status = message.match(/stt-http-(\d{3})/);
  if (status) return `stt-http-${status[1]}`;
  if (/abort|timeout/i.test(message)) return "stt-timeout";
  if (/stt-parse|invalid transcription/i.test(message)) return "stt-invalid-response";
  if (/fetch|network|ECONN|ENOTFOUND/i.test(message)) return "stt-network-error";
  return "stt-provider-error";
}

function retryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

/**
 * POST the audio to an OpenAI-compatible `/audio/transcriptions` endpoint.
 *
 * Retries ONLY transient failures (network, timeout, 408/409/429/5xx); auth and
 * bad-request responses fail immediately so a wrong key is not hammered. The
 * API key is never included in any thrown message.
 */
export async function transcribeAudio(args: {
  config: Extract<SttConfig, { configured: true }>;
  bytes: Uint8Array;
  mimeType: string;
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
}): Promise<SttResult> {
  const { config, bytes, mimeType } = args;
  const doFetch = args.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  const sleep =
    args.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  let lastError: unknown = null;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const form = new FormData();
      form.append(
        "file",
        new Blob([new Uint8Array(bytes)], { type: mimeType || "audio/mpeg" }),
        `recording.${extensionFor(mimeType)}`,
      );
      form.append("model", config.model);
      form.append("response_format", "verbose_json");
      form.append("timestamp_granularities[]", "segment");

      const res = await doFetch(config.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.apiKey}` },
        body: form,
        signal: controller.signal,
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        const err = new Error(
          `stt-http-${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
        );
        if (attempt < config.maxAttempts && retryableStatus(res.status)) {
          lastError = err;
          await sleep(400 * attempt);
          continue;
        }
        throw err;
      }

      let parsed: unknown;
      try {
        parsed = await res.json();
      } catch {
        throw new Error("stt-parse-error: provider did not return JSON");
      }

      const result = parseSttResponse(parsed);
      if (!result.text && !result.segments) {
        throw new Error("stt-parse-error: transcription contained no text");
      }
      return result;
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : "";
      const isAbort = /abort/i.test(message);
      const isNetwork = !/stt-http-|stt-parse-/.test(message);
      const retryable = isAbort || isNetwork;
      if (attempt < config.maxAttempts && retryable) {
        await sleep(400 * attempt);
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError ?? new Error("stt-provider-error");
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

/**
 * Delimited, bounded transcript block. Both the transcript and the reporter's
 * own context are untrusted data: the caller's system prompt states that
 * instructions inside them must never be followed.
 */
export function buildTranscriptBlock(
  text: string,
  segments: SttSegment[] | null,
  context: string,
): string {
  const MAX_CHARS = 24_000;
  let body = "";
  if (segments && segments.length > 0) {
    body = segments
      .slice(0, 400)
      .map((s) => {
        const t =
          typeof s.startMs === "number"
            ? `[${(s.startMs / 1000).toFixed(1)}s]`
            : "";
        const who = s.speaker ? `${s.speaker}: ` : "";
        return `${t} ${who}${s.text}`;
      })
      .join("\n");
  } else {
    body = text;
  }
  if (body.length > MAX_CHARS) body = body.slice(0, MAX_CHARS);
  const ctxBlock = context
    ? `<call_context>\n${context.slice(0, 2_000)}\n</call_context>\n\n`
    : "";
  return `${ctxBlock}<transcript>\n${body}\n</transcript>`;
}

// ---------------------------------------------------------------------------
// Grounding: timestamps, excerpts, indicators
// ---------------------------------------------------------------------------

/** Lowercase alphanumerics only — tolerant of formatting, strict about content. */
export function normaliseForMatch(value: string): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export type GroundedFindings<T extends { excerpt: string; observed: boolean; timestampMs?: number }> = {
  findings: T[];
  /** Timestamps removed because no segment was within tolerance. */
  droppedTimestamps: number;
  /** Findings that claimed `observed` but whose quote was not in the transcript. */
  unobservedExcerpts: number;
  /** Findings that kept a real, grounded timestamp. */
  groundedTimestamps: number;
};

/**
 * Attach every model timestamp to a REAL segment start, or remove it.
 *
 * A finding may only carry `timestampMs` when a supplied segment starts within
 * `TIMESTAMP_TOLERANCE_MS`; the value is snapped to that segment's start so the
 * UI seeks to an actual audio position. `observed: true` additionally requires
 * the quoted excerpt to appear in the transcript — otherwise it is downgraded
 * to an interpretation rather than presented as something that was said.
 */
export function groundFindings<
  T extends { excerpt: string; observed: boolean; timestampMs?: number },
>(findings: T[], segments: SttSegment[] | null, transcript: string): GroundedFindings<T> {
  const starts = (segments ?? [])
    .map((s) => s.startMs)
    .filter((n): n is number => typeof n === "number");
  const haystack = normaliseForMatch(transcript);

  let droppedTimestamps = 0;
  let unobservedExcerpts = 0;
  let groundedTimestamps = 0;

  const grounded = findings.map((finding) => {
    let next = { ...finding };

    if (typeof finding.timestampMs === "number") {
      let best: number | null = null;
      for (const start of starts) {
        if (Math.abs(start - finding.timestampMs) <= TIMESTAMP_TOLERANCE_MS) {
          if (best === null || Math.abs(start - finding.timestampMs) < Math.abs(best - finding.timestampMs)) {
            best = start;
          }
        }
      }
      if (best === null) {
        delete (next as { timestampMs?: number }).timestampMs;
        droppedTimestamps += 1;
      } else {
        (next as { timestampMs?: number }).timestampMs = best;
        groundedTimestamps += 1;
      }
    }

    if (finding.observed) {
      const quote = normaliseForMatch(finding.excerpt);
      if (quote.length < 4 || !haystack.includes(quote)) {
        (next as { observed: boolean }).observed = false;
        unobservedExcerpts += 1;
      }
    }

    return next;
  });

  return { findings: grounded, droppedTimestamps, unobservedExcerpts, groundedTimestamps };
}

export type RawIndicator = {
  type: string;
  value: string;
  context?: string;
};

/**
 * De-duplicate indicators on (type, normalised value) and keep only values that
 * actually appear in the transcript. Extraction is a quote, not a lookup: an
 * identifier the model produced from thin air is dropped, never shown.
 */
/**
 * Phone numbers are quoted inconsistently ("+91 98765 43210", "09876543210",
 * "9876543210"). These are the variants tried against the transcript, longest
 * first, so the same number still matches after formatting is removed.
 */
function phoneMatchVariants(normalised: string): string[] {
  const variants = new Set<string>([normalised]);
  const noTrunk = normalised.replace(/^0+/, "");
  variants.add(noTrunk);
  for (const prefix of ["0091", "91"]) {
    if (noTrunk.startsWith(prefix) && noTrunk.length - prefix.length >= 7) {
      variants.add(noTrunk.slice(prefix.length));
    }
  }
  return [...variants].filter((v) => v.length >= 6).sort((a, b) => b.length - a.length);
}

export function groundIndicators<T extends RawIndicator>(
  indicators: T[],
  transcript: string,
): { indicators: T[]; dropped: number; duplicates: number } {
  const haystack = normaliseForMatch(transcript);
  const seen = new Set<string>();
  const kept: T[] = [];
  let dropped = 0;
  let duplicates = 0;

  for (const indicator of indicators) {
    const value = (indicator.value ?? "").trim();
    const normalised = normaliseForMatch(value);
    if (normalised.length < 3) {
      dropped += 1;
      continue;
    }

    const candidates =
      indicator.type === "phone" ? phoneMatchVariants(normalised) : [normalised];
    const matched = candidates.find((candidate) => haystack.includes(candidate));
    if (!matched) {
      dropped += 1;
      continue;
    }

    // De-duplicate on what actually matched, so two spellings of the same
    // number collapse into one entry.
    const key = `${indicator.type}:${matched}`;
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    kept.push({ ...indicator, value });
  }

  return { indicators: kept, dropped, duplicates };
}
