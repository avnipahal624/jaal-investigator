import { useEffect, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { Link, useSearchParams } from "react-router";
import {
  ArrowLeft,
  ArrowRight,
  Shield,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  PlayCircle,
  FileText,
  Lock,
  HelpCircle,
  Clock,
  Radio,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type {
  VoiceAssessment,
  VoiceFinding,
  VoiceRecordingView,
} from "@/types/consumer";

const ASSESSMENT_LABEL: Record<VoiceAssessment, string> = {
  HIGH_CONCERN: "High Concern",
  WARNING_SIGNS_FOUND: "Warning Signs Found",
  NO_OBVIOUS_WARNING_SIGNS: "No Obvious Warning Signs",
  UNABLE_TO_ASSESS: "Unable to Assess",
};

const ASSESSMENT_STYLE: Record<VoiceAssessment, string> = {
  HIGH_CONCERN: "bg-red-50 text-red-700 border-red-200",
  WARNING_SIGNS_FOUND: "bg-amber-50 text-amber-700 border-amber-200",
  NO_OBVIOUS_WARNING_SIGNS: "bg-emerald-50 text-emerald-700 border-emerald-200",
  UNABLE_TO_ASSESS: "bg-slate-50 text-slate-600 border-slate-200",
};

const SEVERITY_STYLE: Record<string, string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-slate-100 text-slate-600",
};

const TRANSCRIPTION_STATUS: Record<string, string> = {
  NOT_STARTED: "Not started",
  PROCESSING: "Transcribing…",
  COMPLETED: "Transcript ready",
  FAILED: "Transcription failed",
  UNAVAILABLE: "Transcription unavailable",
};

function fmtTime(ms?: number): string {
  if (typeof ms !== "number") return "";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export default function ConsumerVoiceResultPage() {
  const [searchParams] = useSearchParams();
  const recordingId = searchParams.get("r") as Id<"voice_recordings"> | null;
  const reportId = searchParams.get("rep");

  const recording = useQuery(
    api.voice.getVoiceRecording,
    recordingId ? { recordingId } : "skip",
  ) as VoiceRecordingView | undefined;

  const processRecording = useAction(api.voiceActions.processRecording);
  const submitConsumerTranscript = useMutation(api.voice.submitConsumerTranscript);
  const getAudioUrl = useQuery(
    api.voice.getAudioUrl,
    recordingId ? { recordingId } : "skip",
  );

  const [processing, setProcessing] = useState(false);
  const [processError, setProcessError] = useState<string | null>(null);
  const [showTranscriptInput, setShowTranscriptInput] = useState(false);
  const [draftTranscript, setDraftTranscript] = useState("");
  const [savingTranscript, setSavingTranscript] = useState(false);
  const autoStarted = useRef(false);

  const status = recording?.analysis.status;
  const isProcessingNow =
    processing || status === "PROCESSING" || recording?.transcription.status === "PROCESSING";

  const startProcessing = async () => {
    if (!recordingId) return;
    setProcessing(true);
    setProcessError(null);
    try {
      await processRecording({ recordingId });
    } catch (err) {
      setProcessError(
        err instanceof Error ? err.message : "Processing failed. Please retry.",
      );
    } finally {
      setProcessing(false);
    }
  };

  // Kick off processing once when the recording is first loaded and nothing
  // has been analysed yet.
  useEffect(() => {
    if (!recording || autoStarted.current) return;
    if (
      recording.analysis.status === "NOT_STARTED" &&
      recording.transcription.status !== "PROCESSING"
    ) {
      autoStarted.current = true;
      void startProcessing();
    } else if (
      recording.analysis.status === "COMPLETED" ||
      recording.analysis.status === "FAILED" ||
      recording.analysis.status === "UNAVAILABLE"
    ) {
      autoStarted.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  const saveTranscript = async () => {
    if (!recordingId || !draftTranscript.trim()) return;
    setSavingTranscript(true);
    setProcessError(null);
    try {
      await submitConsumerTranscript({ recordingId, transcript: draftTranscript.trim() });
      setShowTranscriptInput(false);
      await startProcessing();
    } catch (err) {
      setProcessError(
        err instanceof Error ? err.message : "Could not save your notes.",
      );
    } finally {
      setSavingTranscript(false);
    }
  };

  if (!recordingId) {
    return <InvalidState message="No recording was specified." />;
  }
  if (recording === undefined) {
    return <LoadingState />;
  }
  if (recording === null) {
    return <InvalidState message="We couldn't find this recording. It may have been deleted, or it doesn't belong to your account." />;
  }

  const analysis = recording.analysis;
  const findings = (analysis.findings as VoiceFinding[] | null) ?? [];
  const canAddNotes =
    analysis.status === "UNAVAILABLE" ||
    analysis.status === "FAILED" ||
    recording.transcriptSource !== "SPEECH_PROVIDER";

  return (
    <div className="max-w-3xl mx-auto">
      <header className="mb-6">
        <Link
          to={`/consumer/reports/${reportId ?? recording.investigationId}`}
          className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-consumer-muted)] hover:text-[var(--color-consumer-text)] transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to report
        </Link>
        <h1 className="text-2xl font-semibold text-[var(--color-consumer-deep)] flex items-center gap-2">
          <Shield className="w-6 h-6 text-[var(--color-consumer-teal)]" />
          Voice Scam Analysis
        </h1>
        <p className="mt-1 text-[var(--color-consumer-muted)] text-sm">
          Report reference <span className="font-mono font-semibold">{recording.caseId}</span>
        </p>
      </header>

      {/* Overall assessment */}
      <section className="glass-strong p-6 shadow-md rounded-2xl mb-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-lg font-semibold text-[var(--color-consumer-deep)]">
            Overall assessment
          </h2>
          {analysis.assessment ? (
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border ${ASSESSMENT_STYLE[analysis.assessment]}`}
            >
              {ASSESSMENT_LABEL[analysis.assessment]}
            </span>
          ) : isProcessingNow ? (
            <span className="chip">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Analysing…
            </span>
          ) : (
            <span className="chip">Not available</span>
          )}
        </div>

        {analysis.summary && (
          <p className="mt-3 text-sm text-[var(--color-consumer-text)] leading-relaxed">
            {analysis.summary}
          </p>
        )}

        {isProcessingNow && !analysis.summary && (
          <p className="mt-3 text-sm text-[var(--color-consumer-muted)] leading-relaxed flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-[var(--color-consumer-primary)]" />
            Reviewing what was said on the call…
          </p>
        )}

        {/* Honest unavailable / failed states */}
        {(analysis.status === "UNAVAILABLE" || analysis.status === "FAILED") && (
          <div className="mt-4 rounded-xl border border-[var(--color-consumer-border)] bg-[var(--color-consumer-glass)] p-4">
            <p className="text-sm text-[var(--color-consumer-text)] leading-relaxed">
              {analysis.error === "no-transcript" || analysis.error === "no-provider"
                ? "No automatic speech-to-text is configured on this deployment, and no written notes were provided — so the audio could not be analysed. You can add what was said below and analyse that instead."
                : analysis.status === "FAILED"
                ? "The analysis could not be completed this time. Nothing was invented. You can retry, or add what was said to analyse that instead."
                : "Analysis is not available right now. Your recording is still saved and an authorised investigator can review it."}
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={startProcessing}
                disabled={processing}
                className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-consumer-primary)] hover:underline disabled:opacity-60"
              >
                <RefreshCw className={`w-4 h-4 ${processing ? "animate-spin" : ""}`} />
                Retry analysis
              </button>
              {canAddNotes && (
                <button
                  type="button"
                  onClick={() => setShowTranscriptInput((v) => !v)}
                  className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-consumer-teal)] hover:underline"
                >
                  <FileText className="w-4 h-4" />
                  Add what was said
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Transcript source honesty banner */}
      {recording.transcriptSource === "CONSUMER_PROVIDED" && (
        <div className="mb-5 rounded-xl border border-[var(--color-consumer-border)] bg-[var(--color-consumer-mint)] p-4 text-sm text-[var(--color-consumer-text)] flex gap-2">
          <HelpCircle className="w-4 h-4 mt-0.5 shrink-0 text-[var(--color-consumer-teal)]" />
          <span>
            The analysis below used notes <strong>you wrote</strong> about what was
            said — not an automatic transcription of the audio.
          </span>
        </div>
      )}

      {/* Add-your-own transcript input */}
      {showTranscriptInput && (
        <section className="glass-strong p-5 shadow-md rounded-2xl mb-5">
          <h3 className="text-sm font-semibold text-[var(--color-consumer-deep)]">
            What was said on the call
          </h3>
          <textarea
            rows={5}
            value={draftTranscript}
            onChange={(e) => setDraftTranscript(e.target.value)}
            placeholder="Write what you remember being said. JAAL will analyse this text. Never include your own OTP, PIN, password or card number."
            className="mt-2 w-full rounded-xl border border-[var(--color-consumer-border)] bg-white px-4 py-3 text-sm resize-y"
          />
          <div className="mt-3 flex gap-3">
            <button
              type="button"
              onClick={saveTranscript}
              disabled={savingTranscript || !draftTranscript.trim()}
              className="btn-primary inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm disabled:opacity-60"
            >
              {savingTranscript ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              Save & analyse
            </button>
            <button
              type="button"
              onClick={() => setShowTranscriptInput(false)}
              className="text-sm font-medium text-[var(--color-consumer-muted)] hover:text-[var(--color-consumer-text)]"
            >
              Cancel
            </button>
          </div>
        </section>
      )}

      {processError && (
        <div className="mb-5 text-sm text-red-700 bg-red-50 rounded-xl p-3 border border-red-200">
          {processError}
        </div>
      )}

      {/* Audio player */}
      {getAudioUrl?.url && (
        <section className="glass-strong p-5 shadow-md rounded-2xl mb-5">
          <h2 className="text-lg font-semibold text-[var(--color-consumer-deep)] flex items-center gap-2 mb-3">
            <PlayCircle className="w-5 h-5 text-[var(--color-consumer-primary)]" />
            Your recording
          </h2>
          <audio controls src={getAudioUrl.url} className="w-full">
            Your browser does not support audio playback.
          </audio>
          <p className="mt-2 text-xs text-[var(--color-consumer-muted)] flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" />
            Stored privately and hashed (SHA-256). The original file is never changed.
          </p>
          <p className="mt-1 text-[11px] text-[var(--color-consumer-muted)] font-mono break-all">
            {recording.hashAlgorithm}: {recording.fileHash}
          </p>
        </section>
      )}

      {/* Warning signs */}
      {analysis.status === "COMPLETED" && findings.length > 0 && (
        <section className="glass-strong p-6 shadow-md rounded-2xl mb-5">
          <h2 className="text-lg font-semibold text-[var(--color-consumer-deep)] flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            Detected warning signs
          </h2>
          <ul className="space-y-4">
            {findings.map((f) => (
              <li
                key={f.id}
                className="rounded-xl border border-[var(--color-consumer-border)] bg-[var(--color-consumer-glass)] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold text-[var(--color-consumer-deep)] text-sm">
                    {f.tactic}
                  </p>
                  <span
                    className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${SEVERITY_STYLE[f.severity] ?? "bg-slate-100 text-slate-600"}`}
                  >
                    {f.severity} concern
                  </span>
                </div>
                {f.excerpt && (
                  <blockquote className="mt-2 border-l-2 border-[var(--color-consumer-primary)] pl-3 text-sm text-[var(--color-consumer-text)] italic">
                    “{f.excerpt}”
                    {typeof f.timestampMs === "number" && (
                      <span className="not-italic text-xs text-[var(--color-consumer-muted)] ml-2">
                        at {fmtTime(f.timestampMs)}
                      </span>
                    )}
                  </blockquote>
                )}
                <p className="mt-2 text-sm text-[var(--color-consumer-muted)] leading-relaxed">
                  {f.explanation}
                </p>
                <p className="mt-2 text-xs text-[var(--color-consumer-deep)]">
                  <span className="font-medium">What to do: </span>
                  {f.recommendedAction}
                </p>
                <p className="mt-1 text-[11px] text-[var(--color-consumer-muted)]">
                  {f.observed ? "Based on what was said in the call." : "JAAL's interpretation, not a direct quote."}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Transcript */}
      {recording.transcript && (
        <section className="glass-strong p-6 shadow-md rounded-2xl mb-5">
          <h2 className="text-lg font-semibold text-[var(--color-consumer-deep)] flex items-center gap-2 mb-3">
            <FileText className="w-5 h-5 text-[var(--color-consumer-teal)]" />
            Transcript
          </h2>
          {recording.transcriptSegments && recording.transcriptSegments.length > 0 ? (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {recording.transcriptSegments.map((seg, i) => (
                <div key={i} className="flex gap-3 text-sm">
                  {typeof seg.startMs === "number" && (
                    <span className="shrink-0 font-mono text-xs text-[var(--color-consumer-muted)]">
                      {fmtTime(seg.startMs)}
                    </span>
                  )}
                  <p className="text-[var(--color-consumer-text)]">
                    {seg.speaker && <span className="font-medium">{seg.speaker}: </span>}
                    {seg.text}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--color-consumer-text)] whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto">
              {recording.transcript}
            </p>
          )}
        </section>
      )}

      {/* Next steps */}
      {analysis.status === "COMPLETED" && (analysis.recommendedSteps?.length ?? 0) > 0 && (
        <section className="glass-strong p-6 shadow-md rounded-2xl mb-5">
          <h2 className="text-lg font-semibold text-[var(--color-consumer-deep)] flex items-center gap-2 mb-3">
            <CheckCircle2 className="w-5 h-5 text-[var(--color-consumer-teal)]" />
            Recommended next steps
          </h2>
          <ol className="space-y-2 text-sm text-[var(--color-consumer-text)]">
            {analysis.recommendedSteps!.map((s, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-0.5 shrink-0 text-[var(--color-consumer-teal)] font-medium">
                  {i + 1}.
                </span>
                <span className="leading-relaxed">{s}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Limitations + honesty note */}
      <section className="mb-5 rounded-xl border border-[var(--color-consumer-border)] bg-[var(--color-consumer-glass)] p-4">
        <h3 className="text-sm font-semibold text-[var(--color-consumer-deep)] flex items-center gap-2 mb-2">
          <Radio className="w-4 h-4 text-[var(--color-consumer-muted)]" />
          About this analysis
        </h3>
        <ul className="space-y-1 text-xs text-[var(--color-consumer-muted)] leading-relaxed">
          {(analysis.limitations ?? []).map((l, i) => (
            <li key={i}>• {l}</li>
          ))}
          {(analysis.limitations ?? []).length === 0 && (
            <li>
              • This is a helpfulness check based on what was said. It is not an
              official fraud determination, not legal advice, and not a police report.
            </li>
          )}
        </ul>
      </section>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <Link
          to={`/consumer/reports/${reportId ?? recording.investigationId}`}
          className="btn-primary inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm shadow-md"
        >
          View my report
          <ArrowRight className="w-4 h-4" />
        </Link>
        <Link
          to="/consumer/protected"
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium border border-[var(--color-consumer-border)] bg-white hover:bg-[var(--color-consumer-glass)] transition-colors"
        >
          <HelpCircle className="w-4 h-4" />
          Safety recommendations
        </Link>
        <Link
          to="/consumer/dashboard"
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-[var(--color-consumer-muted)] hover:text-[var(--color-consumer-text)]"
        >
          Back to dashboard
        </Link>
      </div>

      <p className="mt-4 flex items-center gap-2 text-xs text-[var(--color-consumer-muted)]">
        <Clock className="w-3.5 h-3.5" />
        Submitted {new Date(recording.createdAt).toLocaleString()}
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="max-w-3xl mx-auto glass p-6 space-y-4" aria-busy="true">
      <div className="h-6 w-48 bg-[var(--color-consumer-border)] rounded animate-pulse" />
      <div className="h-24 bg-[var(--color-consumer-border)] rounded-xl animate-pulse" />
      <div className="h-32 bg-[var(--color-consumer-border)] rounded-xl animate-pulse" />
      <span className="sr-only">Loading your analysis…</span>
    </div>
  );
}

function InvalidState({ message }: { message: string }) {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="glass p-6 text-center">
        <AlertTriangle className="w-6 h-6 text-[var(--color-consumer-muted)] mx-auto" />
        <p className="mt-2 text-sm text-[var(--color-consumer-muted)]">{message}</p>
        <Link
          to="/consumer/dashboard"
          className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-[var(--color-consumer-primary)] hover:underline"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
