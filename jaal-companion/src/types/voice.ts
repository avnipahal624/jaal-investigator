/**
 * Shared voice-intelligence types.
 *
 * These mirror the shapes returned by `src/convex/voice.ts` exactly. The
 * backend is the source of truth: if a field is absent here it is because the
 * server did not provide it (e.g. no timestamps, no speaker labels) and the UI
 * must render an honest "not available" state rather than inventing one.
 */

export type TranscriptionStatus =
  | "NOT_STARTED"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "UNAVAILABLE"
  /** Audio was analysed and found to contain no speech. */
  | "NO_SPEECH";

export type AnalysisStatus = TranscriptionStatus;

export type VoiceAssessment =
  | "HIGH_CONCERN"
  | "WARNING_SIGNS_FOUND"
  | "NO_OBVIOUS_WARNING_SIGNS"
  | "UNABLE_TO_ASSESS";

export type TranscriptSource = "SPEECH_PROVIDER" | "CONSUMER_PROVIDED";

export type IntakeStatus =
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "MORE_INFORMATION_NEEDED"
  | "ACCEPTED"
  | "CLOSED";

export type Confidence = "low" | "medium" | "high";
export type Severity = "low" | "medium" | "high";

/** One timed chunk of transcript. Times are present only if the provider gave them. */
export interface TranscriptSegment {
  speaker?: string;
  startMs?: number;
  endMs?: number;
  text: string;
}

/** A scam tactic the model flagged. `observed` separates quote from inference. */
export interface VoiceFinding {
  id: string;
  tactic: string;
  category: string;
  excerpt: string;
  timestampMs?: number;
  explanation: string;
  confidence: Confidence;
  severity: Severity;
  recommendedAction: string;
  /** true = the excerpt is verbatim from the transcript, false = interpretation. */
  observed: boolean;
}

export type IndicatorType =
  | "phone"
  | "url"
  | "upi"
  | "organization"
  | "payment_instruction"
  | "other";

/**
 * An identifier quoted in the transcript. This is EXTRACTED TEXT, not verified
 * intelligence — nothing here has been checked against the indicator database.
 */
export interface VoiceIndicator {
  type: IndicatorType;
  value: string;
  context?: string;
}

export interface VoiceAnalysis {
  status: AnalysisStatus;
  assessment: VoiceAssessment | null;
  summary: string | null;
  findings: VoiceFinding[] | null;
  indicators: VoiceIndicator[] | null;
  recommendedSteps: string[] | null;
  limitations: string[] | null;
  provider: string | null;
  model: string | null;
  error: string | null;
  at: number | null;
}

export interface VoiceRecording {
  _id: string;
  investigationId: string;
  caseId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  fileHash: string;
  hashAlgorithm: string;
  durationSeconds: number | null;
  consentAt: number;
  consentVersion: string;

  callerPhone: string | null;
  claimedIdentity: string | null;
  approximateCallAt: number | null;
  whatHappened: string | null;
  moneyRequested: boolean | null;
  credentialsRequested: boolean | null;
  moneyTransferredOrShared: boolean | null;

  transcript: string | null;
  transcriptSegments: TranscriptSegment[] | null;
  transcriptSource: TranscriptSource | null;
  transcription: {
    status: TranscriptionStatus;
    provider: string | null;
    language: string | null;
    error: string | null;
    at: number | null;
  };
  analysis: VoiceAnalysis;

  intakeStatus: IntakeStatus;
  createdAt: number;
  updatedAt: number;
}

/** Row shape of `voice.getConsumerQueue` — the user's recent analyses. */
export interface VoiceQueueRow {
  _id: string;
  caseId: string;
  fileName: string;
  sizeBytes: number;
  durationSeconds: number | null;
  callerPhone: string | null;
  claimedIdentity: string | null;
  intakeStatus: IntakeStatus;
  assessment: VoiceAssessment | null;
  analysisStatus: AnalysisStatus;
  transcriptionStatus: TranscriptionStatus;
  createdAt: number;
}

/** A file the user picked, before anything leaves the device. */
export interface VoiceFile {
  uri: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

export type VoiceProcessingResult = {
  transcriptionStatus: TranscriptionStatus;
  analysisStatus: AnalysisStatus;
  assessment: VoiceAssessment | null;
  providersRan: { transcription: string | null; analysis: string | null };
  /** Whether work ran, was already done, or was refused by the lease. */
  state?:
    | "COMPLETED"
    | "ALREADY_COMPLETE"
    | "ALREADY_PROCESSING"
    | "OWNER_BUSY"
    | "NO_SPEECH"
    | "FAILED";
  retryable?: boolean;
  retryAfterMs?: number;
};
