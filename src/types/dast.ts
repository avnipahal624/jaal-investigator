/**
 * Shared vocabulary for the JAAL Agentic DAST module.
 *
 * These values are persisted in Convex and rendered by the security console.
 * Nothing here is a finding: findings only exist after a deterministic test
 * has executed against the isolated synthetic travel lab and been verified.
 */

export const DAST_AGENTS = [
  {
    key: "change-sentinel",
    name: "Change Sentinel",
    short: "CHANGE",
    purpose:
      "Turns authorized deployments into scoped investigations by diffing endpoint inventory, authorization metadata, and business flows.",
  },
  {
    key: "recon-inventory",
    name: "Recon & Inventory",
    short: "RECON",
    purpose:
      "Probes the authorized lab with each synthetic role, records observations, and classifies active, zombie, and shadow APIs.",
  },
  {
    key: "attack-planner",
    name: "Intelligent Attack Planner",
    short: "PLAN",
    purpose:
      "Selects deterministic business-logic tests from endpoint purpose, role context, and change priority. LLM output is advisory only.",
  },
  {
    key: "safe-executor",
    name: "Safe Execution",
    short: "EXEC",
    purpose:
      "Enforces target scope, request budgets, approval gates and emergency stop before dispatching any test request.",
  },
  {
    key: "verification",
    name: "Verification",
    short: "VERIFY",
    purpose:
      "Reproduces each candidate with a control request and only promotes it when the security boundary violation is asserted.",
  },
  {
    key: "triage-reporting",
    name: "Triage & Reporting",
    short: "TRIAGE",
    purpose:
      "Separates technical severity from business impact, seals evidence with SHA-256, assigns ownership, and generates reports.",
  },
  {
    key: "retest",
    name: "Automated Retest",
    short: "RETEST",
    purpose:
      "Replays the original approved test against a fixed lab configuration and only marks FIXED when the violation is absent.",
  },
] as const;

export type DastAgentKey = (typeof DAST_AGENTS)[number]["key"];

export const AGENT_STATUS = [
  "IDLE",
  "QUEUED",
  "RUNNING",
  "WAITING_FOR_APPROVAL",
  "PAUSED",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;
export type DastAgentStatus = (typeof AGENT_STATUS)[number];

export const SEVERITY_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFORMATIONAL"] as const;
export type DastSeverity = (typeof SEVERITY_ORDER)[number];

export const SEVERITY_COLOR: Record<DastSeverity, string> = {
  CRITICAL: "#F87171",
  HIGH: "#F5B942",
  MEDIUM: "#FBBF24",
  LOW: "#60A5FA",
  INFORMATIONAL: "#9FB3C8",
};

export const CLASSIFICATION_META = {
  ACTIVE: {
    label: "Active",
    color: "#34D399",
    description: "Observed in authorized traffic and present in the discovered inventory.",
  },
  ZOMBIE: {
    label: "Zombie",
    color: "#F5B942",
    description:
      "Still reachable but absent from legitimate traffic for the configured historical window.",
  },
  SHADOW: {
    label: "Shadow",
    color: "#B383F5",
    description: "Observed in traffic but absent from the documented inventory.",
  },
  UNKNOWN: {
    label: "Unknown",
    color: "#9FB3C8",
    description: "Insufficient observations to classify with confidence.",
  },
} as const;
export type DastClassification = keyof typeof CLASSIFICATION_META;

export const FINDING_STATUS_META = {
  SUSPECTED: { label: "Suspected", color: "#FBBF24" },
  VERIFYING: { label: "Verifying", color: "#60A5FA" },
  VERIFIED: { label: "Verified", color: "#F87171" },
  FALSE_POSITIVE: { label: "False positive", color: "#9FB3C8" },
  INCONCLUSIVE: { label: "Inconclusive", color: "#F5B942" },
  NEEDS_HUMAN_REVIEW: { label: "Needs review", color: "#B383F5" },
  FIXED: { label: "Fixed", color: "#34D399" },
  STILL_VULNERABLE: { label: "Still vulnerable", color: "#F87171" },
} as const;

export const INVESTIGATION_STATUS_META: Record<
  string,
  { label: string; color: string }
> = {
  QUEUED: { label: "Queued", color: "#9FB3C8" },
  RUNNING: { label: "Running", color: "#2DD4BF" },
  WAITING_FOR_APPROVAL: { label: "Awaiting approval", color: "#F5B942" },
  PAUSED: { label: "Paused", color: "#F5B942" },
  COMPLETED: { label: "Completed", color: "#34D399" },
  FAILED: { label: "Failed", color: "#F87171" },
  CANCELLED: { label: "Cancelled", color: "#9FB3C8" },
};

export const STAGE_LABELS: Record<string, string> = {
  CHANGE_DETECTION: "Change detection",
  DISCOVERY: "API discovery",
  KNOWLEDGE_GRAPH: "Inventory graph",
  PLANNING: "Attack planning",
  SAFETY_REVIEW: "Safety validation",
  EXECUTION: "Controlled execution",
  VERIFICATION: "Verification",
  TRIAGE: "Business-impact triage",
  REPORTING: "Report generation",
  RETEST: "Automated retest",
};

export const SEVERITY_WEIGHT: Record<DastSeverity, number> = {
  CRITICAL: 100,
  HIGH: 70,
  MEDIUM: 40,
  LOW: 15,
  INFORMATIONAL: 0,
};

export function relativeTime(at: number | null | undefined): string {
  if (!at) return "—";
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.max(0, Math.round(ms))} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${(ms / 60_000).toFixed(1)} min`;
}

export function formatTimestamp(at: number | null | undefined): string {
  if (!at) return "—";
  return new Date(at).toISOString().replace("T", " ").slice(0, 19) + " UTC";
}
