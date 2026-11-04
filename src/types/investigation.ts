import type { ConversationMessage } from "./message";
import type { EvidenceItem } from "./evidence";

export const SCAM_CATEGORIES = [
  "Digital arrest scam",
  "UPI/payment scam",
  "Phishing",
  "Impersonation",
  "Job scam",
  "Investment scam",
  "Other",
] as const;

export type ScamCategory = (typeof SCAM_CATEGORIES)[number];

export type DetectionMode = "simulation" | "balanced" | "manual";

export type InvestigationStatus = "active" | "completed" | "archived";

export type KillChainStageId =
  | "contact"
  | "authority"
  | "fear"
  | "payment"
  | "exploit";

export type StageStatus = "pending" | "active" | "detected" | "completed";

export interface KillChainStage {
  id: KillChainStageId;
  number: number;
  label: string;
  /** Short description shown in the detail view */
  description: string;
  status: StageStatus;
  /** Epoch ms when the stage was detected from real message content */
  detectedAt: number | null;
  messageIds: string[];
  tactics: TacticId[];
  /** Why the engine believes this stage was reached (derived from messages) */
  reason: string;
}

export type TacticId =
  | "authority_impersonation"
  | "fear_threat"
  | "urgency"
  | "payment_request"
  | "isolation"
  | "remote_access";

export interface TacticMeta {
  id: TacticId;
  name: string;
  description: string;
}

export interface DetectedTactic {
  id: string;
  caseId: string;
  tactic: TacticId;
  messageId: string | null;
  /** Supporting excerpt from the source message */
  sourceText: string;
  timestamp: number;
  explanation: string;
}

export type LogLevel = "info" | "warn" | "success" | "error";

export interface LogEntry {
  id: string;
  caseId: string;
  timestamp: number;
  level: LogLevel;
  message: string;
}

export type ActivityKind =
  | "case_started"
  | "message"
  | "identifier_extracted"
  | "tactic_detected"
  | "hash_generated"
  | "stage_advanced"
  | "report_created"
  | "integrity_verified"
  | "integrity_mismatch"
  | "evidence_reviewed"
  | "correlation"
  | "ai_analysis";

export interface ActivityEvent {
  id: string;
  caseId: string;
  timestamp: number;
  kind: ActivityKind;
  title: string;
  detail: string;
}

export interface Investigation {
  id: string;
  title: string;
  category: ScamCategory;
  description: string;
  notes: string;
  status: InvestigationStatus;
  createdAt: number;
  lastActivityAt: number;
  currentStage: KillChainStageId;
  /** Which conversation source was chosen at creation */
  source: "simulation" | "paste" | "import";
  detectionMode: DetectionMode;
  flags: {
    tacticDetection: boolean;
    identifierExtraction: boolean;
    integrityHashing: boolean;
    /** AI next-move suggestions in the workspace */
    aiSuggestions: boolean;
  };
}

export type CaseRunStatus = "running" | "paused" | "completed";

export interface CaseRuntime {
  caseId: string;
  messages: ConversationMessage[];
  evidence: EvidenceItem[];
  tactics: DetectedTactic[];
  stages: KillChainStage[];
  logs: LogEntry[];
  activities: ActivityEvent[];
  /** Cursor into the scripted scammer arc (simulation only) */
  cursor: number;
  /** Script + branch turns consumed so far (simulation only) */
  turnCount: number;
  status: CaseRunStatus;
  startedAt: number;
  endedAt: number | null;
  typing: boolean;
  /** True once the scripted simulation has nothing left to say */
  exhausted: boolean;
  /** Latest backend strategy suggestion (Groq LLM when configured, else rules). */
  strategy?: {
    objective: string;
    missing: string;
    question: string;
    reason: string;
    /** GROQ when an LLM produced it, SIMULATION for rule-based fallback */
    source: string;
    approved: boolean;
  } | null;
}
