import { v } from "convex/values";
import { z } from "zod";
import { api } from "./_generated/api";
import { action } from "./_generated/server";
import { getOwner } from "./lib/backend";
import { callGroq, describeGroqError } from "./groqClient";

/**
 * Optional Groq enrichment for the deterministic attack plan.
 *
 * The model receives only endpoint metadata and already-selected tests. Its
 * output is stored as advisory text on the plan; it cannot add a test, change
 * a host/method/budget, or authorize execution. If the key is absent or the
 * provider is unavailable, the caller gets an honest unavailable result and
 * the deterministic plan remains unchanged.
 */

const SYSTEM = `You are a senior application-security planner for a B2B travel platform.
You will receive a JSON array of tests that have ALREADY been selected by a deterministic engine.
For each testKey, write one concise, specific rationale (max 70 words) explaining why this business-logic test matters for the changed travel endpoint.
Rules:
- Return JSON only: {"plans":[{"testKey":"...","rationale":"..."}]}.
- Use only the supplied testKeys. Never invent an endpoint, host, URL, test, or finding.
- Do not claim a vulnerability exists; these are unexecuted plans.
- Focus on agency isolation, booking/payment/refund/credit impact.
- No markdown, no links, no secrets.`;

const AiPlanSchema = z.object({
  plans: z
    .array(
      z.object({
        testKey: z.string().min(1).max(80),
        rationale: z.string().min(1).max(800),
      }),
    )
    .max(12),
});

export const enrichPlans = action({
  args: { id: v.id("dastInvestigations") },
  handler: async (ctx, args) => {
    const owner = await getOwner(ctx);
    const detail = await ctx.runQuery(api.dast.investigation, { id: args.id });
    if (!detail || detail.investigation.owner !== owner) {
      throw new Error("Investigation not found.");
    }
    const key = process.env.GROQ_API_KEY;
    if (!key) {
      return {
        ok: false,
        reason: "GROQ_API_KEY is not configured on the Convex deployment.",
        count: 0,
      };
    }

    const payload = {
      deployment: detail.deployment?.version ?? "unknown",
      environment: "SYNTHETIC_LAB",
      tests: detail.plans.map((plan) => ({
        testKey: plan.testKey,
        category: plan.category,
        title: plan.title,
        endpoint: plan.title,
        role: plan.role,
        risk: plan.risk,
        expected: plan.expected,
        fixture: plan.fixture,
      })),
    };

    let text: string | null;
    try {
      text = await callGroq(key, SYSTEM, JSON.stringify(payload), 900, {
        json: true,
        temperature: 0.1,
      });
    } catch (error) {
      return { ok: false, reason: describeGroqError(error), count: 0 };
    }
    if (!text) {
      return { ok: false, reason: "Groq returned no advisory text.", count: 0 };
    }

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return { ok: false, reason: "Groq returned invalid JSON.", count: 0 };
    }
    const parsed = AiPlanSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, reason: "Groq response did not match the plan schema.", count: 0 };
    }

    const known = new Set(detail.plans.map((plan) => plan.testKey));
    const selected = new Map(
      detail.plans.map((plan) => [plan.testKey, plan._id] as const),
    );
    let count = 0;
    for (const item of parsed.data.plans) {
      if (!known.has(item.testKey)) continue;
      const planId = selected.get(item.testKey);
      if (!planId) continue;
      await ctx.runMutation(api.dast.setPlanAiRationale, {
        planId,
        rationale: item.rationale,
      });
      count += 1;
    }
    return {
      ok: count > 0,
      reason: count > 0 ? null : "No known test keys were returned.",
      count,
    };
  },
});
