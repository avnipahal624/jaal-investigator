import type {
  CaseRuntime,
  KillChainStageId,
  TacticId,
} from "@/types/investigation";

/**
 * AI investigation strategy.
 *
 * Suggestions are derived from the actual conversation: which knowledge goals
 * the decoy has not yet pursued, and which kill-chain stage the scammer is
 * currently working. No fabricated model output, no confidence scores.
 */

export const STAGE_OBJECTIVES: Record<KillChainStageId, string> = {
  contact: "Keep the channel open and establish a plausible pretext",
  authority: "Have their claimed authority accepted without verification",
  fear: "Force compliance through fear of arrest or account loss",
  payment: "Extract a transfer before any real verification can happen",
  exploit: "Capture proof-of-payment, credentials or device access",
};

export const STAGE_TACTIC_HINT: Record<KillChainStageId, string> = {
  contact: "Unsolicited contact",
  authority: "Authority impersonation",
  fear: "Fear and threat",
  payment: "Payment request",
  exploit: "Exploitation / remote access",
};

interface KnowledgeGoal {
  id: string;
  /** What remains unknown until this is asked */
  missing: string;
  question: string;
  reason: string;
  /** Matched against everything the decoy has said so far */
  asked: RegExp;
  /** Shown in "remaining unknowns" once the session closes */
  unexplored: string;
}

const GOALS: KnowledgeGoal[] = [
  {
    id: "department",
    missing: "The department issuing the notice",
    question: "Which department is issuing this notice, and what is your designation?",
    reason: "Pinning a department exposes impersonation conflicts between replies.",
    asked: /department|designation|who are you|which police|rank/,
    unexplored: "The claimed department was never pinned down.",
  },
  {
    id: "website",
    missing: "An official website or verifiable link",
    question: "What is your official website?",
    reason: "Scammers avoid verifiable links — refusal is itself evidence.",
    asked: /website|official site|official link|portal/,
    unexplored: "No official website was ever requested.",
  },
  {
    id: "case_ref",
    missing: "An official case reference",
    question: "What is my case reference?",
    reason: "Fabricated reference numbers can be compared across messages.",
    asked: /case (number|reference)|fir\b|reference number/,
    unexplored: "No case reference was requested.",
  },
  {
    id: "why_payment",
    missing: "The pretext for the payment",
    question: "Why is a payment required?",
    reason: "Reveals refund-pressure language and fabricated policy claims.",
    asked: /why.*(pay|payment|charge)|payment required|why do i/,
    unexplored: "The pretext for the payment was never challenged.",
  },
  {
    id: "upi",
    missing: "The payment identifier",
    question: "Which UPI ID should I pay?",
    reason: "Forces the payment handle into the record together with its context.",
    asked: /upi|vpa|where do i pay|pay to/,
    unexplored: "No payment identifier was requested directly.",
  },
  {
    id: "urgency_test",
    missing: "Behaviour once payment stalls",
    question: "I don't have the money right now.",
    reason: "Tests urgency and threat escalation once payment stalls.",
    asked: /(don'?t|do not) have the money|no money|later|tomorrow/,
    unexplored: "Scammer behaviour under payment delay was never tested.",
  },
];

export interface Strategy {
  objective: string;
  missing: string;
  question: string;
  reason: string;
  /** GROQ when produced by the LLM action, SIMULATION for rule-based */
  source?: string;
  approved?: boolean;
}

/**
 * The backend strategy suggestion wins when present: it carries the LLM
 * (Groq) authored analysis when configured, otherwise the same rules run
 * server-side. Local derivation remains as the offline fallback.
 */
export function buildStrategy(runtime: CaseRuntime): Strategy | null {
  const remote = runtime.strategy;
  if (remote?.question?.trim()) {
    return {
      objective: remote.objective,
      missing: remote.missing,
      question: remote.question,
      reason: remote.reason,
      source: remote.source,
      approved: remote.approved,
    };
  }
  const decoyText = runtime.messages
    .filter((m) => m.author === "decoy")
    .map((m) => m.text)
    .join(" ")
    .toLowerCase();
  const goal = GOALS.find((g) => !g.asked.test(decoyText));
  if (!goal) return null;
  const activeStage =
    runtime.stages.find((s) => s.status === "active")?.id ?? "contact";
  return {
    objective: STAGE_OBJECTIVES[activeStage],
    missing: goal.missing,
    question: goal.question,
    reason: goal.reason,
  };
}

/** Goals the decoy never pursued — used for the completion screen. */
export function unexploredGoals(runtime: CaseRuntime): string[] {
  const decoyText = runtime.messages
    .filter((m) => m.author === "decoy")
    .map((m) => m.text)
    .join(" ")
    .toLowerCase();
  return GOALS.filter((g) => !g.asked.test(decoyText)).map((g) => g.unexplored);
}

/**
 * Intent of a scammer message, derived from its detected tactics and the
 * kill-chain stage it evidences. No confidence percentages are invented.
 */
export function classifyIntent(
  tactics: TacticId[],
  stage: KillChainStageId | null,
): string {
  if (tactics.includes("payment_request")) return "PAYMENT PRESSURE";
  if (tactics.includes("fear_threat")) return "FEAR / THREAT";
  if (tactics.includes("authority_impersonation")) return "AUTHORITY CLAIM";
  if (tactics.includes("remote_access")) return "DEVICE ACCESS";
  if (tactics.includes("isolation")) return "ISOLATION";
  if (tactics.includes("urgency")) return "URGENCY";
  switch (stage) {
    case "payment":
      return "PAYMENT PRESSURE";
    case "fear":
      return "FEAR / THREAT";
    case "authority":
      return "AUTHORITY CLAIM";
    case "exploit":
      return "EXPLOITATION";
    default:
      return "CONTACT / PRETEXT";
  }
}
