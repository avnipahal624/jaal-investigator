"use node";

/**
 * JAAL INTELLIGENCE ENGINE — provider actions.
 *
 * One shared execution pipeline serves all five modules:
 *
 *   caseContext (ownership) → per-owner rate limit → beginAnalysis (slot +
 *   cache) → [deterministic pre-pass where applicable] → bounded prompt →
 *   Groq call → strict zod validation → grounding against the case's
 *   alias index → saveAnalysis (stored SEPARATELY from messages/evidence).
 *
 * Failure at any step is recorded as a failure CATEGORY (never raw provider
 * payloads or conversation content), and the module surfaces an honest
 * FAILED/UNAVAILABLE state. Scripted output is never substituted for model
 * output — only the correlation module's deterministic rule pass produces
 * results without the provider, and those are labelled RULE_BASED.
 *
 * Secrets (GROQ_API_KEY / GROQ_MODEL) are read only here.
 */
import { action } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { v } from "convex/values";
import { z } from "zod";
import { api, internal } from "./_generated/api";
import { authorizeAiCall, extractJson, sanitize } from "./ai";
import { callGroq, currentGroqModel } from "./groqClient";
import {
  MODULE_SCHEMA_VERSION,
  SECURITY_PREAMBLE,
  aliasIndexFromContext,
  buildContextBlock,
  type CaseAliasIndex,
} from "./lib/intelligence";
import {
  COPILOT_OUTPUT_SCHEMA,
  CORRELATION_OUTPUT_SCHEMA,
  PREDICTION_OUTPUT_SCHEMA,
  REPORT_OUTPUT_SCHEMA,
  THREAT_OUTPUT_SCHEMA,
  groundCopilot,
  groundCorrelation,
  groundPrediction,
  groundThreat,
} from "./lib/intelligenceSchemas";

// ---------------------------------------------------------------------------
// Case context shape (mirrors api.intelligence.caseContext)
// ---------------------------------------------------------------------------

type CaseContext = {
  caseId: string;
  title: string;
  category: string;
  status: string;
  currentStage: string;
  fingerprint: string;
  messageCount: number;
  evidenceCount: number;
  tacticCount: number;
  messages: {
    alias: string;
    id: string;
    n: number;
    sender: string;
    text: string;
    timestamp: number;
  }[];
  evidence: {
    alias: string;
    id: string;
    k: number;
    label: string;
    type: string;
    value: string;
    integrityStatus: string;
    reviewStatus: string | null;
    sourceMessageId: string | null;
  }[];
  tactics: {
    alias: string;
    id: string;
    t: number;
    tactic: string;
    messageId: string | null;
  }[];
};

export type ErrorCategory =
  | "no-api-key"
  | "rate-limited"
  | "timeout"
  | "provider-error"
  | "malformed-output"
  | "invalid-output"
  | "grounding-failed"
  | "context-unavailable"
  | "unknown";

export type ModuleRunResult = {
  status: "COMPLETED" | "FAILED" | "UNAVAILABLE";
  reused: boolean;
  error: ErrorCategory | null;
  count: number;
  durationMs: number;
};

function categorize(err: unknown): ErrorCategory {
  if (err instanceof Error) {
    if (err.name === "TimeoutError" || err.name === "AbortError") return "timeout";
    const msg = err.message;
    if (/429|rate limit/i.test(msg)) return "rate-limited";
    if (/^(?:Groq|Anthropic) API \d/.test(msg)) return "provider-error";
    if (/fetch|network|ENOTFOUND|ECONN/i.test(msg)) return "provider-error";
  }
  return "unknown";
}

/** Shared module runner. Every non-copilot module goes through here. */
async function runModule<T>(opts: {
  ctx: ActionCtx;
  caseId: string;
  module: "threat" | "prediction" | "correlation" | "report";
  kind: string;
  force?: boolean;
  system: string;
  maxTokens: number;
  schema: z.ZodType<T>;
  ground: (parsed: T, index: CaseAliasIndex) => {
    output: unknown;
    droppedRefs: number;
    droppedFindings: number;
  };
  count: (output: unknown) => number;
  /** Deterministic completion when the case has no conversation yet. */
  emptyCase?: () => { output: unknown; limitations: string[] };
  /** Extra deterministic work before the provider call (e.g. rule pass). */
  beforeProvider?: (ctx: CaseContext) => Promise<void>;
  /** Persistence side-effect once a COMPLETED result is stored. */
  onCompleted?: (output: unknown, ctx: CaseContext) => Promise<void>;
}): Promise<ModuleRunResult> {
  const started = Date.now();

  // 1-3. Ownership, rate budget, analysis slot.
  const caseCtx = (await opts.ctx.runQuery(api.intelligence.caseContext, {
    caseId: opts.caseId,
  })) as CaseContext | null;
  if (!caseCtx) {
    return { status: "UNAVAILABLE", reused: false, error: "context-unavailable", count: 0, durationMs: 0 };
  }
  try {
    await opts.ctx.runMutation(api.jaal.recordAiRequest, {
      caseId: opts.caseId,
      kind: opts.kind,
    });
  } catch {
    return { status: "FAILED", reused: false, error: "rate-limited", count: 0, durationMs: Date.now() - started };
  }

  const begin = (await opts.ctx.runMutation(api.intelligence.beginAnalysis, {
    caseId: opts.caseId,
    module: opts.module,
    force: opts.force,
  })) as { reused: boolean; fingerprint: string };
  if (begin.reused) {
    const stored = (await opts.ctx.runQuery(api.intelligence.getAnalysis, {
      caseId: opts.caseId,
      module: opts.module,
    })) as { status: "COMPLETED" | "FAILED" | "UNAVAILABLE" | "PROCESSING"; error: string | null; output: unknown } | null;
    return {
      status: stored && stored.status !== "PROCESSING" ? stored.status : "COMPLETED",
      reused: true,
      error: (stored?.error ?? null) as ErrorCategory | null,
      count: stored?.output ? opts.count(stored.output) : 0,
      durationMs: Date.now() - started,
    };
  }

  const save = async (
    status: "COMPLETED" | "FAILED" | "UNAVAILABLE",
    fields: {
      error?: ErrorCategory;
      output?: unknown;
      limitations?: string[];
      provider?: string;
      model?: string;
    },
  ) => {
    await opts.ctx.runMutation(internal.intelligence.saveAnalysis, {
      caseId: opts.caseId,
      module: opts.module,
      status,
      fingerprint: begin.fingerprint,
      inputMessageCount: caseCtx.messageCount,
      schemaVersion: MODULE_SCHEMA_VERSION[opts.module],
      provider: fields.provider,
      model: fields.model,
      output: fields.output,
      limitations: fields.limitations ?? [],
      error: fields.error,
      durationMs: Date.now() - started,
    });
    const level = status === "COMPLETED" ? "info" : status === "UNAVAILABLE" ? "warn" : "error";
    await opts.ctx.runMutation(internal.intelligence.logAnalysis, {
      caseId: opts.caseId,
      level,
      message: `AI ${opts.module} analysis ${status}${fields.error ? ` (${fields.error})` : ""} · ${Date.now() - started}ms`,
    });
  };

  // Deterministic pre-pass (rule-based correlation scan etc.).
  if (opts.beforeProvider) await opts.beforeProvider(caseCtx);

  // 4. Honest empty-conversation completion without spending a call.
  if (caseCtx.messageCount === 0 && opts.emptyCase) {
    const empty = opts.emptyCase();
    await save("COMPLETED", { output: empty.output, limitations: empty.limitations });
    return {
      status: "COMPLETED",
      reused: false,
      error: null,
      count: opts.count(empty.output),
      durationMs: Date.now() - started,
    };
  }

  // 5. Provider availability.
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    await save("UNAVAILABLE", {
      error: "no-api-key",
      limitations: ["AI provider not configured on this deployment (GROQ_API_KEY missing)."],
    });
    return { status: "UNAVAILABLE", reused: false, error: "no-api-key", count: 0, durationMs: Date.now() - started };
  }

  // 6-11. Call → validate → ground → store.
  try {
    const index = aliasIndexFromContext(caseCtx);
    const userContent = buildContextBlock({
      caseId: caseCtx.caseId,
      title: caseCtx.title,
      category: caseCtx.category,
      status: caseCtx.status,
      currentStage: caseCtx.currentStage,
      messages: caseCtx.messages,
      evidence: caseCtx.evidence,
      tactics: caseCtx.tactics,
    });
    const text = await callGroq(apiKey, opts.system, userContent, opts.maxTokens, {
      json: true,
    });
    if (!text) {
      await save("FAILED", { error: "malformed-output" });
      return { status: "FAILED", reused: false, error: "malformed-output", count: 0, durationMs: Date.now() - started };
    }
    const parsed = opts.schema.safeParse(extractJson(sanitize(text, 32_000)));
    if (!parsed.success) {
      await save("FAILED", { error: "invalid-output" });
      return { status: "FAILED", reused: false, error: "invalid-output", count: 0, durationMs: Date.now() - started };
    }
    const grounded = opts.ground(parsed.data, index);
    const limitations: string[] = [];
    if (grounded.droppedRefs > 0) {
      limitations.push(
        `${grounded.droppedRefs} model reference(s) did not resolve to records in this case and were rejected.`,
      );
    }
    if (grounded.droppedFindings > 0) {
      limitations.push(
        `${grounded.droppedFindings} finding(s) were removed because no supporting record could be verified.`,
      );
    }
    limitations.push(
      "AI-assisted interpretation — verify against the conversation and evidence before relying on it.",
    );
    await save("COMPLETED", {
      output: grounded.output,
      limitations,
      provider: "GROQ",
      model: currentGroqModel(),
    });
    if (opts.onCompleted) await opts.onCompleted(grounded.output, caseCtx);
    return {
      status: "COMPLETED",
      reused: false,
      error: null,
      count: opts.count(grounded.output),
      durationMs: Date.now() - started,
    };
  } catch (err) {
    const category = categorize(err);
    await save("FAILED", { error: category });
    return { status: "FAILED", reused: false, error: category, count: 0, durationMs: Date.now() - started };
  }
}

// ---------------------------------------------------------------------------
// Module 1 — Threat Intelligence Analyst
// ---------------------------------------------------------------------------

export const THREAT_SYSTEM = `You are the Threat Intelligence Analyst for JAAL, a scam-analysis training platform running a CONTROLLED SIMULATION. You interpret conversational context to identify manipulative behaviour, scam patterns and potential threats. A deterministic rule engine runs separately — you complement it with context, you do not merely repeat it.

${SECURITY_PREAMBLE}

Analyze <case_data> across these dimensions:
A. Social engineering: authority/government/institution impersonation, false credibility, trust building.
B. Psychological manipulation: fear, urgency, threats, intimidation, isolation, confusion.
C. Financial manipulation: payment demands, advance fees, unusual payment instructions, UPI pressure, banking information requests.
D. Information extraction: OTP, identity document, password or personal information requests.
E. Conversation behaviour: contradictory claims, changing explanations, escalating pressure, repeated requests, avoiding verification, changing claimed identity.

Do not classify every suspicious-looking statement as malicious — explain the context supporting each conclusion. Every finding MUST cite 1-3 message aliases, each with an EXACT excerpt copied verbatim from that message.

Output ONLY this JSON:
{"overview":"2-3 sentence assessment",
 "findings":[{"category":"SOCIAL_ENGINEERING|PSYCHOLOGICAL_MANIPULATION|FINANCIAL_MANIPULATION|INFORMATION_EXTRACTION|CONVERSATION_BEHAVIOUR","tactic":"short tactic name","severity":"LOW|MEDIUM|HIGH|CRITICAL","explanation":"context-backed explanation citing what happened","messageRefs":[{"alias":"M3","quote":"exact excerpt from that message"}],"confidence":"low|medium|high","recommendedAction":"what the investigator should do","limitations":["honest caveat"]}],
 "insights":["key pattern observation"],
 "recommendedSteps":["investigation step"]}`;

export const threatAnalysisAction = action({
  args: { caseId: v.string(), force: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<ModuleRunResult> => {
    return runModule({
      ctx,
      caseId: args.caseId,
      module: "threat",
      kind: "threat",
      force: args.force,
      system: THREAT_SYSTEM,
      maxTokens: 3_000,
      schema: THREAT_OUTPUT_SCHEMA,
      ground: groundThreat,
      count: (o) => (o as { findings: unknown[] }).findings.length,
      emptyCase: () => ({
        output: {
          overview: "No conversation messages are stored for this case yet — there is nothing to analyse.",
          findings: [],
          insights: [],
          recommendedSteps: ["Import or simulate a conversation, then run the analysis again."],
        },
        limitations: ["Empty conversation — no threat analysis possible."],
      }),
    });
  },
});

// ---------------------------------------------------------------------------
// Module 2 — Intent & Behaviour Prediction
// ---------------------------------------------------------------------------

export const PREDICTION_SYSTEM = `You are the Intent & Behaviour Prediction Engine for JAAL, a scam-analysis training platform running a CONTROLLED SIMULATION. You estimate plausible next actions from the conversation's CURRENT state — predictive assistance, never certainty.

${SECURITY_PREAMBLE}

Method: identify the current conversational state, previously observed tactics, the scammer's apparent objective if supported, and behavioural escalation patterns; generate multiple plausible next-action hypotheses; rank them with qualitative confidence.

Rules:
- Predictions must come from THIS conversation's context, not generic scam templates.
- Use qualitative confidence labels only (low/medium/high) — never numeric probabilities.
- Every prediction MUST cite 1-3 message aliases with EXACT excerpts from those messages.
- If the conversation is too thin to predict reliably, set "insufficientInformation" to true and return an empty predictions array.
- Predictions are NOT observed events — phrase them as possibilities.

Output ONLY this JSON:
{"insufficientInformation":false,
 "currentStrategy":"what the scammer appears to be doing right now",
 "predictions":[{"action":"predicted next action","category":"MONEY_REQUEST|OTP_REQUEST|IDENTITY_DOCUMENT|SUSPICIOUS_LINK|LEGAL_THREAT|URGENCY_ESCALATION|NEW_AUTHORITY|REMOTE_ACCESS|CREDENTIAL_THEFT|REPETITION|OTHER","explanation":"why the conversation points this way","messageRefs":[{"alias":"M5","quote":"exact excerpt"}],"confidence":"low|medium|high","risk":"LOW|MEDIUM|HIGH|CRITICAL","suggestedResponse":"what the investigator should prepare","uncertainty":"what could make this prediction wrong"}],
 "indicators":[{"label":"behavioural indicator","level":"LOW|MEDIUM|HIGH|CRITICAL"}]}`;

export const predictionAction = action({
  args: { caseId: v.string(), force: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<ModuleRunResult> => {
    return runModule({
      ctx,
      caseId: args.caseId,
      module: "prediction",
      kind: "prediction",
      force: args.force,
      system: PREDICTION_SYSTEM,
      maxTokens: 2_400,
      schema: PREDICTION_OUTPUT_SCHEMA,
      ground: groundPrediction,
      count: (o) => (o as { predictions: unknown[] }).predictions.length,
      emptyCase: () => ({
        output: {
          insufficientInformation: true,
          currentStrategy: "No conversation recorded yet.",
          predictions: [],
          indicators: [],
        },
        limitations: ["Empty conversation — nothing to predict from."],
      }),
    });
  },
});

// ---------------------------------------------------------------------------
// Module 4 — Evidence Correlation (deterministic pre-pass + AI context pass)
// ---------------------------------------------------------------------------

export const CORRELATION_SYSTEM = `You are the Evidence Correlation Engine for JAAL, a scam-analysis training platform running a CONTROLLED SIMULATION. You suggest POTENTIAL relationships between entities in <case_data> for a human investigator to review.

${SECURITY_PREAMBLE}

Rules:
- The backend already performs exact string matching (repeated identifiers, payment/tactic co-occurrence). Do not repeat exact-match relationships — interpret CONTEXT: an indicator's role, pattern repetition across messages, tactic/payment linkage, cross-channel signals.
- Never claim two indicators belong to the same person merely because they appear in the same conversation.
- Distinguish exact identity from contextual similarity in your explanation.
- Every suggestion must cite its supporting message/evidence aliases where they exist.
- Suggest only relationships between entities listed in <case_data>.

Output ONLY this JSON:
{"suggestions":[{"sourceAlias":"E1","targetAlias":"M3","relation":"REPEATED_IDENTIFIER|SHARED_TACTIC|PAYMENT_TACTIC|CROSS_CHANNEL_PATTERN|CONTEXTUAL_LINK","category":"short relationship label","explanation":"why these may be related, grounded in the data","messageAliases":["M3"],"evidenceAliases":["E1"],"confidence":"low|medium|high"}]}`;

export const correlationSuggestAction = action({
  args: { caseId: v.string(), force: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<ModuleRunResult> => {
    return runModule({
      ctx,
      caseId: args.caseId,
      module: "correlation",
      kind: "correlation",
      force: args.force,
      system: CORRELATION_SYSTEM,
      maxTokens: 2_000,
      schema: CORRELATION_OUTPUT_SCHEMA,
      ground: (parsed, index) => {
        const grounded = groundCorrelation(parsed, index);
        return {
          output: grounded.output,
          droppedRefs: grounded.droppedRefs,
          droppedFindings: grounded.droppedFindings,
        };
      },
      count: (o) => (o as unknown[]).length,
      beforeProvider: async () => {
        // Deterministic rule pass first — exact matching never needs the model.
        await ctx.runMutation(api.intelligence.deriveCorrelations, {
          caseId: args.caseId,
        });
      },
      onCompleted: async (output, caseCtx) => {
        // Persist grounded suggestions — ALWAYS PENDING_REVIEW; the
        // investigator must accept/reject each one.
        await ctx.runMutation(internal.intelligence.saveCorrelationSuggestions, {
          caseId: args.caseId,
          fingerprint: caseCtx.fingerprint,
          suggestions: output as Array<{
            source: unknown;
            target: unknown;
            relation: string;
            category: string;
            explanation: string;
            messageRefs: string[];
            evidenceRefs: string[];
            confidence: "low" | "medium" | "high";
          }>,
        });
      },
      emptyCase: () => ({
        output: [],
        limitations: ["Empty conversation — no entities to correlate."],
      }),
    });
  },
});

// ---------------------------------------------------------------------------
// Module 5 — Forensic Report Assistant
// ---------------------------------------------------------------------------

export const REPORT_SYSTEM = `You are the Forensic Report Assistant for JAAL, a scam-analysis training platform running a CONTROLLED SIMULATION. You write narrative report sections grounded STRICTLY in <case_data>. You organise and explain — you never invent facts.

${SECURITY_PREAMBLE}

Rules:
- Every factual statement must trace to messages, tactics, indicators or integrity records in <case_data>.
- Do not invent messages, evidence, timestamps, identities, relationships or verification results.
- Hashes, evidence inventories and integrity status are assembled deterministically by the system — do not restate or alter them.
- Keep observed facts distinct from interpretation; add honest limitations.

Output ONLY this JSON:
{"overview":"investigation overview","incidentSummary":"incident summary","scope":"investigation scope","conversationAnalysis":"how the conversation developed and what it shows","behaviourAnalysis":"manipulation and behaviour patterns","recommendations":["next investigative step"],"limitations":["honest limitation / unknown"]}`;

export const reportAssistAction = action({
  args: { caseId: v.string(), force: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<ModuleRunResult> => {
    return runModule({
      ctx,
      caseId: args.caseId,
      module: "report",
      kind: "report",
      force: args.force,
      system: REPORT_SYSTEM,
      maxTokens: 2_600,
      schema: REPORT_OUTPUT_SCHEMA,
      // Prose sections only — no model citations to resolve, so grounding
      // degenerates to schema validation + bounded lengths.
      ground: (parsed) => ({
        output: parsed,
        droppedRefs: 0,
        droppedFindings: 0,
      }),
      count: (o) => (o as { recommendations: unknown[] }).recommendations.length,
      emptyCase: () => ({
        output: {
          overview: "No conversation has been recorded for this case yet.",
          incidentSummary: "No incident content available.",
          scope: "Case record only.",
          conversationAnalysis: "No conversation to analyse.",
          behaviourAnalysis: "No behaviour to analyse.",
          recommendations: ["Import or simulate a conversation before generating the report."],
          limitations: ["Empty conversation — narrative sections are minimal by design."],
        },
        limitations: ["Empty conversation — AI narrative unavailable."],
      }),
    });
  },
});

// ---------------------------------------------------------------------------
// Module 3 — Investigation Copilot (read-only Q&A)
// ---------------------------------------------------------------------------

export const COPILOT_SYSTEM = `You are the Investigation Copilot for JAAL, a scam-analysis training platform running a CONTROLLED SIMULATION. You answer an investigator's questions about ONE case using only the <case_data> block provided.

${SECURITY_PREAMBLE}

Rules:
- Read-only: you cannot and will not modify evidence, messages, hashes or ownership. Never claim to have changed anything.
- Ground every substantive point: cite message aliases (M<n>) with exact excerpts, or evidence aliases (E<k>), whenever the answer relies on them.
- If the case data does not contain the answer, say so explicitly ("sufficient": false) instead of guessing.
- Never invent messages, evidence, timestamps, identities or verification results.
- Answer the question directly first, then supporting points.

Output ONLY this JSON:
{"answer":"direct answer to the question","points":[{"text":"supporting point","messageRefs":[{"alias":"M7","quote":"exact excerpt"}],"evidenceRefs":["E1"]}],"uncertainty":"what the data does not settle","suggestedNextStep":"practical next step for the investigator","sufficient":true}`;

export const copilotAskAction = action({
  args: { caseId: v.string(), question: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ status: "COMPLETED" | "FAILED" | "UNAVAILABLE"; error: ErrorCategory | null }> => {
    const question = args.question.trim().slice(0, 2_000);
    if (question.length < 2) throw new Error("Question is too short.");

    const caseCtx = (await ctx.runQuery(api.intelligence.caseContext, {
      caseId: args.caseId,
    })) as CaseContext | null;
    if (!caseCtx) throw new Error("Investigation not found");

    try {
      await ctx.runMutation(api.jaal.recordAiRequest, {
        caseId: args.caseId,
        kind: "copilot",
      });
    } catch {
      return { status: "FAILED", error: "rate-limited" };
    }

    // The question is recorded first so the exchange stays auditable even if
    // the provider cannot answer.
    await ctx.runMutation(internal.intelligence.appendCopilotTurn, {
      caseId: args.caseId,
      role: "user",
      content: question,
    });

    const finish = async (
      status: "COMPLETED" | "FAILED" | "UNAVAILABLE",
      error: ErrorCategory | null,
      content?: string,
      sections?: unknown,
    ) => {
      await ctx.runMutation(internal.intelligence.appendCopilotTurn, {
        caseId: args.caseId,
        role: "assistant",
        content:
          content ??
          `The copilot could not complete this answer (${error ?? "error"}). No response was generated.`,
        sections,
        status,
        error: error ?? undefined,
      });
      await ctx.runMutation(internal.intelligence.logAnalysis, {
        caseId: args.caseId,
        level: status === "COMPLETED" ? "info" : "warn",
        message: `AI copilot turn ${status}${error ? ` (${error})` : ""}`,
      });
      return { status, error } as const;
    };

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return finish("UNAVAILABLE", "no-api-key");

    try {
      const history = (await ctx.runQuery(api.intelligence.copilotHistory, {
        caseId: args.caseId,
      })) as { role: string; content: string }[];

      const index = aliasIndexFromContext(caseCtx);
      const contextBlock = buildContextBlock(caseCtx);
      const recent = history
        .slice(-8)
        .map((h) => `${h.role === "user" ? "INVESTIGATOR" : "COPILOT"}: ${h.content.slice(0, 600)}`)
        .join("\n");
      const userContent = [
        contextBlock,
        recent ? `\n<previous_turns>\n${recent}\n</previous_turns>` : "",
        `\n<question>\n${question}\n</question>`,
      ].join("\n");

      const text = await callGroq(apiKey, COPILOT_SYSTEM, userContent, 1_400, {
        json: true,
      });
      if (!text) return finish("FAILED", "malformed-output");
      const parsed = COPILOT_OUTPUT_SCHEMA.safeParse(
        extractJson(sanitize(text, 32_000)),
      );
      if (!parsed.success) return finish("FAILED", "invalid-output");

      const grounded = groundCopilot(parsed.data, index);
      const limitations: string[] = [];
      if (grounded.droppedRefs > 0) {
        limitations.push(
          `${grounded.droppedRefs} reference(s) did not resolve to case records and were rejected.`,
        );
      }
      const sections = { ...grounded.output, limitations };
      const refChips = grounded.output.points.flatMap((p) => [
        ...p.messageRefs.map((r) => ({ kind: "message", id: r.messageId, n: r.n, label: `MSG #${r.n}`, quote: r.quote })),
        ...p.evidenceRefs.map((e) => ({ kind: "evidence", id: e.evidenceId, n: 0, label: e.alias, quote: "" })),
      ]);
      return await finish("COMPLETED", null, grounded.output.answer, {
        ...sections,
        refs: refChips,
      });
    } catch (err) {
      return finish("FAILED", categorize(err));
    }
  },
});
