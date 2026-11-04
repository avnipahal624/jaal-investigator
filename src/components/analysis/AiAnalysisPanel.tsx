import { Chip } from "@/components/ui/panel";
import { TACTIC_META } from "@/services/investigationService";
import {
  buildStrategy,
  classifyIntent,
  STAGE_TACTIC_HINT,
} from "@/services/strategyService";
import { cn } from "@/lib/utils";
import { isAiEngine, statusDot } from "@/theme/status";
import type { CaseRuntime } from "@/types/investigation";
import { formatClock } from "@/utils/formatters";
import { Brain } from "lucide-react";
import { useMemo } from "react";

/**
 * Section 1 — AI MESSAGE ANALYSIS (~145px).
 *
 * Shows the latest scammer message under analysis: its number, derived intent,
 * the tactics matched in its content, and a short reason derived from those
 * matches. The pipeline strip at the bottom lights up per real analysis
 * state — no fabricated confidence percentages.
 */
export function AiAnalysisPanel({ runtime }: { runtime: CaseRuntime }) {
  const analysis = useMemo(() => {
    const index = [...runtime.messages]
      .map((m, i) => ({ m, i }))
      .filter((x) => x.m.author === "scammer")
      .pop();
    if (!index) return null;
    const message = index.m;
    const tactics = runtime.tactics.filter((t) => t.messageId === message.id);
    const stageHit = runtime.stages.find((s) => s.messageIds.includes(message.id));
    return {
      number: index.i + 1,
      message,
      tactics,
      intent: classifyIntent(
        tactics.map((t) => t.tactic),
        stageHit?.id ?? null,
      ),
      stageLabel: stageHit ? STAGE_TACTIC_HINT[stageHit.id] : null,
      stageReason: stageHit?.reason ?? null,
      hasIdentifiers: runtime.evidence.some(
        (e) => e.sourceMessageId === message.id,
      ),
      hasStrategy: buildStrategy(runtime) !== null,
    };
  }, [runtime.messages, runtime.tactics, runtime.stages, runtime.evidence]);

  if (!analysis) {
    return (
      <div className="flex flex-col items-center gap-1.5 px-3 py-6 text-center">
        <Brain className="size-5 text-jmuted/50" />
        <p className="text-xs text-jmuted">No scammer message to analyze yet.</p>
        <p className="font-mono text-[9px] uppercase tracking-widest text-jmuted/60">
          Analysis starts with the first inbound message
        </p>
      </div>
    );
  }

  // Short explanation derived from the actual detections on this message.
  const reason =
    analysis.tactics.length > 0
      ? analysis.tactics
          .map((t) => t.explanation)
          .join(" · ")
      : analysis.stageReason ?? "No tactic pattern matched this message.";

  const steps = [
    { label: "MSG", done: true },
    { label: "INTENT", done: true },
    { label: "TACTICS", done: analysis.tactics.length > 0 },
    { label: "IDS", done: analysis.hasIdentifiers },
    { label: "STRATEGY", done: analysis.hasStrategy },
    { label: "CHAIN", done: analysis.stageReason !== null },
  ];

  return (
    <div className="flex flex-col gap-1.5 p-2.5">
      {/* Message reference line */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="border border-jcyan/50 bg-jcyan/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-jcyan">
          MESSAGE #{String(analysis.number).padStart(2, "0")}
        </span>
        <span className="font-mono text-[9px] uppercase tracking-widest text-jmuted">
          {formatClock(analysis.message.timestamp)} · src{" "}
          {analysis.message.source}
        </span>
      </div>

      {/* Intent */}
      <div className="flex items-baseline gap-2">
        <span className="shrink-0 font-mono text-[9px] uppercase tracking-widest text-jmuted">
          Intent
        </span>
        <span className="min-w-0 truncate font-mono text-xs font-semibold text-jamber">
          {analysis.intent}
        </span>
      </div>

      {/* Tactics in this message */}
      <div className="flex items-start gap-2">
        <span className="mt-0.5 shrink-0 font-mono text-[9px] uppercase tracking-widest text-jmuted">
          Tactics
        </span>
        {analysis.tactics.length === 0 ? (
          <span className="min-w-0 text-[11px] text-jmuted">
            No tactic pattern matched this message.
          </span>
        ) : (
          <div className="flex min-w-0 flex-wrap gap-1">
            {analysis.tactics.map((t) => (
              <Chip key={t.id} tone="border-jred/50 bg-jred/10 text-jred">
                {TACTIC_META[t.tactic]?.name ?? t.tactic}
              </Chip>
            ))}
          </div>
        )}
      </div>

      {/* Reason — wraps, never clipped */}
      <div className="flex items-start gap-2">
        <span className="mt-0.5 shrink-0 font-mono text-[9px] uppercase tracking-widest text-jmuted">
          Reason
        </span>
        <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-jtext/90">
          {reason}
        </p>
      </div>

      {/* Analysis pipeline — each step bound to real state */}
      <div className="mt-auto flex flex-wrap items-center gap-x-1.5 gap-y-1 border-t border-jborder/50 pt-1.5">
        {steps.map((s, i) => (
          <span key={s.label} className="flex items-center gap-1.5">
            <span
              className={cn(
                "font-mono text-[8px] uppercase tracking-widest",
                s.done ? "text-jcyan" : "text-jmuted/40",
              )}
            >
              {s.done ? "✓" : "·"} {s.label}
            </span>
            {i < steps.length - 1 && (
              <span className="text-[8px] text-jmuted/30">›</span>
            )}
          </span>
        ))}
      </div>

      {/* Engine mode — GROQ only when the strategy came from a real, validated
          provider response; every rules-engine path (including provider
          errors) reads SIMULATION. */}
      <p className="flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-widest text-jmuted/70">
        <span
          className="size-1.5 shrink-0"
          style={{
            background: statusDot(
              "engine",
              isAiEngine(runtime.strategy?.source) ? "claude" : "simulation",
            ),
          }}
        />
        {isAiEngine(runtime.strategy?.source)
          ? "convex action · groq llm"
          : "local rules engine · simulation mode"}
      </p>
    </div>
  );
}
