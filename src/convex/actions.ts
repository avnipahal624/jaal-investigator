"use node";

/**
 * AI-augmented workflow actions.
 *
 * Convex mutations cannot call actions, so the LLM steps live here: each
 * action runs the deterministic mutation first (message persistence, tactic
 * analysis, evidence extraction, SHA-256 hashing, kill-chain, rule-based
 * strategy), then attempts the Groq provider and supersedes the pending
 * strategy with a model suggestion when one is available. On any failure the
 * deterministic result stands and the fallback is recorded in the logs.
 *
 * Secrets (GROQ_API_KEY, GROQ_MODEL) are read only in the Node runtime and
 * never exposed to the browser.
 */
import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import type { EvidenceReport } from "@/types/report";

interface TurnResult {
  reply: string | null;
  completed: boolean;
  exhausted: boolean;
}

type Suggestion = {
  objective: string;
  informationGap: string;
  suggestedQuestion: string;
  reason: string;
};

async function tryLLMStrategy(
  ctx: ActionCtx,
  caseId: string,
): Promise<void> {
  // The action takes only the caseId: it verifies identity + ownership
  // server-side, rate-limits the caller and fetches the transcript itself.
  try {
    const res = await ctx.runAction(api.ai.strategyAction, { caseId });
    if (res.suggestion) {
      await ctx.runMutation(api.jaal.applyStrategyOverride, {
        caseId,
        override: res.suggestion as Suggestion,
      });
    } else if (res.fallbackReason) {
      await ctx.runMutation(api.jaal.applyStrategyOverride, {
        caseId,
        fallbackReason: res.fallbackReason,
      });
    }
  } catch (err) {
    await ctx.runMutation(api.jaal.applyStrategyOverride, {
      caseId,
      fallbackReason: err instanceof Error ? err.message : "provider error",
    });
  }
}

/** Send a decoy message with optional LLM strategy enrichment. */
export const sendMessageWithAI = action({
  args: { caseId: v.string(), text: v.string() },
  handler: async (ctx, { caseId, text }): Promise<TurnResult> => {
    const result: TurnResult = await ctx.runMutation(api.jaal.sendMessage, {
      caseId,
      text,
    });
    if (!result.exhausted && !result.completed) {
      await tryLLMStrategy(ctx, caseId);
    }
    return result;
  },
});

/** Advance the simulation with optional LLM strategy enrichment. */
export const simulationNextWithAI = action({
  args: { caseId: v.string() },
  handler: async (ctx, { caseId }): Promise<TurnResult> => {
    const result: TurnResult = await ctx.runMutation(api.jaal.simulationNext, {
      caseId,
    });
    if (!result.exhausted && !result.completed) {
      await tryLLMStrategy(ctx, caseId);
    }
    return result;
  },
});

/** Approve the pending strategy (optionally edited) with LLM enrichment. */
export const approveStrategyWithAI = action({
  args: { caseId: v.string(), editedText: v.optional(v.string()) },
  handler: async (ctx, { caseId, editedText }): Promise<TurnResult> => {
    const result: TurnResult = await ctx.runMutation(api.jaal.approveStrategy, {
      caseId,
      editedText,
    });
    if (!result.exhausted && !result.completed) {
      await tryLLMStrategy(ctx, caseId);
    }
    return result;
  },
});

/**
 * Generate the report deterministically, then replace the summary with an
 * LLM-written one when the provider is configured and responds.
 */
export const generateReportWithAI = action({
  args: {
    caseId: v.string(),
    reportId: v.optional(v.string()),
    generatedAt: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<EvidenceReport> => {
    const report: EvidenceReport = await ctx.runMutation(
      api.jaal.generateReport,
      {
        caseId: args.caseId,
        reportId: args.reportId,
        generatedAt: args.generatedAt,
      },
    );
    try {
      // Ownership-checked + rate-limited inside the action; the deterministic
      // summary stands whenever it returns null.
      const res = await ctx.runAction(api.ai.summaryAction, {
        caseId: args.caseId,
      });
      if (res?.summary) {
        await ctx.runMutation(api.jaal.applyReportSummary, {
          caseId: args.caseId,
          reportId: report.id,
          summary: res.summary,
          engineMode: res.engineMode,
        });
      }
    } catch {
      /* deterministic summary stands */
    }
    return report;
  },
});
