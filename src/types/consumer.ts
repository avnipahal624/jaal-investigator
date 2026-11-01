/** Local mirrors of the real Convex schema fields used by the consumer UI.

These are kept in sync with `src/convex/schema.ts` by hand. They exist only
because the generated `_generated/dataModel.d.ts` is stale in this
environment; they match the schema fields exactly and are used for UI typing
only (the real runtime types come from Convex at execution time).
*/

/** Consumer dashboard summary returned by `api.consumer.consumerDashboard`. */
export interface ConsumerDashboardSummary {
  totalReports: number;
  underReview: number;
  completed: number;
  evidenceCount: number;
  recent: ConsumerReportView[];
}

/** A consumer-readable view of one of the caller's reports (investigation). */
export interface ConsumerReportView {
  _id: string;
  caseId: string;
  owner: string;
  title: string;
  category: string;
  description: string;
  notes: string;
  status: "active" | "completed" | "archived";
  source: "simulation" | "paste" | "import";
  detectionMode: "simulation" | "balanced" | "manual";
  flags: {
    tacticDetection: boolean;
    identifierExtraction: boolean;
    integrityHashing: boolean;
    aiSuggestions: boolean;
  };
  currentStage: string;
  createdAt: number;
  lastActivityAt: number;
  completedAt: number | undefined;
  runStatus: "running" | "paused" | "completed";
  startedAt: number;
  endedAt: number | undefined;
  cursor: number;
  turnCount: number;
  stages: unknown;
  schemaVersion: number;
  evidenceCount?: number;
}

/** A consumer-readable view of one evidence row attached to a report. */
export interface ConsumerEvidenceView {
  _id: string;
  investigationId: string;
  owner: string;
  caseId: string;
  sourceMessageId: string | undefined;
  sourceMessageText: string;
  label: string;
  evidenceType: string;
  extractedValue: string;
  normalizedValue: string;
  content: string;
  extractionMethod: string;
  extractionTimestamp: number;
  confidence: number | undefined;
  integrityHash: string | undefined;
  integrityAlgorithm: string | undefined;
  integrityStatus:
    | "NOT_HASHED"
    | "HASH_GENERATED"
    | "INTEGRITY_VERIFIED"
    | "HASH_MISMATCH"
    | "TAMPER_SIMULATION";
  hashGeneratedAt: number | undefined;
  notes: string;
  tampered: boolean | undefined;
  originalContent: string | undefined;
  contentHistory: Array<{
    at: number;
    by: string;
    action: string;
    detail?: string;
    hash?: string;
    status?: string;
  }> | undefined;
  hashHistory: Array<{
    at: number;
    by: string;
    action: string;
    detail?: string;
    hash?: string;
    status?: string;
  }> | undefined;
  verificationHistory: Array<{
    at: number;
    by: string;
    action: string;
    detail?: string;
    hash?: string;
    status?: string;
  }> | undefined;
  manifest: unknown;
  manifestHash: string | undefined;
  reviewStatus: "confirmed" | "incorrect" | "needs_review" | undefined;
  reviewNote: string | undefined;
  reviewedAt: number | undefined;
  createdAt: number;
}

/** Consumer-readable view of a stored AI analysis (threat module) for a report. */
export interface ConsumerAnalysisView {
  _id: string;
  investigationId: string;
  owner: string;
  caseId: string;
  module: "threat" | "prediction" | "correlation" | "report";
  status: "PROCESSING" | "COMPLETED" | "FAILED" | "UNAVAILABLE";
  schemaVersion: number;
  fingerprint: string;
  inputMessageCount: number;
  provider: string | null;
  model: string | null;
  output: unknown;
  limitations: string[];
  error: string | null;
  durationMs: number | undefined;
  at: number;
}

/** Category key type for consumer reports, mirroring CONSUMER_CATEGORIES. */
export type ConsumerCategoryKey =
  | "message"
  | "call"
  | "voice"
  | "payment"
  | "link"
  | "other";

// ---------------------------------------------------------------------------
// Voice Call Scam Intelligence — local mirrors of the voice_recordings surface.
// ---------------------------------------------------------------------------

export type VoiceAssessment =
  | "HIGH_CONCERN"
  | "WARNING_SIGNS_FOUND"
  | "NO_OBVIOUS_WARNING_SIGNS"
  | "UNABLE_TO_ASSESS";

export type VoiceProcessStatus =
  | "NOT_STARTED"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "UNAVAILABLE";

export interface VoiceSegment {
  speaker?: string;
  startMs?: number;
  endMs?: number;
  text: string;
}

export interface VoiceFinding {
  id: string;
  tactic: string;
  category: string;
  excerpt: string;
  timestampMs?: number;
  explanation: string;
  confidence: "low" | "medium" | "high";
  severity: "low" | "medium" | "high";
  recommendedAction: string;
  observed: boolean;
}

export interface VoiceRecordingView {
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
  transcriptSegments: VoiceSegment[] | null;
  transcriptSource: "SPEECH_PROVIDER" | "CONSUMER_PROVIDED" | null;
  transcription: {
    status: VoiceProcessStatus;
    provider: string | null;
    error: string | null;
    at: number | null;
  };
  analysis: {
    status: VoiceProcessStatus;
    assessment: VoiceAssessment | null;
    summary: string | null;
    findings: VoiceFinding[] | null;
    recommendedSteps: string[] | null;
    limitations: string[] | null;
    provider: string | null;
    model: string | null;
    error: string | null;
    at: number | null;
  };
  intakeStatus:
    | "SUBMITTED"
    | "UNDER_REVIEW"
    | "MORE_INFORMATION_NEEDED"
    | "ACCEPTED"
    | "CLOSED";
  createdAt: number;
  updatedAt: number;
}
