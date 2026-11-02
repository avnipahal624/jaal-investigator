/**
 * Shapes returned by the JAAL backend's consumer queries
 * (`consumer:consumerDashboard`, `consumer:consumerReports`). Mirrored here for
 * type-safety; the backend remains the single source of truth.
 */

export type ReportStatus = "active" | "completed" | string;

export interface ConsumerReport {
  _id: string;
  caseId: string;
  category: string;
  title: string;
  description?: string;
  createdAt: number;
  lastActivityAt?: number;
  status: ReportStatus;
  evidenceCount: number;
}

export interface ConsumerDashboard {
  totalReports: number;
  underReview: number;
  completed: number;
  evidenceCount: number;
  recent: ConsumerReport[];
}

export interface ConsumerEvidence {
  _id: string;
  label?: string;
  evidenceType?: string;
  extractedValue?: string;
  content?: string;
  sourceMessageText?: string;
  integrityStatus?: string;
  notes?: string;
  createdAt: number;
}
