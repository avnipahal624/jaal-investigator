"use node";

/**
 * Groq connectivity diagnostic (internal only).
 *
 * Reports facts about the deployment's Groq access without exposing secrets:
 * which chat models the key can see, whether the configured model is one of
 * them, and whether one minimal chat completion succeeds.
 */

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import {
  GROQ_CHAT_URL,
  callGroq,
  currentGroqModel,
} from "./groqClient";

function modelsUrl(): string {
  return GROQ_CHAT_URL.replace(/\/chat\/completions$/, "/models");
}

export const models = internalAction({
  args: {},
  handler: async () => {
    const key = (process.env.GROQ_API_KEY ?? "").trim();
    if (!key) return { keyPresent: false, error: "missing-key" as const };

    try {
      const res = await fetch(modelsUrl(), {
        headers: { authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        return { keyPresent: true, status: res.status, error: "models-request-failed" as const };
      }
      const data = (await res.json()) as { data?: { id?: string }[] };
      const ids = (data.data ?? [])
        .map((m) => m.id)
        .filter((id): id is string => typeof id === "string")
        .sort();
      const model = currentGroqModel();
      return {
        keyPresent: true,
        configuredModel: model,
        configuredModelAvailable: ids.includes(model),
        chatModels: ids.filter((id) => !/whisper|tts|orpheus|guard/i.test(id)),
        audioModels: ids.filter((id) => /whisper/i.test(id)),
      };
    } catch (err) {
      return {
        keyPresent: true,
        error: "network" as const,
        detail: /abort|timeout/i.test(String(err)) ? "timeout" : "fetch-failed",
      };
    }
  },
});

/** One real, minimal chat completion through the shared client. */
export const chat = internalAction({
  args: { prompt: v.optional(v.string()) },
  handler: async (_ctx, args) => {
    const key = (process.env.GROQ_API_KEY ?? "").trim();
    if (!key) return { ok: false, error: "missing-key" as const };

    const started = Date.now();
    try {
      const text = await callGroq(
        key,
        "You are a connectivity check. Reply with exactly one short sentence and nothing else.",
        args.prompt?.slice(0, 500) || "Say: JAAL Groq connection OK.",
        60,
        { temperature: 0 },
      );
      return {
        ok: true,
        model: currentGroqModel(),
        latencyMs: Date.now() - started,
        replied: Boolean(text && text.trim()),
        chars: text?.trim().length ?? 0,
        // Our own non-sensitive prompt/response, returned for verification.
        text: text?.trim().slice(0, 200) ?? null,
      };
    } catch (err) {
      const status = (err as { status?: number }).status;
      return {
        ok: false,
        model: currentGroqModel(),
        latencyMs: Date.now() - started,
        error: status ? `http-${status}` : "provider-error",
      };
    }
  },
});
