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
  /** Whisper metadata: probability the segment contains no speech (0-1). */
  noSpeechProb?: number;
  /** Whisper metadata: average log-probability of the decoded tokens. */
  avgLogprob?: number;
  compressionRatio?: number;
};

export type SttResult = {
  text: string;
  /** Present only when the provider returned real segment timings. */
  segments?: SttSegment[];
  language?: string;
  /** True only when the provider actually labels who spoke. */
  diarized: boolean;
  /** Speech/no-speech evidence computed from provider metadata. */
  speech?: SpeechAssessment;
};

/**
 * Default speech-to-text provider: Groq Cloud's OpenAI-compatible audio API.
 * `whisper-large-v3-turbo` is the multilingual turbo model ($0.04/audio-hour),
 * and Groq returns `verbose_json` with real segment timestamps, which the
 * grounding step needs. Both values remain overridable per deployment via
 * STT_ENDPOINT / STT_MODEL, so any compatible provider still works.
 */
export const DEFAULT_STT_ENDPOINT = "https://api.groq.com/openai/v1";
export const DEFAULT_STT_MODEL = "whisper-large-v3-turbo";
export const DEFAULT_STT_PROVIDER_NAME = "groq";
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

/**
 * Label for the provider actually being called, so stored metadata never
 * claims Groq when the endpoint points elsewhere. An explicit
 * STT_PROVIDER_NAME always wins.
 */
function providerNameFor(endpointUrl: string, explicit: string | undefined): string {
  const named = (explicit ?? "").trim();
  if (named) return named;
  try {
    const host = new URL(endpointUrl).hostname;
    if (host === "api.groq.com") return DEFAULT_STT_PROVIDER_NAME;
    if (host === "api.openai.com") return "openai";
  } catch {
    // URL was already validated by sttTranscriptionUrl.
  }
  return "openai-compatible-stt";
}

/** Single source of truth for how a deployment configures speech-to-text. */
export function resolveSttConfig(
  env: Record<string, string | undefined>,
): SttConfig {
  // STT_API_KEY is the generic name; GROQ_API_KEY is accepted so a key added
  // for Groq works without a second, differently named secret.
  const apiKey =
    (env.STT_API_KEY ?? "").trim() || (env.GROQ_API_KEY ?? "").trim();
  if (!apiKey) {
    return {
      configured: false,
      reason: "missing-key",
      detail:
        "Neither GROQ_API_KEY nor STT_API_KEY is set on this deployment, so audio cannot be transcribed.",
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
    name: providerNameFor(url, env.STT_PROVIDER_NAME),
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
        no_speech_prob?: unknown;
        avg_logprob?: unknown;
        compression_ratio?: unknown;
      };
      const start = finiteSeconds(s.start);
      const end = finiteSeconds(s.end);
      const startMs =
        start === null ? undefined : Math.max(0, Math.round(start * 1000));
      const endMs =
        end === null
          ? undefined
          : Math.max(startMs ?? 0, Math.max(0, Math.round(end * 1000)));
      const noSpeechProb = finiteSeconds(s.no_speech_prob);
      const avgLogprob = finiteSeconds(s.avg_logprob);
      const compressionRatio = finiteSeconds(s.compression_ratio);
      return {
        ...(typeof s.speaker === "string" && s.speaker.trim()
          ? { speaker: s.speaker.trim().slice(0, 40) }
          : {}),
        ...(startMs !== undefined ? { startMs } : {}),
        ...(endMs !== undefined ? { endMs } : {}),
        text: typeof s.text === "string" ? s.text.trim() : "",
        ...(noSpeechProb !== null
          ? { noSpeechProb: Math.min(1, Math.max(0, noSpeechProb)) }
          : {}),
        ...(avgLogprob !== null ? { avgLogprob } : {}),
        ...(compressionRatio !== null ? { compressionRatio } : {}),
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
// Speech / no-speech evidence
// ---------------------------------------------------------------------------

/**
 * Deliberately conservative: a segment is only treated as silence when the
 * provider's no-speech probability is high AND the decode confidence is poor.
 * Quiet but genuine speech (low amplitude, confidently decoded) stays in.
 */
export const NO_SPEECH_PROB_THRESHOLD = 0.6;
export const AVG_LOGPROB_THRESHOLD = -1;
/** Below this, an audio file cannot contain a spoken word. */
export const MIN_SPEECH_AUDIO_MS = 250;
/**
 * Peak amplitude below which a WAV is digitally silent (no signal at all).
 * Deliberately tiny: this must never reject quiet-but-real speech, only audio
 * that contains no signal whatsoever.
 */
export const DIGITAL_SILENCE_PEAK = 1e-4;

export type SpeechAssessment = {
  /** False ONLY when the evidence supports "no speech". */
  speechDetected: boolean;
  /** True when there was enough evidence to make a call either way. */
  confident: boolean;
  reason: "speech" | "no-speech" | "insufficient-metadata";
  detail: "audio-too-short" | "provider-metadata" | "digital-silence" | null;
  meanNoSpeechProb: number | null;
  meanAvgLogprob: number | null;
};

/** Raised instead of storing a transcript when the audio has no speech. */
export class NoSpeechError extends Error {
  readonly assessment: SpeechAssessment;

  constructor(assessment: SpeechAssessment) {
    super("stt-no-speech");
    this.name = "NoSpeechError";
    this.assessment = assessment;
  }
}

/**
 * Decide whether the audio actually contains speech.
 *
 * Missing metadata is never treated as silence: the provider simply did not
 * tell us, so the transcript stands (labelled unverified by the caller). This
 * is what stops a silent recording from being "successfully" transcribed into
 * a hallucinated stock phrase, without rejecting quiet real speech.
 */
export function assessSpeech(input: {
  segments: SttSegment[] | null | undefined;
  durationMs?: number | null;
  /** Measured signal level, when the audio format allowed measuring it. */
  signal?: { peak: number } | null;
}): SpeechAssessment {
  const duration = input.durationMs;
  const segments = input.segments ?? [];

  const judged = segments.filter(
    (s) => s.noSpeechProb !== undefined || s.avgLogprob !== undefined,
  );
  const probs = judged
    .map((s) => s.noSpeechProb)
    .filter((n): n is number => typeof n === "number");
  const logprobs = judged
    .map((s) => s.avgLogprob)
    .filter((n): n is number => typeof n === "number");
  const mean = (values: number[]): number | null =>
    values.length
      ? Math.round(
          (values.reduce((a, b) => a + b, 0) / values.length) * 1_000,
        ) / 1_000
      : null;
  const meanNoSpeechProb = mean(probs);
  const meanAvgLogprob = mean(logprobs);

  if (
    typeof duration === "number" &&
    duration > 0 &&
    duration < MIN_SPEECH_AUDIO_MS
  ) {
    return {
      speechDetected: false,
      confident: true,
      reason: "no-speech",
      detail: "audio-too-short",
      meanNoSpeechProb,
      meanAvgLogprob,
    };
  }

  // Provider metadata is not always usable: Groq's turbo model has been
  // observed returning no_speech_prob 0 for a digitally silent file while
  // still hallucinating "Thank you.". Measured signal level does not lie.
  if (input.signal && input.signal.peak <= DIGITAL_SILENCE_PEAK) {
    return {
      speechDetected: false,
      confident: true,
      reason: "no-speech",
      detail: "digital-silence",
      meanNoSpeechProb,
      meanAvgLogprob,
    };
  }

  if (judged.length === 0) {
    return {
      speechDetected: true,
      confident: false,
      reason: "insufficient-metadata",
      detail: null,
      meanNoSpeechProb: null,
      meanAvgLogprob: null,
    };
  }

  const everySegmentSilent = judged.every((s) => {
    const probSilent =
      s.noSpeechProb === undefined
        ? null
        : s.noSpeechProb >= NO_SPEECH_PROB_THRESHOLD;
    const logprobSilent =
      s.avgLogprob === undefined ? null : s.avgLogprob <= AVG_LOGPROB_THRESHOLD;
    if (probSilent === null) return logprobSilent === true;
    if (logprobSilent === null) return probSilent;
    return probSilent && logprobSilent;
  });

  if (everySegmentSilent) {
    return {
      speechDetected: false,
      confident: true,
      reason: "no-speech",
      detail: "provider-metadata",
      meanNoSpeechProb,
      meanAvgLogprob,
    };
  }

  return {
    speechDetected: true,
    confident: true,
    reason: "speech",
    detail: null,
    meanNoSpeechProb,
    meanAvgLogprob,
  };
}

export type WavSignal = { durationMs: number; peak: number; rms: number };

/**
 * Measure an uncompressed 16-bit PCM WAV. Returns null for compressed or
 * unusual formats, so callers fall back to provider metadata only.
 * Peak/RMS are normalised to 0..1 of full scale.
 */
export function wavSignal(bytes: Uint8Array): WavSignal | null {
  if (bytes.byteLength < 44) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number) =>
    String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3),
    );
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;

  let offset = 12;
  let byteRate = 0;
  let audioFormat = 0;
  let bitsPerSample = 0;
  let dataOffset = -1;
  let dataBytes = 0;
  while (offset + 8 <= view.byteLength) {
    const id = tag(offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "fmt ") {
      if (size < 16 || body + 16 > view.byteLength) return null;
      audioFormat = view.getUint16(body, true);
      byteRate = view.getUint32(body + 8, true);
      bitsPerSample = view.getUint16(body + 14, true);
    } else if (id === "data") {
      dataOffset = body;
      dataBytes = Math.min(size, view.byteLength - body);
      break;
    }
    offset = body + size + (size % 2);
  }

  if (audioFormat !== 1 || bitsPerSample !== 16 || !byteRate || dataOffset < 0) {
    return null;
  }
  const samples = Math.floor(dataBytes / 2);
  if (samples <= 0) return null;

  let peak = 0;
  let sumSquares = 0;
  for (let i = 0; i < samples; i += 1) {
    const value = view.getInt16(dataOffset + i * 2, true) / 32_768;
    if (Math.abs(value) > peak) peak = Math.abs(value);
    sumSquares += value * value;
  }

  return {
    durationMs: Math.round((dataBytes / byteRate) * 1000),
    peak: Math.round(peak * 1e6) / 1e6,
    rms: Math.round(Math.sqrt(sumSquares / samples) * 1e6) / 1e6,
  };
}

/**
 * Duration of an uncompressed PCM WAV from its headers, or null when the bytes
 * are not a parseable WAV (compressed formats are left to the provider).
 * Used as a second, provider-independent signal for very short audio.
 */
export function wavDurationMs(bytes: Uint8Array): number | null {
  if (bytes.byteLength < 44) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number) =>
    String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3),
    );
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;

  let offset = 12;
  let byteRate = 0;
  let dataBytes = 0;
  while (offset + 8 <= view.byteLength) {
    const id = tag(offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "fmt ") {
      if (size < 12 || body + 12 > view.byteLength) return null;
      byteRate = view.getUint32(body + 8, true);
    } else if (id === "data") {
      dataBytes = Math.min(size, view.byteLength - body);
      break;
    }
    offset = body + size + (size % 2);
  }
  if (!byteRate || !dataBytes) return null;
  const ms = Math.round((dataBytes / byteRate) * 1000);
  return ms > 0 ? ms : null;
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
  if (/stt-no-speech/i.test(message)) return "stt-no-speech";
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
      // A non-empty transcript is NOT proof of speech: Whisper hallucinates
      // stock phrases on silence. Reject only on positive evidence of silence.
      const signal = wavSignal(bytes);
      const speech = assessSpeech({
        segments: result.segments,
        durationMs: signal?.durationMs ?? wavDurationMs(bytes),
        signal,
      });
      if (!speech.speechDetected && speech.confident) {
        throw new NoSpeechError(speech);
      }
      return { ...result, speech };
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : "";
      const isAbort = /abort/i.test(message);
      const isNetwork = !/stt-http-|stt-parse-|stt-no-speech/.test(message);
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
