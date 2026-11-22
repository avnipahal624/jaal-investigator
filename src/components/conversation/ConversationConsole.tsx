import { MessageComposer } from "@/components/conversation/MessageComposer";
import { MessageRow, TypingIndicator } from "@/components/conversation/MessageRow";
import { Chip, RUN_STATUS_STYLE } from "@/components/ui/panel";
import { useJaal } from "@/state/JaalProvider";
import { useSimulation } from "@/hooks/useSimulation";
import type { CaseRuntime, Investigation } from "@/types/investigation";
import { cn } from "@/lib/utils";
import {
  ArrowDown,
  Eye,
  FastForward,
  FileStack,
  Pause,
  Play,
  Radio,
  RotateCcw,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";

/**
 * LIVE INTERCEPT — the dominant conversation panel. Scammer lines use muted
 * red accents, JAAL decoy lines use cyan. New messages animate in and briefly
 * highlight.
 */
export function ConversationConsole({
  investigation,
  runtime,
  highlightId,
}: {
  investigation: Investigation;
  runtime: CaseRuntime;
  /** Scroll to + flash this message (evidence “open source” action). */
  highlightId?: string | null;
}) {
  const { ingestTranscript, notify, advanceSimulation, togglePause } = useJaal();
  const {
    send,
    reset,
    isRunning,
    isPaused,
    isCompleted,
    isTyping,
    suggestions,
  } = useSimulation(investigation.id);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [stickToBottom, setStickToBottom] = useState(true);
  const [freshId, setFreshId] = useState<string | null>(null);
  const [revealedSensitive, setRevealedSensitive] = useState<Set<string>>(new Set());

  const messages = runtime.messages;
  const sensitiveCase = /blackmail|sextortion/i.test(investigation.category);
  const lastId = messages[messages.length - 1]?.id ?? null;

  useEffect(() => {
    if (!stickToBottom) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, isTyping, stickToBottom]);

  // Briefly highlight the newest message.
  useEffect(() => {
    if (!lastId) return;
    setFreshId(lastId);
    const t = window.setTimeout(() => setFreshId(null), 2400);
    return () => window.clearTimeout(t);
  }, [lastId]);

  // Evidence → “open source message” jumps here.
  useEffect(() => {
    if (!highlightId) return;
    const t = window.setTimeout(() => {
      document
        .getElementById(`msg-${highlightId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
    return () => window.clearTimeout(t);
  }, [highlightId]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setStickToBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 60);
  };

  const scrollToLatest = () => {
    setStickToBottom(true);
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  };

  const handleImport = async (file: File | undefined) => {
    if (!file) return;
    const raw = await file.text();
    const count = ingestTranscript(investigation.id, raw);
    if (count === 0) {
      notify({
        title: "Transcript not parsed",
        detail: "Use lines in the form “Name: message”.",
        caseId: investigation.id,
        kind: "system",
      });
    }
  };

  const pasteImport = () => {
    const sample = window.prompt(
      "Paste transcript lines (form: “Scammer: …” / “Me: …”):",
    );
    if (sample) ingestTranscript(investigation.id, sample);
  };

  const scammerCount = messages.filter((m) => m.author === "scammer").length;
  const decoyCount = messages.filter((m) => m.author === "decoy").length;

  return (
    <section className="jaal-panel jaal-hud relative flex h-full min-h-0 flex-col">
      {/* Header */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-jborder/60 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Radio className={cn("size-3.5 shrink-0", isRunning ? "text-jred jaal-pulse" : "text-jmuted")} />
          <p className="jaal-label !text-jcyan">Live intercept</p>
          <Chip style={RUN_STATUS_STYLE[runtime.status]} pulse={isRunning}>
            {runtime.status === "running" ? "live" : runtime.status}
          </Chip>
          <span className="hidden font-mono text-[9px] uppercase tracking-widest text-jmuted sm:inline">
            {messages.length} msgs · {scammerCount} suspect · {decoyCount} decoy
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => togglePause(investigation.id)}
            disabled={isCompleted}
            title={isPaused ? "Resume simulation" : "Pause simulation"}
            className="flex size-6 items-center justify-center border border-jborder/70 text-jmuted transition-colors hover:border-jamber/60 hover:text-jamber disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isPaused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => void advanceSimulation(investigation.id)}
            disabled={!isRunning || isTyping}
            title="Trigger next synthetic scammer line"
            className="flex items-center gap-1 border border-jred/50 bg-jred/10 px-1.5 py-1 font-mono text-[9px] uppercase tracking-wider text-jred transition-colors hover:bg-jred/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <FastForward className="size-3" /> next line
          </button>
          <button
            type="button"
            onClick={pasteImport}
            title="Paste transcript"
            className="flex size-6 items-center justify-center border border-jborder/70 text-jmuted transition-colors hover:border-jcyan/60 hover:text-jcyan"
          >
            <FileStack className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={reset}
            title="Clear simulation (reset)"
            className="flex size-6 items-center justify-center border border-jborder/70 text-jmuted transition-colors hover:border-jred/60 hover:text-jred"
          >
            <RotateCcw className="size-3.5" />
          </button>
        </div>
      </header>

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="relative min-h-0 flex-1 overflow-y-auto px-2 py-2"
      >
        <div className="jaal-grid-fine pointer-events-none absolute inset-0 opacity-40" />
        <div className="relative space-y-1.5">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-center">
              <p className="text-sm text-jmuted">No intercept content yet.</p>
              <p className="font-mono text-[10px] uppercase tracking-widest text-jmuted/60">
                Reset the simulation to seed the opening line
              </p>
            </div>
          )}
          {messages.map((m, i) => {
            const sensitive =
              sensitiveCase &&
              m.author === "scammer" &&
              /private (photos|images|material)|intimate|nude|naked|sexual/i.test(m.text);
            if (sensitive && !revealedSensitive.has(m.id)) {
              return (
                <div
                  key={m.id}
                  id={`msg-${m.id}`}
                  className="border border-jamber/30 bg-jamber/5 px-3 py-2.5"
                >
                  <p className="font-mono text-[8px] uppercase tracking-wider text-jamber">
                    Sensitive blackmail excerpt · hidden by default
                  </p>
                  <p className="mt-1 text-[11px] text-jmuted">
                    This message refers to private material. JAAL does not display it unless you choose to.
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setRevealedSensitive((current) => new Set(current).add(m.id))
                    }
                    className="mt-2 inline-flex items-center gap-1.5 border border-jamber/40 px-2 py-1 font-mono text-[8px] uppercase tracking-wider text-jamber"
                  >
                    <Eye className="size-3" /> Show this excerpt
                  </button>
                </div>
              );
            }
            return (
              <MessageRow
                key={m.id}
                message={m}
                number={i + 1}
                highlight={highlightId === m.id || freshId === m.id}
              />
            );
          })}
          {isTyping && <TypingIndicator />}
        </div>

        {!stickToBottom && messages.length > 0 && (
          <button
            type="button"
            onClick={scrollToLatest}
            className="sticky bottom-2 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 border border-jcyan/50 bg-jsurface px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-jcyan shadow-lg transition-colors hover:bg-jcyan/15"
          >
            <ArrowDown className="size-3" /> latest
          </button>
        )}
      </div>

      {/* Completion banner */}
      {isCompleted && (
        <div className="shrink-0 border-t border-jgreen/40 bg-jgreen/10 px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-wider text-jgreen">
                Simulation complete
              </p>
              <p className="text-[10px] text-jmuted">
                Script exhausted — evidence preserved below.
              </p>
            </div>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={reset}
                className="flex items-center gap-1 border border-jgreen/50 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-jgreen transition-colors hover:bg-jgreen/15"
              >
                <RotateCcw className="size-3" /> Restart
              </button>
              <Link
                to={`/investigations/${investigation.id}/complete`}
                className="border border-jcyan/50 bg-jcyan/10 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-jcyan transition-colors hover:bg-jcyan/20"
              >
                View completion
              </Link>
            </div>
          </div>
        </div>
      )}

      {isPaused && !isCompleted && (
        <div className="shrink-0 border-t border-jamber/40 bg-jamber/10 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-jamber">
              Simulation paused — intercept frozen.
            </p>
            <button
              type="button"
              onClick={() => togglePause(investigation.id)}
              className="border border-jamber/50 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-jamber transition-colors hover:bg-jamber/15"
            >
              Resume
            </button>
          </div>
        </div>
      )}

      <MessageComposer
        disabled={isPaused || isCompleted}
        disabledReason={
          isCompleted
            ? "Script exhausted. Restart the simulation or open the completion screen."
            : "Simulation paused — resume to send the next decoy reply."
        }
        suggestions={suggestions}
        busy={isTyping}
        onSend={(text) => void send(text)}
        onImport={handleImport}
      />
    </section>
  );
}
