/** Mirrors the backend `assistantActions:analyseConsumerContent` result. */

export interface AnalysisIndicator {
  label: string;
  level: "LOW" | "MEDIUM" | "HIGH";
}

export interface AnalysisTactic {
  name: string;
  explanation: string;
}

export interface ConsumerAnalysisResult {
  status: "COMPLETED" | "FAILED" | "UNAVAILABLE";
  category: "message" | "call" | "payment" | "link" | "other";
  assessment: string;
  explanation: string;
  indicators: AnalysisIndicator[];
  tactics: AnalysisTactic[];
  actions: string[];
  excerpts: string[];
  error: string | null;
}
