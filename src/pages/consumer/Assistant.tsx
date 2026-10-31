import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useAction } from "convex/react";
import { useNavigate } from "react-router";
import {
  AlertTriangle,
  FileWarning,
  Minus,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { api } from "@/convex/_generated/api";

type ChatRole = "user" | "assistant";

interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  routeCategory?: string | null;
  error?: string | null;
}

const STARTERS = [
  "Is this message a scam?",
  "Someone is asking for my OTP. What should I do?",
  "I received a suspicious payment request.",
  "I think I have been scammed.",
  "Help me report a scam.",
  "How can I stay safe online?",
];

let idCounter = 0;
const nextId = () => `m-${Date.now()}-${idCounter++}`;

/**
 * JAAL Safety Assistant — floating chat on the consumer dashboard.
 *
 * Real AI backend: each turn calls the `assistantActions.safetyChatAction`
 * Convex action (Node runtime, Anthropic). There is no scripted fallback — if
 * the provider is unavailable the panel says so honestly and offers a retry.
 */
export default function Assistant() {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const navigate = useNavigate();
  const askSafety = useAction(api.assistantActions.safetyChatAction);

  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastSentRef = useRef<string | null>(null);

  // Focus the input when the panel opens / un-minimises.
  useEffect(() => {
    if (open && !minimized) {
      const t = window.setTimeout(() => inputRef.current?.focus(), 60);
      return () => window.clearTimeout(t);
    }
  }, [open, minimized]);

  // Keep the newest message in view.
  useEffect(() => {
    if (open && !minimized) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }
  }, [messages, sending, open, minimized]);

  // Escape closes the panel (desktop + mobile).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Click outside closes the panel.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || sending) return;
      lastSentRef.current = text;
      setInput("");

      const history = messages
        .filter((m) => !m.error && m.text)
        .map((m) => ({ role: m.role as "user" | "assistant", text: m.text }));

      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: "user", text },
      ]);
      setSending(true);

      try {
        const res = await askSafety({ question: text, history });
        if (res.status === "COMPLETED") {
          setMessages((prev) => [
            ...prev,
            {
              id: nextId(),
              role: "assistant",
              text: res.reply,
              routeCategory: res.routeCategory ?? null,
            },
          ]);
        } else {
          setMessages((prev) => [
            ...prev,
            {
              id: nextId(),
              role: "assistant",
              text: res.reply || res.error || "Something went wrong.",
              error: res.error,
            },
          ]);
        }
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            id: nextId(),
            role: "assistant",
            text: "I couldn't reach the assistant. Please check your connection and try again.",
            error: err instanceof Error ? err.message : "network error",
          },
        ]);
      } finally {
        setSending(false);
      }
    },
    [askSafety, messages, sending],
  );

  const retry = useCallback(() => {
    if (lastSentRef.current) void send(lastSentRef.current);
  }, [send]);

  const goToReport = useCallback(
    (category?: string | null) => {
      const cat = category && category !== "none" ? category : "other";
      setOpen(false);
      navigate(`/consumer/report?category=${encodeURIComponent(cat)}`);
    },
    [navigate],
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void send(input);
  };

  // -------------------------------------------------------------------------
  // Floating button
  // -------------------------------------------------------------------------
  const fab = (
    <button
      ref={buttonRef}
      type="button"
      onClick={() => {
        setOpen((o) => !o);
        setMinimized(false);
      }}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label="Ask JAAL — AI Safety Assistant"
      className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-[var(--color-consumer-primary)] pl-3.5 pr-4 py-3 text-white shadow-lg shadow-[var(--color-consumer-primary)]/25 transition-transform duration-200 hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-consumer-teal)] focus-visible:ring-offset-2"
    >
      <span className="relative flex items-center justify-center">
        <ShieldCheck className="w-5 h-5" strokeWidth={2} />
        <span className="absolute -right-1 -bottom-1 h-2.5 w-2.5 rounded-full bg-[var(--color-consumer-mint)] ring-2 ring-[var(--color-consumer-primary)]" />
      </span>
      <span className="text-sm font-semibold">Ask JAAL</span>
    </button>
  );

  if (!open) return fab;

  // -------------------------------------------------------------------------
  // Panel (near-full-screen on mobile, compact floating card on desktop)
  // -------------------------------------------------------------------------
  return (
    <>
      {fab}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="JAAL Safety Assistant"
        className="theme-consumer fixed z-50 flex flex-col overflow-hidden rounded-3xl border border-[var(--color-consumer-border)] bg-[var(--color-consumer-glass-strong)] shadow-2xl backdrop-blur-xl transition-all duration-200 ease-out
          inset-x-3 bottom-3 top-16
          sm:inset-auto sm:right-5 sm:bottom-24 sm:h-[560px] sm:w-[400px]"
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-[var(--color-consumer-border)] bg-white/70 px-4 py-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-consumer-primary)] text-white shadow-sm">
            <ShieldCheck className="w-5 h-5" strokeWidth={2} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[var(--color-consumer-deep)]">
              JAAL Safety Assistant
            </p>
            <p className="truncate text-xs text-[var(--color-consumer-muted)]">
              {minimized ? "Minimised" : "Here to help you stay safe"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setMinimized((m) => !m)}
            aria-label={minimized ? "Expand assistant" : "Minimise assistant"}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-consumer-muted)] transition-colors hover:bg-[var(--color-consumer-primary-soft)]"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              buttonRef.current?.focus();
            }}
            aria-label="Close assistant"
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-consumer-muted)] transition-colors hover:bg-[var(--color-consumer-primary-soft)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!minimized && (
          <>
            {/* Conversation */}
            <div
              ref={scrollRef}
              className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
            >
              <div className="rounded-2xl rounded-tl-sm border border-[var(--color-consumer-border)] bg-white px-4 py-3 text-sm leading-relaxed text-[var(--color-consumer-text)]">
                I'm here to help you understand suspicious online activity. Ask
                me anything, or pick a suggestion below.
              </div>

              {messages.map((m) =>
                m.role === "user" ? (
                  <div
                    key={m.id}
                    className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-[var(--color-consumer-primary)] px-4 py-3 text-sm leading-relaxed text-white"
                  >
                    {m.text}
                  </div>
                ) : (
                  <div key={m.id} className="space-y-2">
                    <div
                      className={`max-w-[92%] rounded-2xl rounded-tl-sm border px-4 py-3 text-sm leading-relaxed ${
                        m.error
                          ? "border-[var(--color-consumer-border)] bg-[var(--color-consumer-mint)] text-[var(--color-consumer-text)]"
                          : "border-[var(--color-consumer-border)] bg-white text-[var(--color-consumer-text)]"
                      }`}
                    >
                      {m.error && (
                        <span className="mb-1 flex items-center gap-1.5 text-[var(--color-consumer-teal)]">
                          <AlertTriangle className="w-4 h-4" />
                          <span className="text-xs font-semibold uppercase tracking-wide">
                            Assistant unavailable
                          </span>
                        </span>
                      )}
                      <p className="whitespace-pre-wrap">{m.text}</p>
                      {m.error ? (
                        <button
                          type="button"
                          onClick={retry}
                          disabled={sending}
                          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-consumer-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-consumer-primary)] transition-colors hover:bg-[var(--color-consumer-primary-soft)] disabled:opacity-50"
                        >
                          <RotateCcw className="w-3.5 h-3.5" /> Try again
                        </button>
                      ) : m.routeCategory ? (
                        <button
                          type="button"
                          onClick={() => goToReport(m.routeCategory)}
                          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-consumer-teal)] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:opacity-90"
                        >
                          <FileWarning className="w-3.5 h-3.5" /> Report this
                        </button>
                      ) : null}
                    </div>
                  </div>
                ),
              )}

              {sending && (
                <div className="inline-flex items-center gap-2 rounded-2xl rounded-tl-sm border border-[var(--color-consumer-border)] bg-white px-4 py-3 text-sm text-[var(--color-consumer-muted)]">
                  <span className="flex gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--color-consumer-primary)] [animation-delay:0ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--color-consumer-primary)] [animation-delay:120ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--color-consumer-primary)] [animation-delay:240ms]" />
                  </span>
                  Thinking…
                </div>
              )}
            </div>

            {/* Suggested starters (only before the first user turn) */}
            {messages.length === 0 && (
              <div className="border-t border-[var(--color-consumer-border)] px-4 pt-3 pb-2">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[var(--color-consumer-muted)]">
                  <Sparkles className="w-3.5 h-3.5 text-[var(--color-consumer-teal)]" />
                  Suggested questions
                </p>
                <div className="flex flex-wrap gap-2">
                  {STARTERS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => void send(s)}
                      disabled={sending}
                      className="rounded-full border border-[var(--color-consumer-border)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--color-consumer-text-soft)] transition-colors hover:border-[var(--color-consumer-primary)] hover:text-[var(--color-consumer-primary)] disabled:opacity-50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Input */}
            <form
              onSubmit={submit}
              className="border-t border-[var(--color-consumer-border)] bg-white/70 px-3 py-3"
            >
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send(input);
                    }
                  }}
                  rows={1}
                  placeholder="Describe what happened or ask a question…"
                  aria-label="Message the JAAL Safety Assistant"
                  className="max-h-32 min-h-[44px] flex-1 resize-none rounded-xl border border-[var(--color-consumer-border)] bg-white px-3 py-2.5 text-sm text-[var(--color-consumer-text)] placeholder:text-[var(--color-consumer-muted)] focus:border-[var(--color-consumer-primary)] focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={sending || !input.trim()}
                  aria-label="Send message"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--color-consumer-primary)] text-white transition-opacity disabled:opacity-40"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
              <p className="mt-2 px-1 text-[11px] leading-snug text-[var(--color-consumer-muted)]">
                Assistance only — not an official fraud determination. Never share
                your OTP, PIN or password with anyone.
              </p>
            </form>
          </>
        )}
      </div>
    </>
  );
}
