/**
 * Voice analysis orchestration + timeline derivation.
 *
 * The server does the real work (transcription, AI analysis, validation). This
 * module only:
 *  - triggers processing and normalises the outcome,
 *  - turns findings into a timeline, and
 *  - refuses to invent timestamps or speaker labels that the backend did not
 *    supply.
 */
import type {
  Severity,
  TranscriptSegment,
  VoiceFinding,
  VoiceIndicator,
  VoiceProcessingResult,
  VoiceRecording,
} from "../../../types/voice";
import { formatTimestamp, hasTimedFindings, timedSegments } from "../../../services/voice-intelligence";

export type TimelineEntry = {
  id: string;
  finding: VoiceFinding;
  /** Real audio position, only when the backend supplied one. */
  timestampMs?: number;
  timestampLabel: string | null;
  excerpt: string;
  tactic: string;
  explanation: string;
  recommendedAction: string;
  severity: Severity;
  confidence: string;
  observed: boolean;
};

/**
 * Build the suspicious-statement timeline.
 *
 * Findings with a real `timestampMs` are ordered by audio position; findings
 * without one keep their transcript order and are grouped after the timed ones
 * — but the UI labels that clearly instead of faking a position.
 */
export function buildTimeline(findingList: VoiceFinding[] | null | undefined): TimelineEntry[] {
  const findings = findingList ?? [];
  const toEntry = (finding: VoiceFinding): TimelineEntry => ({
    id: finding.id,
    finding,
    ...(typeof finding.timestampMs === "number"
      ? { timestampMs: finding.timestampMs }
      : {}),
    timestampLabel: formatTimestamp(finding.timestampMs),
    excerpt: finding.excerpt,
    tactic: finding.tactic,
    explanation: finding.explanation,
    recommendedAction: finding.recommendedAction,
    severity: finding.severity,
    confidence: finding.confidence,
    observed: finding.observed,
  });

  const timed = findings
    .filter((f) => typeof f.timestampMs === "number")
    .sort((a, b) => (a.timestampMs ?? 0) - (b.timestampMs ?? 0));
  const untimed = findings.filter((f) => typeof f.timestampMs !== "number");

  const severityRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
  untimed.sort(
    (a, b) => (severityRank[a.severity] ?? 3) - (severityRank[b.severity] ?? 3),
  );

  return [...timed.map(toEntry), ...untimed.map(toEntry)];
}

export function timelineIsTimed(entries: TimelineEntry[]): boolean {
  return entries.some((e) => typeof e.timestampMs === "number");
}

/** Whether the recording actually carries usable timings at all. */
export function recordingHasTimings(recording: VoiceRecording | undefined): boolean {
  if (!recording) return false;
  if (timedSegments(recording.transcriptSegments).length > 0) return true;
  return hasTimedFindings(recording.analysis.findings ?? []);
}

/** Highest-severity finding — the "main concern" shown at the top of results. */
export function mainConcern(findings: VoiceFinding[] | null | undefined): VoiceFinding | null {
  const list = findings ?? [];
  if (list.length === 0) return null;
  const rank: Record<string, number> = { high: 0, medium: 1, low: 2 };
  return [...list].sort((a, b) => (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3))[0];
}

export const INDICATOR_LABEL: Record<VoiceIndicator["type"], string> = {
  phone: "Phone number",
  url: "Link",
  upi: "UPI ID",
  organization: "Organisation mentioned",
  payment_instruction: "Payment instruction",
  other: "Other detail",
};

/** Group quoted identifiers by type for display (never de-dupes across types). */
export function groupIndicators(
  indicators: VoiceIndicator[] | null | undefined,
): { type: VoiceIndicator["type"]; label: string; items: VoiceIndicator[] }[] {
  const byType = new Map<VoiceIndicator["type"], VoiceIndicator[]>();
  for (const indicator of indicators ?? []) {
    const bucket = byType.get(indicator.type) ?? [];
    bucket.push(indicator);
    byType.set(indicator.type, bucket);
  }
  return Array.from(byType.entries()).map(([type, items]) => ({
    type,
    label: INDICATOR_LABEL[type] ?? "Detail",
    items,
  }));
}

export type ProcessingOutcome =
  | { ok: true; result: VoiceProcessingResult }
  | { ok: false; message: string };

/** Kick off processing and report the outcome without throwing at the caller. */
export async function processRecording(
  recordingId: string,
  run: (id: string) => Promise<VoiceProcessingResult>,
): Promise<ProcessingOutcome> {
  try {
    return { ok: true, result: await run(recordingId) };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error
          ? err.message
          : "Processing could not be completed. You can retry.",
    };
  }
}

/** Speaker labels are surfaced only when the provider really supplied them. */
export function segmentsWithSpeakers(
  segments: TranscriptSegment[] | null | undefined,
): TranscriptSegment[] {
  return (segments ?? []).filter((s) => Boolean(s.speaker));
}

/**
 * Plain-language reason shown when a step could not run, derived from the real
 * server error code — never a generic "something went wrong" that hides a
 * missing provider.
 */
export function describeProcessingError(
  step: "transcription" | "analysis",
  error: string | null | undefined,
): string | null {
  if (!error) return null;
  if (error === "no-provider" || error === "no-transcript") {
    return "Automatic transcription isn’t available right now, so the audio itself couldn’t be read. You can type what was said and analyse that instead.";
  }
  if (error === "integrity-check-failed") {
    return "The stored recording could not be verified against its recorded fingerprint, so it was not analysed.";
  }
  if (error === "empty-transcript") {
    return "No speech could be recognised in this recording.";
  }
  if (error === "transcription-failed" || error === "provider-error") {
    return "Transcription failed. You can retry, or add what was said yourself.";
  }
  if (error === "no-api-key") {
    return "AI analysis isn’t configured right now, so no assessment was produced.";
  }
  // Provider rate limits / outages are transient and retryable. The transcript
  // (and the recording) are already saved, so say that instead of implying the
  // whole submission failed.
  if (error === "groq-rate-limited") {
    return "The AI provider is rate-limiting requests right now. Your transcript is saved — try again in a moment.";
  }
  if (error === "groq-unavailable" || error === "groq-network") {
    return "The AI provider is temporarily unreachable. Your transcript is saved — try again shortly.";
  }
  if (error === "groq-timeout") {
    return "The AI provider took too long to respond. Your transcript is saved — try again.";
  }
  if (error === "groq-truncated") {
    return "The AI response was cut off before it finished, so it was discarded rather than shown incomplete. You can retry.";
  }
  if (error === "groq-invalid-response" || error === "groq-empty-response") {
    return "The AI provider returned an unusable response, so no findings were shown. You can retry — nothing was invented.";
  }
  if (error === "groq-auth" || error === "groq-rejected") {
    return "AI analysis could not run because the provider rejected the request. No result was produced.";
  }
  if (/^stt-http-429$/.test(error) || /^stt-http-5\d\d$/.test(error)) {
    return "Speech-to-text is temporarily unavailable (the provider was busy). The original recording is saved — try again.";
  }
  if (error === "stt-timeout" || error === "stt-network-error") {
    return "Speech-to-text couldn’t reach the provider. Your recording is saved — check your connection and try again.";
  }
  if (step === "analysis") {
    return "The AI analysis could not be completed. You can retry — no result was invented.";
  }
  return null;
}
