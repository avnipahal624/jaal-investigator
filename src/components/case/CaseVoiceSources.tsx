import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AudioLines, Loader2 } from "lucide-react";

type VoiceFindingRow = {
  _id: string;
  fileName: string;
  transcript: string | null;
  analysis: {
    findings?: Array<{
      id: string;
      tactic: string;
      excerpt: string;
      explanation: string;
      timestampMs?: number;
    }> | null;
  };
  findingReviews: Record<string, { verdict: string }> | null;
};

const fmt = (ms?: number) => {
  if (typeof ms !== "number") return "timestamp unavailable";
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * A non-graph view of reviewed audio findings. It uses the same persisted
 * review state as the Voice & Calls tab; nothing is inferred here.
 */
export function CaseVoiceSources({
  caseId,
  onOpenFinding,
}: {
  caseId: string;
  onOpenFinding: (recordingId: string, atMs?: number) => void;
}) {
  const rows = useQuery(api.caseWorkspace.getCaseVoice, { caseId }) as VoiceFindingRow[] | undefined;
  if (rows === undefined) {
    return (
      <div className="flex items-center gap-2 p-4 text-[11px] text-jmuted">
        <Loader2 className="size-3.5 animate-spin text-jcyan" /> Loading audio findings…
      </div>
    );
  }
  const accepted = rows.flatMap((recording) =>
    (recording.analysis.findings ?? [])
      .filter((finding) => recording.findingReviews?.[finding.id]?.verdict === "accepted")
      .map((finding) => ({ recording, finding })),
  );

  return (
    <div className="h-full overflow-y-auto border-l border-jborder/60 bg-jsurface/30 p-3">
      <p className="jaal-label !text-jcyan">Reviewed audio sources</p>
      <p className="mt-1 text-[10px] leading-relaxed text-jmuted">
        Findings a person accepted from a recording. Open one to seek the audio; rejected findings are excluded.
      </p>
      {accepted.length === 0 ? (
        <p className="mt-3 border border-jborder/50 bg-jsurface/40 p-2 text-[10px] text-jmuted">
          No accepted audio findings yet. Review a recording in Voice &amp; Calls.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {accepted.map(({ recording, finding }) => (
            <button
              key={`${recording._id}-${finding.id}`}
              type="button"
              onClick={() => onOpenFinding(recording._id, finding.timestampMs)}
              className="w-full border border-jborder/60 bg-jsurface/50 p-2.5 text-left transition-colors hover:border-jcyan/40"
            >
              <span className="flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-wider text-jcyan">
                <AudioLines className="size-3" /> {fmt(finding.timestampMs)}
              </span>
              <span className="mt-1 block text-[11px] font-medium text-jtext">{finding.tactic}</span>
              <span className="mt-1 block text-[10px] leading-relaxed text-jmuted">{finding.excerpt || finding.explanation}</span>
              <span className="mt-1 block truncate font-mono text-[8px] text-jmuted/70">{recording.fileName}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
