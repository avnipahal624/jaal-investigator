import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Link, useParams } from "react-router";
import {
  ArrowLeft,
  Shield,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  FileAudio,
  Clock,
  HelpCircle,
  MessageSquare,
  Link2,
  Mic,
  Fingerprint,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { VoiceAssessment, VoiceFinding } from "@/types/consumer";

const ASSESSMENT_LABEL: Record<VoiceAssessment, string> = {
  HIGH_CONCERN: "High Concern",
  WARNING_SIGNS_FOUND: "Warning Signs Found",
  NO_OBVIOUS_WARNING_SIGNS: "No Obvious Warning Signs",
  UNABLE_TO_ASSESS: "Unable to Assess",
};

const INTAKE_LABEL: Record<string, string> = {
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under review",
  MORE_INFORMATION_NEEDED: "More info needed",
  ACCEPTED: "Accepted",
  CLOSED: "Closed",
};

type VoiceIntakeStatus =
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "MORE_INFORMATION_NEEDED"
  | "ACCEPTED"
  | "CLOSED";

const VERDICT_LABEL: Record<string, string> = {
  accepted: "Accepted",
  rejected: "Rejected",
  needs_further_review: "Needs further review",
};

function fmtTime(ms?: number): string {
  if (typeof ms !== "number") return "";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

// A string on a Convex query means the server rejected the caller with a
// role/authentication restriction (requireRole throws). Surface that honestly
// as a "requires investigator" state rather than a bare crash.
// ---------------------------------------------------------------------------
// Queue — consumer-facing list of the caller's own voice intake submissions,
// plus (for investigators) the full intake review queue.
// ---------------------------------------------------------------------------

function VoiceIntakeQueue({ isInvestigator }: { isInvestigator: boolean }) {
  const queue = useQuery(api.voice.intakeQueue);
  const loading = queue === undefined;
  const restricted = queue !== undefined && queue.restricted;
  const rows = queue !== undefined && !queue.restricted ? queue.rows : [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-jtext flex items-center gap-2">
          <Mic className="size-6 text-jcyan" />
          Voice Intake
        </h1>
        <p className="mt-1 text-sm text-jmuted">
          {isInvestigator
            ? "Call recordings submitted by consumers, awaiting review."
            : "Your voice scam submissions, ready for review or follow-up."}
        </p>
      </header>

      {restricted ? (
        <div className="jaal-panel p-6 text-center">
          <AlertTriangle className="size-6 text-jmuted mx-auto" />
          <p className="mt-2 text-sm text-jmuted">
            This list is available to authorised investigator accounts only.
          </p>
        </div>
      ) : (
        <>
          {loading ? (
            <div className="jaal-panel p-6 space-y-3" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 bg-jsurface rounded animate-pulse" />
              ))}
              <span className="sr-only">Loading voice intake…</span>
            </div>
          ) : rows.length === 0 ? (
            <div className="jaal-panel p-8 text-center">
              <FileAudio className="size-8 text-jmuted mx-auto" />
              <p className="mt-3 text-sm text-jmuted">
                No voice recordings have been submitted yet.
              </p>
            </div>
          ) : (
            <div className="jaal-panel divide-y divide-jborder/60">
              {rows.map((r) => (
                <Link
                  key={r._id}
                  to={`/voice-intake/${r._id}`}
                  className="flex items-center justify-between gap-4 p-4 hover:bg-jsurface/60 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-sm text-jcyan">{r.caseId}</p>
                    <p className="mt-0.5 truncate text-xs text-jmuted">
                      {r.fileName}
                      {r.callerPhone ? ` · ${r.callerPhone}` : ""}
                      {r.claimedIdentity ? ` · claimed: ${r.claimedIdentity}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {r.assessment && (
                      <span className="font-mono text-[10px] uppercase tracking-wider text-jamber">
                        {ASSESSMENT_LABEL[r.assessment]}
                      </span>
                    )}
                    <span className="font-mono text-[10px] uppercase tracking-wider text-jmuted">
                      {INTAKE_LABEL[r.intakeStatus] ?? r.intakeStatus}
                    </span>
                    <span className="font-mono text-[10px] text-jmuted/60">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail — full detail for one voice intake recording.
// Investigators see everything; consumers see only their own submission.
// ---------------------------------------------------------------------------function VoiceIntakeDetailConsumer({ recordingId }: { recordingId: Id<"voice_recordings"> }) {
  const detail = useQuery(api.voice.getVoiceRecording, { recordingId });
  const audio = useQuery(
    api.voice.getAudioUrl,
    { recordingId, asInvestigator: false },
  );

  const findings = (detail.analysis.findings as VoiceFinding[] | null) ?? [];
  const reviews = (detail.findingReviews as Record<string, { verdict: string }> | null) ?? {};
  const notes = (detail.internalNotes as { at: number; by: string; kind: string; text: string }[] | null) ?? [];

  const setStatus = async (status: VoiceIntakeStatus) => {
    const perm: Array<"SUBMITTED" | "UNDER_REVIEW" | "MORE_INFORMATION_NEEDED" | "ACCEPTED" | "CLOSED"> = [
      "SUBMITTED",
      "UNDER_REVIEW",
      "MORE_INFORMATION_NEEDED",
      "ACCEPTED",
      "CLOSED",
    ];
    if (!perm.includes(status)) return;
    setBusy(true);
    try {
      await setIntakeStatus({ recordingId, status });
    } finally {
      setBusy(false);
    }
  };

  const verdictFor = async (
    findingId: string,
    verdict: "accepted" | "rejected" | "needs_further_review",
  ) => {
    await reviewFinding({ recordingId, findingId, verdict });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <Link
            to="/voice-intake"
            className="inline-flex items-center gap-2 text-sm text-jmuted hover:text-jtext"
          >
            <ArrowLeft className="size-4" /> Back to intake
          </Link>
          <h1 className="mt-2 font-mono text-xl text-jcyan">{detail.caseId}</h1>
          <p className="text-xs text-jmuted">
            {detail.fileName} · {INTAKE_LABEL[detail.intakeStatus]}
          </p>
        </div>
        {detail.analysis && detail.analysis.assessment && (
          <span className="font-mono text-xs uppercase tracking-wider border border-jborder px-3 py-1 text-jamber">
            {ASSESSMENT_LABEL[detail.analysis.assessment]}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: audio, provenance, transcript */}
        <div className="lg:col-span-2 space-y-6">
          <section className="jaal-panel p-4">
            <h2 className="jaal-label mb-3">Original recording</h2>
            {audio?.url ? (
              <audio controls src={audio.url} className="w-full">
                Audio playback is not supported in this browser.
              </audio>
            ) : (
              <p className="text-sm text-jmuted">Audio URL unavailable.</p>
            )}
            <div className="mt-3 space-y-1 text-[11px] text-jmuted">
              <p className="flex items-center gap-1.5">
                <Fingerprint className="size-3.5 text-jgreen" />
                Integrity verified at processing time.
              </p>
              <p className="font-mono break-all">
                {detail.hashAlgorithm}: {detail.fileHash}
              </p>
              <p>
                {detail.sizeBytes} bytes
                {detail.durationSeconds ? ` · ${fmtTime(detail.durationSeconds * 1000)}` : ""}
              </p>
            </div>
          </section>

          {/* Consumer context */}
          <section className="jaal-panel p-4">
            <h2 className="jaal-label mb-3">Consumer-provided context</h2>
            <dl className="space-y-2 text-sm">
              {detail.callerPhone && (
                <Row label="Caller phone" value={detail.callerPhone} />
              )}
              {detail.claimedIdentity && (
                <Row label="Claimed identity" value={detail.claimedIdentity} />
              )}
              {detail.approximateCallAt && (
                <Row
                  label="Approx. call time"
                  value={new Date(detail.approximateCallAt).toLocaleString()}
                />
              )}
              <Row label="Money requested" value={detail.moneyRequested ? "Yes" : "No / not stated"} />
              <Row
                label="OTP/PIN/password requested"
                value={detail.credentialsRequested ? "Yes" : "No / not stated"}
              />
              <Row
                label="Money transferred or info shared"
                value={detail.moneyTransferredOrShared ? "Yes" : "No / not stated"}
              />
              {detail.whatHappened && (
                <Row label="What happened" value={detail.whatHappened} />
              )}
            </dl>
          </section>

          {/* Transcript */}
          <section className="jaal-panel p-4">
            <h2 className="jaal-label mb-3 flex items-center gap-2">
              Transcript
              {detail.transcriptSource === "CONSUMER_PROVIDED" && (
                <span className="font-mono text-[10px] uppercase text-jamber">
                  (consumer-provided)
                </span>
              )}
              {detail.transcriptSource === "SPEECH_PROVIDER" && (
                <span className="font-mono text-[10px] uppercase text-jgreen">
                  (speech-to-text)
                </span>
              )}
            </h2>
            {detail.transcript ? (
              detail.transcriptSegments && detail.transcriptSegments.length > 0 ? (
                <div className="space-y-1.5 max-h-80 overflow-y-auto text-sm">
                  {detail.transcriptSegments.map((seg, i) => (
                    <div key={i} className="flex gap-3">
                      {typeof seg.startMs === "number" && (
                        <button
                          type="button"
                          className="shrink-0 font-mono text-xs text-jcyan hover:underline"
                          onClick={() => {
                            const el = document.querySelector<HTMLAudioElement>("audio");
                            if (el && typeof seg.startMs === "number") {
                              el.currentTime = seg.startMs / 1000;
                              void el.play();
                            }
                          }}
                        >
                          {fmtTime(seg.startMs)}
                        </button>
                      )}
                      <p className="text-jtext">
                        {seg.speaker && <span className="font-medium text-jcyan">{seg.speaker}: </span>}
                        {seg.text}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-jtext whitespace-pre-wrap max-h-80 overflow-y-auto">
                  {detail.transcript}
                </p>
              )
            ) : (
              <p className="text-sm text-jmuted">
                No transcript available ({detail.transcription.status.toLowerCase()}).
              </p>
            )}
          </section>

          {/* Findings review */}
          <section className="jaal-panel p-4">
            <h2 className="jaal-label mb-3">AI findings</h2>
            {findings.length === 0 ? (
              <p className="text-sm text-jmuted">No findings produced.</p>
            ) : (
              <ul className="space-y-3">
                {findings.map((f) => {
                  const review = reviews[f.id]?.verdict;
                  return (
                    <li key={f.id} className="border border-jborder/60 bg-jsurface/60 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-medium text-jtext">{f.tactic}</p>
                        <span className="font-mono text-[10px] uppercase text-jmuted shrink-0">
                          {f.severity} · {f.confidence}
                        </span>
                      </div>
                      {f.excerpt && (
                        <blockquote className="mt-2 border-l-2 border-jcyan/60 pl-3 text-sm italic text-jmuted">
                          “{f.excerpt}”
                          {typeof f.timestampMs === "number" && (
                            <span className="not-italic font-mono text-xs ml-2">{fmtTime(f.timestampMs)}</span>
                          )}
                        </blockquote>
                      )}
                      <p className="mt-2 text-sm text-jmuted">{f.explanation}</p>
                      <p className="mt-1 text-xs text-jtext">
                        <span className="font-medium">Action: </span>
                        {f.recommendedAction}
                      </p>
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] text-jmuted">
                          {review ? VERDICT_LABEL[review] : "Awaiting decision"}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {/* Right: actions + status */}
        <div className="space-y-6">
          <section className="jaal-panel p-4">
            <h2 className="jaal-label mb-3">Review status</h2>
            <div className="flex flex-wrap gap-2">
              <p className="text-xs text-jmuted">
                {INTAKE_LABEL[detail.intakeStatus] ?? detail.intakeStatus}
              </p>
            </div>
            {detail.reviewedAt && (
              <p className="mt-3 flex items-center gap-1.5 text-[11px] text-jmuted">
                <Clock className="size-3" />
                Last reviewed {new Date(detail.reviewedAt).toLocaleString()}
              </p>
            )}
          </section>

          <section className="jaal-panel p-4">
            <h2 className="jaal-label mb-3 flex items-center gap-2">
              <MessageSquare className="size-3.5" /> Internal notes
            </h2>
            <p className="text-xs text-jmuted">
              Internal notes are available to authorised investigator accounts.
            </p>
            <ul className="mt-3 space-y-2">
              {notes.map((n, i) => (
                <li key={i} className="text-[11px] text-jmuted border-l-2 border-jborder pl-2">
                  <span className="font-mono">{new Date(n.at).toLocaleString()}</span>
                  <p className="mt-0.5 text-jtext">{n.text}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="jaal-panel p-4">
            <h2 className="jaal-label mb-3 flex items-center gap-2">
              <Link2 className="size-3.5" /> Link to case
            </h2>
            <p className="text-xs text-jmuted">
              Linking to a case is available to authorised investigator accounts.
            </p>
          </section>
        </div>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-jmuted">
        <Shield className="size-3.5 text-jgreen" />
        Investigator decisions are stored separately and never overwrite the
        original recording or the AI output.
      </div>
    </div>
  );
}

function VoiceIntakeDetailInvestigator({
  recordingId,
}: {
  recordingId: Id<"voice_recordings">;
}) {
  const detail = useQuery(api.voice.intakeDetail, { recordingId });
  const audio = useQuery(
    api.voice.getAudioUrl,
    { recordingId, asInvestigator: true },
  );

  const isDetailRestricted = detail !== undefined && detail.restricted;
  const detailData = detail?.restricted === false ? detail.recording : null;

  const setIntakeStatus = useMutation(api.voice.setIntakeStatus);
  const reviewFinding = useMutation(api.voice.reviewFinding);
  const addInternalNote = useMutation(api.voice.addInternalNote);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  if (detail === undefined) {
    return (
      <div className="jaal-panel p-6" aria-busy="true">
        <Loader2 className="size-5 animate-spin text-jcyan" />
        <span className="sr-only">Loading recording…</span>
      </div>
    );
  }

  if (isDetailRestricted) {
    return (
      <div className="space-y-6">
        <header className="border-b border-jborder/60 pb-3">
          <h1 className="text-2xl font-bold text-jtext flex items-center gap-2">
            <Mic className="size-6 text-jcyan" />
            Voice Intake
          </h1>
          <p className="mt-1 text-sm text-jmuted">
            Consumer-submitted call recordings waiting for review.
          </p>
        </header>
        <div className="jaal-panel p-8 text-center">
          <AlertTriangle className="size-8 text-jamber mx-auto" />
          <p className="mt-3 text-sm text-jmuted">
            This page is only available to authorised investigator accounts.
          </p>
        </div>
      </div>
    );
  }

  if (!detailData) {
    return (
      <div className="jaal-panel p-6 text-center">
        <AlertTriangle className="size-6 text-jmuted mx-auto" />
        <p className="mt-2 text-sm text-jmuted">
          Recording not found.
        </p>
        <Link
          to="/voice-intake"
          className="mt-3 inline-flex items-center gap-2 text-sm text-jcyan hover:underline"
        >
          <ArrowLeft className="size-4" /> Back to intake
        </Link>
      </div>
    );
  }  const findings = (detailData.analysis.findings as VoiceFinding[] | null) ?? [];
  const reviews = (detailData.findingReviews as Record<string, { verdict: string }> | null) ?? {};
  const notes = (detailData.internalNotes as { at: number; by: string; kind: string; text: string }[] | null) ?? [];

  const setStatus = async (status: VoiceIntakeStatus) => {
    const perm: Array<"SUBMITTED" | "UNDER_REVIEW" | "MORE_INFORMATION_NEEDED" | "ACCEPTED" | "CLOSED"> = [
      "SUBMITTED",
      "UNDER_REVIEW",
      "MORE_INFORMATION_NEEDED",
      "ACCEPTED",
      "CLOSED",
    ];
    if (!perm.includes(status)) return;
    setBusy(true);
    try {
      await setIntakeStatus({ recordingId, status: status as VoiceIntakeStatus });
    } finally {
      setBusy(false);
    }
  };

  const verdictFor = async (
    findingId: string,
    verdict: "accepted" | "rejected" | "needs_further_review",
  ) => {
    await reviewFinding({ recordingId, findingId, verdict });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <Link
            to="/voice-intake"
            className="inline-flex items-center gap-2 text-sm text-jmuted hover:text-jtext"
          >
            <ArrowLeft className="size-4" /> Back to intake
          </Link>            <h1 className="mt-2 font-mono text-xl text-jcyan">{detailData.caseId}</h1>
          <p className="text-xs text-jmuted">
            {detailData.fileName} · {INTAKE_LABEL[detailData.intakeStatus]}
          </p>
        </div>
        {detailData.analysis && detailData.analysis.assessment && (
          <span className="font-mono text-xs uppercase tracking-wider border border-jborder px-3 py-1 text-jamber">
            {ASSESSMENT_LABEL[detailData.analysis.assessment]}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: audio, provenance, transcript */}
        <div className="lg:col-span-2 space-y-6">
          <section className="jaal-panel p-4">
            <h2 className="jaal-label mb-3">Original recording</h2>
            {audio?.url ? (
              <audio controls src={audio.url} className="w-full">
                Audio playback is not supported in this browser.
              </audio>
            ) : (
              <p className="text-sm text-jmuted">Audio URL unavailable.</p>
            )}
            <div className="mt-3 space-y-1 text-[11px] text-jmuted">
              <p className="flex items-center gap-1.5">
                <Fingerprint className="size-3.5 text-jgreen" />
                Integrity verified at processing time.
              </p>
              <p className="font-mono break-all">
                {detailData.hashAlgorithm}: {detailData.fileHash}
              </p>
              <p>
                {detailData.sizeBytes} bytes
                {detailData.durationSeconds ? ` · ${fmtTime(detailData.durationSeconds * 1000)}` : ""}
              </p>
            </div>
          </section>

          {/* Consumer context */}
          <section className="jaal-panel p-4">
            <h2 className="jaal-label mb-3">Consumer-provided context</h2>
            <dl className="space-y-2 text-sm">
              {detailData.callerPhone && (
                <Row label="Caller phone" value={detailData.callerPhone} />
              )}
              {detailData.claimedIdentity && (
                <Row label="Claimed identity" value={detailData.claimedIdentity} />
              )}
              {detailData.approximateCallAt && (
                <Row
                  label="Approx. call time"
                  value={new Date(detailData.approximateCallAt).toLocaleString()}
                />
              )}
              <Row label="Money requested" value={detailData.moneyRequested ? "Yes" : "No / not stated"} />
              <Row
                label="OTP/PIN/password requested"
                value={detailData.credentialsRequested ? "Yes" : "No / not stated"}
              />
              <Row
                label="Money transferred or info shared"
                value={detailData.moneyTransferredOrShared ? "Yes" : "No / not stated"}
              />
              {detailData.whatHappened && (
                <Row label="What happened" value={detailData.whatHappened} />
              )}
            </dl>
          </section>

          {/* Transcript */}
          <section className="jaal-panel p-4">
            <h2 className="jaal-label mb-3 flex items-center gap-2">
              Transcript
              {detailData.transcriptSource === "CONSUMER_PROVIDED" && (
                <span className="font-mono text-[10px] uppercase text-jamber">
                  (consumer-provided)
                </span>
              )}
              {detailData.transcriptSource === "SPEECH_PROVIDER" && (
                <span className="font-mono text-[10px] uppercase text-jgreen">
                  (speech-to-text)
                </span>
              )}
            </h2>
            {detailData.transcript ? (
              detailData.transcriptSegments && detailData.transcriptSegments.length > 0 ? (
                <div className="space-y-1.5 max-h-80 overflow-y-auto text-sm">
                  {detailData.transcriptSegments.map((seg, i) => (
                    <div key={i} className="flex gap-3">
                      {typeof seg.startMs === "number" && (
                        <button
                          type="button"
                          className="shrink-0 font-mono text-xs text-jcyan hover:underline"
                          onClick={() => {
                            const el = document.querySelector<HTMLAudioElement>("audio");
                            if (el && typeof seg.startMs === "number") {
                              el.currentTime = seg.startMs / 1000;
                              void el.play();
                            }
                          }}
                        >
                          {fmtTime(seg.startMs)}
                        </button>
                      )}
                      <p className="text-jtext">
                        {seg.speaker && <span className="font-medium text-jcyan">{seg.speaker}: </span>}
                        {seg.text}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-jtext whitespace-pre-wrap max-h-80 overflow-y-auto">
                  {detailData.transcript}
                </p>
              )
            ) : (
              <p className="text-sm text-jmuted">
                No transcript available ({detailData.transcription.status.toLowerCase()}).
              </p>
            )}
          </section>

          {/* Findings review */}
          <section className="jaal-panel p-4">
            <h2 className="jaal-label mb-3">AI findings</h2>
            {findings.length === 0 ? (
              <p className="text-sm text-jmuted">No findings produced.</p>
            ) : (
              <ul className="space-y-3">
                {findings.map((f) => {
                  const review = reviews[f.id]?.verdict;
                  return (
                    <li key={f.id} className="border border-jborder/60 bg-jsurface/60 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-medium text-jtext">{f.tactic}</p>
                        <span className="font-mono text-[10px] uppercase text-jmuted shrink-0">
                          {f.severity} · {f.confidence}
                        </span>
                      </div>
                      {f.excerpt && (
                        <blockquote className="mt-2 border-l-2 border-jcyan/60 pl-3 text-sm italic text-jmuted">
                          “{f.excerpt}”
                          {typeof f.timestampMs === "number" && (
                            <span className="not-italic font-mono text-xs ml-2">{fmtTime(f.timestampMs)}</span>
                          )}
                        </blockquote>
                      )}
                      <p className="mt-2 text-sm text-jmuted">{f.explanation}</p>
                      <p className="mt-1 text-xs text-jtext">
                        <span className="font-medium">Action: </span>
                        {f.recommendedAction}
                      </p>
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        {isInvestigator ? (
                          <>
                            {([
                              ["accepted", CheckCircle2, "text-jgreen"],
                              ["rejected", XCircle, "text-jred"],
                              ["needs_further_review", HelpCircle, "text-jamber"],
                            ] as const).map(([v, Icon, cls]) => (
                              <button
                                key={v}
                                type="button"
                                onClick={() => void verdictFor(f.id, v)}
                                className={`inline-flex items-center gap-1 border border-jborder px-2 py-1 text-[11px] transition-colors ${
                                  review === v ? `${cls} bg-jsurface` : "text-jmuted hover:text-jtext"
                                }`}
                              >
                                <Icon className="size-3" />
                                {VERDICT_LABEL[v]}
                              </button>
                            ))}
                          </>
                        ) : (
                          <span className="text-[11px] text-jmuted">
                            {review ? VERDICT_LABEL[review] : "Awaiting decision"}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {/* Right: actions + status + notes */}
        <div className="space-y-6">
          <section className="jaal-panel p-4">
            <h2 className="jaal-label mb-3">Review status</h2>
            <div className="flex flex-wrap gap-2">
              {isInvestigator ? (
                ["UNDER_REVIEW", "ACCEPTED", "CLOSED"].map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={busy}
                    onClick={() => void setStatus(s as VoiceIntakeStatus)}
                    className={`border border-jborder px-3 py-1.5 text-xs transition-colors ${
                      detailData.intakeStatus === s
                        ? "bg-jcyan/15 text-jcyan"
                        : "text-jmuted hover:text-jtext"
                    }`}
                  >
                    {INTAKE_LABEL[s]}
                  </button>
                ))
              ) : (
                <p className="text-xs text-jmuted">
                  {INTAKE_LABEL[detailData.intakeStatus] ?? detailData.intakeStatus}
                </p>
              )}
            </div>
            {detailData.reviewedAt && (
              <p className="mt-3 flex items-center gap-1.5 text-[11px] text-jmuted">
                <Clock className="size-3" />
                Last reviewed {new Date(detailData.reviewedAt).toLocaleString()}
              </p>
            )}
          </section>

          <section className="jaal-panel p-4">
            <h2 className="jaal-label mb-3 flex items-center gap-2">
              <MessageSquare className="size-3.5" /> Internal notes
            </h2>
            {isInvestigator ? (
              <textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add an internal investigation note…"
                className="w-full bg-jsurface border border-jborder px-3 py-2 text-sm text-jtext"
              />
            ) : (
              <p className="text-xs text-jmuted">
                Internal notes are available to authorised investigator accounts.
              </p>
            )
            }
            {isInvestigator && (
              <button
                type="button"
                disabled={busy || !note.trim()}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await addInternalNote({ recordingId, text: note.trim() });
                    setNote("");
                  } finally {
                    setBusy(false);
                  }
                }}
                className="mt-2 border border-jborder px-3 py-1.5 text-xs text-jtext hover:bg-jsurface"
              >
                Save note
              </button>
            )}
            <ul className="mt-3 space-y-2">
              {notes.map((n, i) => (
                <li key={i} className="text-[11px] text-jmuted border-l-2 border-jborder pl-2">
                  <span className="font-mono">{new Date(n.at).toLocaleString()}</span>
                  <p className="mt-0.5 text-jtext">{n.text}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="jaal-panel p-4">
            <h2 className="jaal-label mb-3 flex items-center gap-2">
              <Link2 className="size-3.5" /> Link to case
            </h2>
            <p className="text-[11px] text-jmuted">
              Link this accepted intake to an investigation case. The original
              report ID and evidence provenance are preserved.
            </p>
            {isInvestigator ? (
              <Link
                to={`/investigations?linkVoice=${detailData._id}`}
                className="mt-2 inline-flex items-center gap-2 border border-jborder px-3 py-1.5 text-xs text-jtext hover:bg-jsurface"
              >
                Choose a case
                <Link2 className="size-3" />
              </Link>
            ) : (
              <p className="text-xs text-jmuted">
                Linking to a case is available to authorised investigator accounts.
              </p>
            )}
          </section>
        </div>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-jmuted">
        <Shield className="size-3.5 text-jgreen" />
        Investigator decisions are stored separately and never overwrite the
        original recording or the AI output.
      </div>
    </div>
  );
}

function VoiceIntakeDetail({
  recordingId,
  isInvestigator,
}: {
  recordingId: Id<"voice_recordings">;
  isInvestigator: boolean;
}) {
  return isInvestigator
    ? <VoiceIntakeDetailInvestigator recordingId={recordingId} />
    : <VoiceIntakeDetailConsumer recordingId={recordingId} />;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-jmuted">{label}</dt>
      <dd className="text-jtext text-right min-w-0 break-words">{value}</dd>
    </div>
  );
}

function reviewOnly() {
  return true;
}

export default function VoiceIntakePage() {
  const { recordingId } = useParams<{ recordingId?: string }>();
  const isInvestigator = reviewOnly();
  if (recordingId) {
    // Full detail page — investigators see everything, consumers see only their
    // own submission's audio + transcript + AI findings.
    return (
      <VoiceIntakeDetail recordingId={recordingId as Id<"voice_recordings">} isInvestigator={isInvestigator} />
    );
  }
  // Queue page — all authenticated users see the voice intake interface.
  return <VoiceIntakeQueue isInvestigator={isInvestigator} />;
}
