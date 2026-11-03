/**
 * Voice-intelligence data layer.
 *
 * Thin, typed wrappers over the EXISTING Convex voice backend
 * (`src/convex/voice.ts` + `voiceActions.ts`). Nothing here duplicates server
 * logic: upload caps, consent version, hashing and the processing pipeline all
 * live server-side, and this module only exposes them to the UI.
 */
import { useAction, useMutation, useQuery } from "convex/react";
import type { Id } from "@convex-dataModel";
import { api } from "./api";
import type {
  TranscriptSegment,
  VoiceAssessment,
  VoiceProcessingResult,
  VoiceQueueRow,
  VoiceRecording,
} from "../types/voice";

const id = (value: string) => value as Id<"voice_recordings">;

/** This account's submitted recordings, newest first. */
export function useVoiceQueue(): VoiceQueueRow[] | undefined {
  const data = useQuery(api.voice.getConsumerQueue) as
    | { rows: VoiceQueueRow[] }
    | undefined;
  return data?.rows;
}

/** One recording the signed-in user owns (live-updating while processing). */
export function useVoiceRecording(recordingId?: string | null) {
  const data = useQuery(
    api.voice.getVoiceRecording,
    recordingId ? { recordingId: id(recordingId) } : "skip",
  ) as VoiceRecording | undefined;
  return { recording: data, loading: data === undefined };
}

/**
 * Short-lived signed playback URL. `asInvestigator` is left false on purpose —
 * consumer screens must never request cross-owner access.
 */
export function useVoiceAudioUrl(recordingId?: string | null) {
  const data = useQuery(
    api.voice.getAudioUrl,
    recordingId ? { recordingId: id(recordingId) } : "skip",
  ) as { restricted: boolean; url: string | null; mimeType: string | null } | undefined;
  return { url: data?.url ?? null, restricted: data?.restricted ?? false };
}

/** Run transcription + AI analysis. Idempotent from the UI's point of view. */
export function useProcessVoiceRecording() {
  const run = useAction(api.voiceActions.processRecording);
  return (recordingId: string) =>
    run({ recordingId: id(recordingId) }) as Promise<VoiceProcessingResult>;
}

/** Replace/keep a transcript the user typed themselves (never overwrites a machine one). */
export function useSubmitTranscript() {
  return useMutation(api.voice.submitConsumerTranscript);
}

/** Delete the recording and its stored audio (user-controlled removal). */
export function useDeleteVoiceRecording() {
  return useMutation(api.voice.deleteVoiceRecording);
}

// ---------------------------------------------------------------------------
// Presentation helpers (pure — no data fetching)
// ---------------------------------------------------------------------------

export const ASSESSMENT_COPY: Record<
  VoiceAssessment,
  { label: string; short: string; tone: "danger" | "warning" | "mint" | "neutral" }
> = {
  HIGH_CONCERN: {
    label: "High concern",
    short: "Several strong scam warning signs were found.",
    tone: "danger",
  },
  WARNING_SIGNS_FOUND: {
    label: "Warning signs found",
    short: "Some scam warning signs were found. Stay cautious.",
    tone: "warning",
  },
  NO_OBVIOUS_WARNING_SIGNS: {
    label: "No obvious warning signs",
    short: "Nothing clearly scam-like was found — this is not a guarantee.",
    tone: "mint",
  },
  UNABLE_TO_ASSESS: {
    label: "Couldn’t assess",
    short: "There wasn’t enough usable transcript to assess.",
    tone: "neutral",
  },
};

export const SEVERITY_LABEL: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

/** 0:07 / 1:02:03 — only ever formats a real millisecond value. */
export function formatTimestamp(ms?: number | null): string | null {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return null;
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`;
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Segments are only usable when the provider actually returned timings. */
export function timedSegments(
  segments: TranscriptSegment[] | null | undefined,
): TranscriptSegment[] {
  return (segments ?? []).filter(
    (s) => typeof s.startMs === "number" && s.text.trim().length > 0,
  );
}

/** True when at least one finding carries a real timestamp from the audio. */
export function hasTimedFindings(findings: { timestampMs?: number }[]): boolean {
  return findings.some((f) => typeof f.timestampMs === "number");
}

/** Human label for a transcription/analysis status. */
export function statusLabel(status: string): string {
  switch (status) {
    case "NOT_STARTED":
      return "Not started";
    case "PROCESSING":
      return "In progress";
    case "COMPLETED":
      return "Ready";
    case "FAILED":
      return "Failed";
    case "UNAVAILABLE":
      return "Not available";
    default:
      return status;
  }
}
