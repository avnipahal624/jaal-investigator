import type { ScamCategory, KillChainStageId, TacticId } from "./investigation";

export interface ReportEvidenceRow {
  id: string;
  type: string;
  label: string;
  value: string;
  extractedAt: number;
  hash: string | null;
  hashStatus: string;
  /** Analyst verdict, stored separately from the extraction. */
  review: {
    status: string | null;
    note: string | null;
    reviewedAt: number | null;
  };
  /** Optional on older stored reports (rendered as "—" when absent). */
  sourceMessageId?: string | null;
  sourceMessageNumber?: number | null;
  /** Hash algorithm behind this row's baseline (null when not hashed). */
  hashAlgorithm?: string | null;
  /** Rule-based extraction confidence in [0,1] — a review aid, not a verdict. */
  confidence?: number | null;
  /** Which rule produced the indicator, e.g. RULE_BASED_REGEX:url_obfuscated. */
  detectionMethod?: string | null;
}

export interface ReportSummary {
  scenario: string;
  tactics: string;
  payment: string;
  moments: { timestamp: number; label: string; text: string }[];
}

export interface ReportIntegritySummary {
  collected: number;
  hashed: number;
  verified: number;
  mismatched: number;
  unhashed: number;
}

export interface EvidenceReport {
  id: string;
  caseId: string;
  title: string;
  category: ScamCategory;
  generatedAt: number;
  generatedBy: string;
  /** Always true for locally generated demo reports */
  simulated: boolean;
  status: "active" | "completed" | "archived";
  currentStage: KillChainStageId;
  evidenceCount: number;
  integrity: ReportIntegritySummary;
  description: string;
  /** Executive summary derived from the actual session */
  summary: ReportSummary;
  /** What this investigation never established */
  unknowns: string[];
  transcript: {
    author: string;
    text: string;
    timestamp: number;
  }[];
  tactics: {
    tactic: TacticId;
    name: string;
    timestamp: number;
    sourceText: string;
    explanation: string;
    /** Optional on older stored reports. */
    messageId?: string | null;
    messageNumber?: number | null;
  }[];
  stages: {
    id: KillChainStageId;
    number: number;
    label: string;
    status: string;
    detectedAt: number | null;
    reason: string;
  }[];
  evidence: ReportEvidenceRow[];
  timeline: {
    timestamp: number;
    kind: string;
    title: string;
    detail: string;
  }[];
  verification: {
    id: string;
    label: string;
    hash: string | null;
    status: string;
    note: string;
    hashAlgorithm?: string | null;
  }[];
  analystNotes: string;
  /** Actions a person marked complete; never inferred by JAAL. */
  actionsCompleted?: {
    key: string;
    title: string;
    reason: string;
    completedAt: number;
  }[];
  /** Version assigned when this report was persisted (v1, v2, …). */
  reportVersion?: number;
  /** Algorithm used for every evidence baseline in this report. */
  hashAlgorithm?: string;
  /**
   * Explicit provenance separation: where each class of statement in this
   * report comes from. Older stored reports may lack this block.
   */
  provenance?: {
    conversation: string;
    ruleBased: string[];
    aiAssisted: string[];
    humanReviewed: string[];
    unverifiedAssumptions: string[];
    simulationOnly: string[];
  };
}
