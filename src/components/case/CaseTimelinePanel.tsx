import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { AudioLines, Clock3, Loader2, MessageSquare, ShieldCheck } from "lucide-react";

type TimelineRow = {
  id: string;
  kind: "message" | "finding" | "audio" | "event" | "action";
  title: string;
  detail: string;
  occurredAt: number;
  addedAt: number;
  timeUnknown: boolean;
  source: "USER_PROVIDED" | "SIMULATION";
  reviewStatus: string | null;
  sourceId: string;
  messageId: string | null;
  recordingId?: string | null;
  audioAtMs?: number | null;
};

const FILTERS = [
  { key: "all", label: "All events" },
  { key: "message", label: "Messages" },
  { key: "audio", label: "Audio" },
  { key: "finding", label: "Findings" },
  { key: "action", label: "Actions" },
  { key: "event", label: "Case events" },
  { key: "simulation", label: "Simulations" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

const fmt = (ms: number) =>
  new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const fmtAudio = (ms: number) => {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

export function CaseTimelinePanel({
  caseId,
  onOpenMessage,
  onOpenVoice,
  onOpenView,
}: {
  caseId: string;
  onOpenMessage: (messageId: string) => void;
  onOpenVoice: (recordingId: string, atMs?: number | null) => void;
  onOpenView: (view: "voice" | "board" | "actions") => void;
}) {
  const rows = useQuery(api.caseWorkspace.getCaseTimeline, { caseId }) as TimelineRow[] | undefined;
  const [filter, setFilter] = useState<FilterKey>("all");
  const filtered = useMemo(
    () =>
      (rows ?? []).filter((row) =>
        filter === "all"
          ? true
          : filter === "simulation"
            ? row.source === "SIMULATION"
            : row.kind === filter,
      ),
    [rows, filter],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="jaal-label !text-jcyan">Chronological evidence timeline</p>
          <h2 className="mt-1 text-lg font-semibold text-jtext">What happened, and when did JAAL learn it?</h2>
          <p className="mt-1 text-[11px] text-jmuted">
            Event time and added-to-JAAL time are shown separately. Upload time is never presented as the original call time.
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              className={cn(
                "border px-2.5 py-1 font-mono text-[8px] uppercase tracking-wider",
                filter === item.key ? "border-jcyan/50 bg-jcyan/10 text-jcyan" : "border-jborder/60 text-jmuted",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {rows === undefined ? (
        <div className="jaal-panel flex items-center gap-2 p-6 text-xs text-jmuted">
          <Loader2 className="size-4 animate-spin text-jcyan" /> Building timeline…
        </div>
      ) : filtered.length === 0 ? (
        <div className="jaal-panel p-8 text-center text-sm text-jmuted">
          No timeline events for this filter yet.
        </div>
      ) : (
        <div className="jaal-panel divide-y divide-jborder/40">
          {filtered.map((row) => {
            const Icon =
              row.kind === "audio" ? AudioLines : row.kind === "action" ? ShieldCheck : MessageSquare;
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => {
                  if (row.recordingId) onOpenVoice(row.recordingId, row.audioAtMs);
                  else if (row.messageId) onOpenMessage(row.messageId);
                  else if (row.kind === "audio") onOpenView("voice");
                  else if (row.kind === "action") onOpenView("actions");
                  else if (row.kind === "finding") onOpenView("board");
                }}
                className="flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-jcyan/[0.04]"
              >
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center border border-jborder/60 bg-jsurface">
                  <Icon className="size-3.5 text-jcyan" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[12px] font-medium text-jtext">{row.title}</span>
                    <span
                      className={cn(
                        "border px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider",
                        row.source === "SIMULATION"
                          ? "border-jamber/40 bg-jamber/10 text-jamber"
                          : "border-jcyan/30 bg-jcyan/5 text-jcyan",
                      )}
                    >
                      {row.source === "SIMULATION" ? "Simulation" : "User-provided"}
                    </span>
                    {row.reviewStatus && (
                      <span className="font-mono text-[8px] uppercase tracking-wider text-jmuted">
                        {row.reviewStatus.replace(/_/g, " ")}
                      </span>
                    )}
                  </span>
                  <span className="mt-1 block truncate text-[11px] text-jmuted">{row.detail}</span>
                  <span className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-[9px] text-jmuted/80">
                    <span className="flex items-center gap-1">
                      <Clock3 className="size-2.5" />
                      {row.timeUnknown ? "Time unknown" : fmt(row.occurredAt)} · added {fmt(row.addedAt)}
                    </span>
                    {row.recordingId && (
                      <span className="text-jcyan">
                        audio source {typeof row.audioAtMs === "number" ? `@ ${fmtAudio(row.audioAtMs)}` : "start"} →
                      </span>
                    )}
                    {row.timeUnknown && <span className="text-jamber">original event time unknown</span>}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
