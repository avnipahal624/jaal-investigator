/**
 * Report summary assembly.
 *
 * A voice report is created by the existing `voice.createVoiceReport` mutation
 * (it creates a normal JAAL investigation of category "Voice scam" and attaches
 * the recording). This module only assembles what to show the user about that
 * report: the reference, the evidence facts, and safe next steps.
 *
 * It never invents official phone numbers, helplines or legal claims.
 */
import type { IntakeStatus, VoiceRecording } from "../../../types/voice";
import { formatBytes } from "../../../services/voice-intelligence";
import { groupIndicators } from "./voice-analysis-service";

export type EvidenceFact = { label: string; value: string };

export type VoiceReportSummaryModel = {
  caseId: string;
  fileName: string;
  headline: string;
  concern: string | null;
  nextSteps: string[];
  indicators: ReturnType<typeof groupIndicators>;
  evidence: EvidenceFact[];
  limitations: string[];
  intakeStatus: IntakeStatus;
  intakeLabel: string;
};

const FALLBACK_STEPS = [
  "Do not share OTPs, PINs, passwords or card details with anyone who calls you.",
  "Do not install remote-access or screen-sharing apps because a caller asks you to.",
  "Verify the organisation using contact details you find yourself, not ones the caller gave you.",
  "If money has already moved, report it through the official national cybercrime channel.",
];

export const INTAKE_LABEL: Record<IntakeStatus, string> = {
  SUBMITTED: "Submitted to JAAL",
  UNDER_REVIEW: "Under investigator review",
  MORE_INFORMATION_NEEDED: "More information requested",
  ACCEPTED: "Accepted by an investigator",
  CLOSED: "Closed",
};

/** Assemble everything the results screen needs about the submitted report. */
export function buildReportSummary(recording: VoiceRecording): VoiceReportSummaryModel {
  const analysis = recording.analysis;
  const findings = analysis.findings ?? [];

  const nextSteps =
    analysis.recommendedSteps && analysis.recommendedSteps.length > 0
      ? analysis.recommendedSteps
      : FALLBACK_STEPS;

  const evidence: EvidenceFact[] = [
    { label: "Report reference", value: recording.caseId },
    { label: "Original file", value: recording.fileName },
    { label: "Size", value: formatBytes(recording.sizeBytes) },
    { label: "Format", value: recording.mimeType },
    {
      label: "Integrity fingerprint",
      value: `${recording.hashAlgorithm} ${recording.fileHash.slice(0, 16)}…`,
    },
    {
      label: "Consent recorded",
      value: `${new Date(recording.consentAt).toLocaleString()} (${recording.consentVersion})`,
    },
  ];
  if (analysis.provider) {
    evidence.push({
      label: "AI analysis",
      value: analysis.model ? `${analysis.provider} · ${analysis.model}` : analysis.provider,
    });
  }
  if (recording.transcription.provider) {
    evidence.push({
      label: "Transcription",
      value: recording.transcription.provider,
    });
  }

  return {
    caseId: recording.caseId,
    fileName: recording.fileName,
    headline: analysis.summary ?? "Analysis is not available for this recording yet.",
    concern: findings.length > 0 ? `${findings.length} potential warning sign${findings.length === 1 ? "" : "s"} found` : null,
    nextSteps,
    indicators: groupIndicators(analysis.indicators),
    evidence,
    limitations: analysis.limitations ?? [],
    intakeStatus: recording.intakeStatus,
    intakeLabel: INTAKE_LABEL[recording.intakeStatus] ?? recording.intakeStatus,
  };
}

/**
 * The fingerprint verifies that the stored bytes match what was uploaded. It is
 * NOT proof of who recorded the call, who spoke, or when — say so explicitly.
 */
export const INTEGRITY_EXPLANATION =
  "This fingerprint confirms the stored file matches the bytes that were uploaded. It does not prove who recorded the call, who was speaking, or when it happened.";

export const RECORDING_STORAGE_EXPLANATION =
  "Your original recording is kept so you and JAAL investigators can review it. You can delete it at any time from this screen.";
