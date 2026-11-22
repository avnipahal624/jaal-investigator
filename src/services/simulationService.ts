import {
  BRANCHES,
  OPENING_TURN,
  SCAMMER_ARC,
  type BranchReply,
  type ScriptTurn,
} from "@/data/demoConversation";
import { getScenario, isScenarioExhausted, scenarioTurn } from "@/data/scenarios";

/**
 * Local scripted conversation engine.
 *
 * Replaces an external LLM for the demo: the scammer replies come from a
 * synthetic script with contextual branches based on what the decoy asks.
 * It never contacts any real person or service.
 */

export interface NextTurn {
  text: string;
  /** Scripted arc turn consumed (advances the main arc) */
  arc: ScriptTurn | null;
  branch: BranchReply | null;
  /** True when the arc is finished and no branch matched */
  exhausted: boolean;
}

export const SUGGESTED_PROMPTS = [
  "What is your official website?",
  "Why is a payment required?",
  "Which department are you from?",
  "What is my case reference?",
  "Which UPI ID should I pay?",
  "I don't have the money right now",
] as const;

function matchBranch(userText: string): BranchReply | null {
  const lower = userText.toLowerCase();
  for (const branch of BRANCHES) {
    if (branch.match.some((kw) => lower.includes(kw.toLowerCase()))) {
      return branch;
    }
  }
  return null;
}

/** Decide the scammer's next reply for a decoy/operator message. */
export function nextScammerTurn(
  userText: string,
  cursor: number,
  turnCount: number,
  scenarioKey?: string,
): NextTurn {
  if (scenarioKey && getScenario(scenarioKey) && scenarioKey !== "digital-arrest") {
    const turn = scenarioTurn(scenarioKey, cursor);
    if (!turn) return { text: "", arc: null, branch: null, exhausted: true };
    const arc: ScriptTurn = { text: turn.text, stage: turn.stage, tactics: [], identifiers: [] };
    return { text: turn.text, arc, branch: null, exhausted: false };
  }
  const branch = matchBranch(userText);
  if (branch) {
    const reply = branch.replies[turnCount % branch.replies.length]!;
    return {
      text: reply,
      arc: null,
      branch,
      exhausted: false,
    };
  }

  if (cursor < SCAMMER_ARC.length) {
    const arc = SCAMMER_ARC[cursor]!;
    return { text: arc.text, arc, branch: null, exhausted: false };
  }

  // Arc fully consumed and no branch matched: the simulation is exhausted.
  return { text: "", arc: null, branch: null, exhausted: true };
}

/** True when the scripted arc is fully consumed. */
export function arcExhausted(cursor: number): boolean {
  return cursor >= SCAMMER_ARC.length;
}

/** Scenario-aware exhaustion check for locally-created synthetic cases. */
export function caseExhausted(scenarioKey: string | undefined, cursor: number): boolean {
  if (scenarioKey && scenarioKey !== "digital-arrest" && getScenario(scenarioKey)) {
    return isScenarioExhausted(scenarioKey, cursor);
  }
  return arcExhausted(cursor);
}

/** What's left in the arc — used for the completion state. */
export function remainingTurns(cursor: number): number {
  return Math.max(0, SCAMMER_ARC.length - cursor);
}

export const SEED_OPENING_TURN = OPENING_TURN;

/** Parse a pasted transcript into messages ("Scammer: ..." / "Me: ..." lines). */
export function parseTranscript(
  caseId: string,
  raw: string,
  now = Date.now(),
): { author: "scammer" | "decoy"; text: string; timestamp: number; source: string }[] {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const messages: {
    author: "scammer" | "decoy";
    text: string;
    timestamp: number;
    source: string;
  }[] = [];
  let offset = 0;
  for (const line of lines) {
    const match = line.match(
      /^(?:\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*)?([A-Za-z][A-Za-z ]{1,20}):\s*(.+)$/,
    );
    if (match) {
      const who = match[1]!.toLowerCase();
      const isScammer =
        /scam|them|caller|stranger|other|official|inspector|agent|they/.test(who);
      const isDecoy = /me|you|decoy|self|operator|user|jaal/.test(who);
      messages.push({
        author: isScammer && !isDecoy ? "scammer" : isDecoy ? "decoy" : "scammer",
        text: match[2]!,
        timestamp: now + offset,
        source: "TRANSCRIPT-IMPORT",
      });
      offset += 1000;
    }
  }
  return messages;
}
