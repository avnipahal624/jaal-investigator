"use node";

/**
 * Speech-to-text connectivity diagnostic.
 *
 * Internal-only (never callable from a client). It resolves the SAME provider
 * configuration as `voiceActions.ts` and sends real speech through the SAME
 * upload path, so a green result means the production pipeline can transcribe.
 *
 * It returns a small, non-sensitive report:
 *  - whether a key exists on this deployment and its rough shape (never the
 *    value and never a fragment of it),
 *  - which provider/model/endpoint the configuration resolves to,
 *  - the provider's verdict on authentication,
 *  - whether transcription returned, and how many words of a known speech
 *    sample were recognised (so silence-hallucination cannot pass as success).
 *
 * The speech sample is a public-domain Harvard/IEEE sentence recording whose
 * text is fixed below. If it cannot be fetched, the check falls back to one
 * second of silence, which can still prove authentication works but not word
 * accuracy — and the report says which source was used.
 */

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import {
  describeSttError,
  resolveSttConfig,
  transcribeAudio,
  type SttConfig,
} from "./voicePipeline";

/** Public-domain Harvard sentence recording (10 sentences, ~13s, 8 kHz WAV). */
const SAMPLE_AUDIO_URL =
  "https://www.voiptroubleshooter.com/open_speech/american/OSR_us_000_0010_8k.wav";
const SAMPLE_REFERENCE_TEXT = [
  "The birch canoe slid on the smooth planks.",
  "Glue the sheet to the dark blue background.",
  "It's easy to tell the depth of a well.",
  "These days a chicken leg is a rare dish.",
  "Rice is often served in round bowls.",
  "The juice of lemons makes fine punch.",
  "The box was thrown beside the parked truck.",
  "The hogs were fed chopped corn and garbage.",
  "Four hours of steady work faced us.",
  "A large size in stockings is hard to sell.",
].join(" ");

/** 1s of 16 kHz mono 16-bit PCM silence, with a valid RIFF header. */
function silentWav(): Uint8Array {
  const sampleRate = 16_000;
  const dataBytes = sampleRate * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, dataBytes, true);
  return new Uint8Array(buffer);
}

/** Rough shape only — enough to spot an empty or truncated paste, no content. */
function keyShape(key: string) {
  const length = key.trim().length;
  return {
    present: length > 0,
    lengthBand: length < 40 ? "<40" : length <= 80 ? "40-80" : ">80",
    hasGroqPrefix: key.trim().startsWith("gsk_"),
    hasWhitespace: key !== key.trim() || /\s/.test(key.trim()),
  };
}

type SpeechAttempt =
  | { ok: true; bytes: Uint8Array; mimeType: string; source: "sample" }
  | { ok: false; status: number | null; reason: string };

async function fetchSampleSpeech(): Promise<SpeechAttempt> {
  try {
    const res = await fetch(SAMPLE_AUDIO_URL, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return { ok: false, status: res.status, reason: "sample-http" };
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength < 1024) {
      return { ok: false, status: res.status, reason: "sample-empty" };
    }
    if (bytes.byteLength > 24_000_000) {
      return { ok: false, status: res.status, reason: "sample-too-large" };
    }
    return { ok: true, bytes, mimeType: "audio/wav", source: "sample" };
  } catch (err) {
    return {
      ok: false,
      status: null,
      reason: /abort|timeout/i.test(String(err)) ? "sample-timeout" : "sample-network",
    };
  }
}

/** Fraction of reference words (4+ letters) that appear in the transcript. */
function wordAgreement(transcript: string, reference: string) {
  const normalise = (text: string) =>
    text.toLowerCase().replace(/[^a-z0-9\s']/g, " ").replace(/\s+/g, " ").trim();
  const heard = new Set(normalise(transcript).split(" "));
  const words = normalise(reference)
    .split(" ")
    .filter((w) => w.length > 3);
  const matched = words.filter((w) => heard.has(w)).length;
  return { matched, total: words.length };
}

export const check = internalAction({
  args: { allowSpeechSample: v.optional(v.boolean()) },
  handler: async (_ctx, args) => {
    const stt = resolveSttConfig(process.env);
    const env = {
      groqKey: keyShape(process.env.GROQ_API_KEY ?? ""),
      genericSttKey: keyShape(process.env.STT_API_KEY ?? ""),
      sttEndpointOverride: Boolean((process.env.STT_ENDPOINT ?? "").trim()),
      sttModelOverride: Boolean((process.env.STT_MODEL ?? "").trim()),
    };

    if (!stt.configured) {
      return { configured: false, reason: stt.reason, detail: stt.detail, env };
    }

    const endpoint = (() => {
      try {
        const url = new URL(stt.url);
        return { host: url.hostname, path: url.pathname };
      } catch {
        return { host: "invalid", path: "" };
      }
    })();

    let attempt: SpeechAttempt | null = null;
    if (args.allowSpeechSample !== false) attempt = await fetchSampleSpeech();

    const audio = attempt?.ok
      ? { bytes: attempt.bytes, mimeType: attempt.mimeType }
      : { bytes: silentWav(), mimeType: "audio/wav" };
    const speech = {
      source: attempt?.ok ? ("public-speech-sample" as const) : ("synthetic-silence" as const),
      sampleStatus: attempt && !attempt.ok ? attempt.status : null,
      sampleFailure: attempt && !attempt.ok ? attempt.reason : null,
    };

    const startedAt = Date.now();
    try {
      const result = await transcribeAudio({
        config: stt,
        bytes: audio.bytes,
        mimeType: audio.mimeType,
      });
      const text = result.text.trim();
      const agreement =
        speech.source === "public-speech-sample"
          ? wordAgreement(text, SAMPLE_REFERENCE_TEXT)
          : null;
      return {
        configured: true,
        env,
        provider: {
          name: stt.name,
          model: stt.model,
          endpointHost: endpoint.host,
          endpointPath: endpoint.path,
        },
        auth: "ok" as const,
        speech,
        transcription: {
          ok: true,
          textLength: text.length,
          segmentCount: result.segments?.length ?? 0,
          language: result.language ?? null,
          diarized: result.diarized,
          hasTimestamps: Boolean(
            result.segments?.some((s) => s.startMs !== undefined),
          ),
          referenceWordMatches: agreement?.matched ?? null,
          referenceWordTotal: agreement?.total ?? null,
          latencyMs: Date.now() - startedAt,
        },
      };
    } catch (err) {
      const code = describeSttError(err);
      // `stt-invalid-response` can only be thrown after a 2xx body was read,
      // so authentication demonstrably succeeded even with no words returned.
      const auth =
        code === "stt-http-401" || code === "stt-http-403"
          ? ("rejected" as const)
          : code === "stt-invalid-response"
            ? ("ok" as const)
            : ("unknown" as const);
      return {
        configured: true,
        env,
        provider: {
          name: stt.name,
          model: stt.model,
          endpointHost: endpoint.host,
          endpointPath: endpoint.path,
        },
        auth,
        speech,
        transcription: {
          ok: false,
          code,
          latencyMs: Date.now() - startedAt,
        },
      };
    }
  },
});
