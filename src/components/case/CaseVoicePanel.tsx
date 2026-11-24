import { useEffect, useMemo, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { sha256HexBytes } from "@/utils/hash";
import { getScenario } from "@/data/scenarios";
import {
  AlertTriangle,
  AudioLines,
  Check,
  CircleStop,
  FileAudio,
  Loader2,
  Mic,
  Pause,
  Play,
  ShieldCheck,
  Square,
  Upload,
} from "lucide-react";

type Segment = { speaker?: string; startMs?: number; endMs?: number; text: string };
type Correction = { segmentIndex?: number; original?: string; corrected: string; note?: string; at?: number };
type Finding = {
  id: string;
  tactic: string;
  excerpt: string;
  explanation: string;
  timestampMs?: number;
  confidence?: string;
  severity?: string;
  recommendedAction?: string;
  observed?: boolean;
};
type Indicator = { type: string; value: string; context?: string };

type VoiceRow = {
  _id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  fileHash: string;
  hashAlgorithm: string;
  durationSeconds: number | null;
  transcript: string | null;
  transcriptSegments: Segment[] | null;
  transcriptSource: "SPEECH_PROVIDER" | "CONSUMER_PROVIDED" | null;
  transcriptCorrections: Correction[] | null;
  transcription: { status: string; provider?: string | null; error?: string | null };
  analysis: {
    status: string;
    assessment?: string | null;
    summary?: string | null;
    findings?: Finding[] | null;
    indicators?: Indicator[] | null;
    recommendedSteps?: string[] | null;
    limitations?: string[] | null;
    provider?: string | null;
    error?: string | null;
  };
  findingReviews: Record<string, { verdict: string; note?: string; at?: number }> | null;
  provenance: "USER_PROVIDED" | "SIMULATION";
  createdAt: number;
};

const fmtTime = (ms?: number) => {
  if (typeof ms !== "number") return "—";
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const fmtBytes = (n: number) =>
  n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

const TRANSCRIPTION_LABEL: Record<string, string> = {
  NOT_STARTED: "Awaiting transcription",
  PROCESSING: "Transcribing",
  COMPLETED: "Transcribed",
  FAILED: "Transcription failed",
  UNAVAILABLE: "Transcription unavailable",
  NO_SPEECH: "No speech detected",
};

export function CaseVoicePanel({
  caseId,
  scenarioKey,
  focus,
}: {
  caseId: string;
  scenarioKey?: string;
  focus?: { recordingId: string; atMs?: number } | null;
}) {
  const voice = useQuery(api.caseWorkspace.getCaseVoice, { caseId }) as VoiceRow[] | undefined;
  const recordings = useMemo(() => voice ?? [], [voice]);
  const [captured, setCaptured] = useState<File | null>(null);

  return (
    <div className="space-y-4">
      <RecordingUpload caseId={caseId} captured={captured} onCapturedConsumed={() => setCaptured(null)} />
      <CallCompanionCapture onCaptured={setCaptured} />
      <div className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="jaal-label !text-jcyan">Recordings attached to this case</p>
            <h2 className="mt-1 text-lg font-semibold text-jtext">Voice & calls</h2>
          </div>
          <span className="font-mono text-[9px] uppercase tracking-wider text-jmuted">
            {recordings.length} recording{recordings.length === 1 ? "" : "s"}
          </span>
        </div>
        {voice === undefined ? (
          <div className="jaal-panel flex items-center gap-2 p-4 text-xs text-jmuted">
            <Loader2 className="size-4 animate-spin text-jcyan" /> Loading recordings…
          </div>
        ) : recordings.length === 0 ? (
          <div className="jaal-panel p-8 text-center">
            <FileAudio className="mx-auto size-7 text-jmuted/60" />
            <p className="mt-3 text-sm text-jmuted">No recording has been added to this case.</p>
            <p className="mt-1 text-[11px] text-jmuted/70">
              Add a recording above, or use the simulated call below. Nothing is created until you submit.
            </p>
          </div>
        ) : (
          recordings.map((recording) => (
            <RecordingCard
              key={recording._id}
              recording={recording}
              focus={focus?.recordingId === recording._id ? focus : null}
            />
          ))
        )}
      </div>
      <DecoyCallPanel caseId={caseId} scenarioKey={scenarioKey} />
    </div>
  );
}

function RecordingUpload({
  caseId,
  captured,
  onCapturedConsumed,
}: {
  caseId: string;
  captured: File | null;
  onCapturedConsumed: () => void;
}) {
  const generateUrl = useMutation(api.caseWorkspace.generateCaseUploadUrl);
  const attach = useMutation(api.caseWorkspace.attachCaseRecording);
  const processRecording = useAction(api.voiceActions.processRecording);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const submissionKey = useRef(crypto.randomUUID());
  const [file, setFile] = useState<File | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<"idle" | "hashing" | "uploading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const choose = async (picked: File | undefined) => {
    if (!picked) return;
    await prepare(picked);
  };

  const prepare = async (picked: File) => {
    if (!picked) return;
    setError(null);
    setStatus("hashing");
    setFile(picked);
    submissionKey.current = crypto.randomUUID();
    try {
      setHash(await sha256HexBytes(await picked.arrayBuffer()));
      const url = URL.createObjectURL(picked);
      const audio = document.createElement("audio");
      audio.preload = "metadata";
      audio.onloadedmetadata = () => {
        if (Number.isFinite(audio.duration)) setDuration(audio.duration);
        URL.revokeObjectURL(url);
      };
      audio.onerror = () => URL.revokeObjectURL(url);
      audio.src = url;
      setStatus("idle");
    } catch {
      setStatus("error");
      setError("This file could not be read.");
    }
  };

  useEffect(() => {
    if (!captured) return;
    void prepare(captured);
    onCapturedConsumed();
    // The file is consumed once; parent clears it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captured]);

  const submit = async () => {
    if (busy) return;
    if (!file || !hash) return setError("Choose a recording first.");
    if (!consent) return setError("Confirm that you have the right to analyse this recording.");
    setBusy(true);
    setError(null);
    setStatus("uploading");
    try {
      const uploadUrl = await generateUrl({});
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!response.ok) throw new Error("Upload failed.");
      const { storageId } = (await response.json()) as { storageId: string };
      const attached = await attach({
        caseId,
        storageId,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        fileHash: hash,
        durationSeconds: duration ?? undefined,
        consentAccepted: true,
        consentVersion: "voice-consent-1",
        idempotencyKey: submissionKey.current,
      });
      setStatus("done");
      void processRecording({ recordingId: attached.recordingId as Id<"voice_recordings"> }).catch(
        () => undefined,
      );
      setFile(null);
      setHash(null);
      setConsent(false);
      if (inputRef.current) inputRef.current.value = "";
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Could not add this recording.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="metal-surface rounded-md p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="jaal-label !text-jcyan">User-supplied evidence</p>
          <h2 className="mt-1 text-base font-semibold text-jtext">Add a recording to this case</h2>
          <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-jmuted">
            Choose an audio file you already have. The original is preserved and its SHA-256 is recorded before
            transcription. Analysis may be unavailable if the server has no speech provider.
          </p>
        </div>
        <span className="metal-chip rounded-full px-2.5 py-1 font-mono text-[8px] uppercase tracking-wider">
          User-provided
        </span>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".mp3,.wav,.m4a,.aac,.ogg,.webm,.amr,audio/*"
        className="hidden"
        onChange={(event) => void choose(event.target.files?.[0])}
      />
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="metal-button-ghost inline-flex items-center gap-2 rounded-sm px-3 py-2 text-[11px]"
        >
          <Upload className="size-3.5" /> Choose audio file
        </button>
        {file && (
          <span className="font-mono text-[10px] text-jmuted">
            {file.name} · {fmtBytes(file.size)}
            {duration ? ` · ${fmtTime(duration * 1000)}` : ""}
          </span>
        )}
        {status === "hashing" && <Loader2 className="size-3.5 animate-spin text-jcyan" />}
      </div>

      <label className="mt-3 flex max-w-2xl cursor-pointer items-start gap-2 text-[11px] leading-relaxed text-jmuted">
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
          className="mt-0.5 accent-[#6fd7ff]"
        />
        I confirm I have the right to analyse this recording and understand that transcription/analysis may use a
        configured provider.
      </label>
      {error && (
        <p className="mt-2 flex items-center gap-2 text-[11px] text-jred">
          <AlertTriangle className="size-3.5" /> {error}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || !file || !hash || !consent}
          className="metal-button inline-flex items-center gap-2 rounded-sm px-4 py-2 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <FileAudio className="size-3.5" />}
          Add and process recording
        </button>
        {status === "done" && (
          <span className="flex items-center gap-1.5 text-[11px] text-jgreen">
            <Check className="size-3.5" /> Added. Processing continues in the background.
          </span>
        )}
      </div>
    </section>
  );
}

function CallCompanionCapture({ onCaptured }: { onCaptured: (file: File) => void }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (timerRef.current) window.clearInterval(timerRef.current);
  };

  const start = async () => {
    setError(null);
    setFile(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const captured = new File(
          [blob],
          `microphone-capture-${new Date().toISOString().slice(0, 19)}.webm`,
          { type: blob.type || "audio/webm" },
        );
        setFile(captured);
        onCaptured(captured);
        stopTracks();
        setRecording(false);
      };
      recorder.start();
      setRecording(true);
      setSeconds(0);
      timerRef.current = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    } catch {
      setError("Microphone permission was not granted. You can still analyse a recording you already have.");
    }
  };

  return (
    <section className="jaal-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="jaal-label !text-jcyan">Call Companion</p>
          <h2 className="mt-1 text-base font-semibold text-jtext">Notice warning signs while you speak</h2>
        </div>
        <span className="border border-jamber/40 bg-jamber/10 px-2 py-1 font-mono text-[8px] uppercase tracking-wider text-jamber">
          Microphone only
        </span>
      </div>
      <p className="mt-2 max-w-3xl text-[11px] leading-relaxed text-jmuted">
        This browser can capture audio from a microphone after you press Start. It cannot listen to a phone call
        or cellular line. Recording is explicit and stops when you press Stop; analysis happens after recording,
        not live.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!recording ? (
          <button
            type="button"
            onClick={() => void start()}
            className="metal-button inline-flex items-center gap-2 rounded-sm px-4 py-2 text-[11px] font-semibold"
          >
            <Mic className="size-3.5" /> Use my microphone
          </button>
        ) : (
          <button
            type="button"
            onClick={() => recorderRef.current?.stop()}
            className="inline-flex items-center gap-2 rounded-sm border border-jred/50 bg-jred/10 px-4 py-2 text-[11px] text-jred"
          >
            <Square className="size-3.5" /> Stop and review
          </button>
        )}
        {recording && (
          <span className="flex items-center gap-2 font-mono text-[11px] text-jred">
            <span className="size-1.5 animate-pulse rounded-full bg-jred" /> {fmtTime(seconds * 1000)} · capturing
          </span>
        )}
        {file && (
          <>
            <span className="font-mono text-[10px] text-jmuted">
              {file.name} · {fmtBytes(file.size)}
            </span>
            <button
              type="button"
              onClick={() => {
                setFile(null);
                setSeconds(0);
              }}
              className="text-[10px] text-jmuted hover:text-jtext"
            >
              Discard
            </button>
          </>
        )}
      </div>
      {file && (
        <p className="mt-2 text-[11px] text-jgreen">
          Capture ready and placed in the upload form above. Nothing is saved until you confirm and press Add.
        </p>
      )}
      {error && (
        <p className="mt-2 flex items-center gap-2 text-[11px] text-jred">
          <AlertTriangle className="size-3.5" /> {error}
        </p>
      )}
      <div className="mt-3 grid gap-2 text-[10px] text-jmuted sm:grid-cols-3">
        <span className="border border-jborder/40 bg-jsurface/40 px-2 py-1.5">Use my microphone · post-recording analysis</span>
        <span className="border border-jborder/40 bg-jsurface/40 px-2 py-1.5">Analyze a recording · upload above</span>
        <span className="border border-jborder/40 bg-jsurface/40 px-2 py-1.5">Try a simulated call · below</span>
      </div>
      <p className="mt-2 font-mono text-[8px] uppercase tracking-wider text-jmuted/60">
        No live captions are claimed. No phone line is intercepted.
      </p>
    </section>
  );
}

function segmentForMs(segments: Segment[], ms?: number) {
  if (typeof ms !== "number") return null;
  const index = segments.findIndex(
    (segment) =>
      typeof segment.startMs === "number" &&
      typeof segment.endMs === "number" &&
      ms >= segment.startMs &&
      ms <= segment.endMs,
  );
  return index >= 0 ? { index, segment: segments[index]! } : null;
}

function companionSuggestion(finding: Finding): string {
  if (finding.recommendedAction?.trim()) return finding.recommendedAction.trim();
  const text = `${finding.tactic} ${finding.explanation}`.toLowerCase();
  if (/code|otp|password|pin/.test(text)) return "Do not share the code. Contact the organisation using a number you find yourself.";
  if (/payment|money|fee|transfer|deposit/.test(text)) return "Pause before paying. Verify the organisation independently first.";
  if (/link|url|website|portal/.test(text)) return "Do not open that link. Use the official app or website you find yourself.";
  if (/authority|police|bank|government|company/.test(text)) return "Verify the claimed organisation using an independent contact route.";
  if (/threat|fear|urgent|deadline|pressure/.test(text)) return "Pause. A deadline is being used to pressure you into acting.";
  return "Review the quoted moment before deciding what to do next.";
}

function RecordingCard({
  recording,
  focus,
}: {
  recording: VoiceRow;
  focus?: { recordingId: string; atMs?: number } | null;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audio = useQuery(api.caseWorkspace.getCaseAudioUrl, {
    recordingId: recording._id as Id<"voice_recordings">,
  });
  const review = useMutation(api.caseWorkspace.reviewCaseFinding);
  const correct = useMutation(api.caseWorkspace.correctCaseTranscript);
  const [correction, setCorrection] = useState<{ index?: number; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const seek = (ms?: number) => {
    if (typeof ms !== "number" || !audioRef.current) return;
    audioRef.current.currentTime = ms / 1000;
    void audioRef.current.play();
  };

  useEffect(() => {
    if (!focus || !audio?.url || !audioRef.current) return;
    audioRef.current.currentTime = (focus.atMs ?? 0) / 1000;
    void audioRef.current.play();
    audioRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focus, audio?.url]);
  const findings = recording.analysis.findings ?? [];
  const segments = recording.transcriptSegments ?? [];
  const reviews = recording.findingReviews ?? {};
  const corrections = recording.transcriptCorrections ?? [];
  const accepted = findings.filter((finding) => reviews[finding.id]?.verdict === "accepted");

  const setVerdict = async (findingId: string, verdict: "accepted" | "rejected" | "needs_further_review") => {
    setError(null);
    try {
      await review({ recordingId: recording._id as Id<"voice_recordings">, findingId, verdict });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save review.");
    }
  };

  const saveCorrection = async () => {
    if (!correction?.text.trim()) return;
    setSaving(true);
    try {
      await correct({
        recordingId: recording._id as Id<"voice_recordings">,
        segmentIndex: correction.index,
        correctedText: correction.text,
      });
      setCorrection(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save correction.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="jaal-panel overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-jborder/60 p-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <AudioLines className="size-4 text-jcyan" />
            <h3 className="truncate text-sm font-semibold text-jtext">{recording.fileName}</h3>
            <span
              className={cn(
                "border px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider",
                recording.provenance === "SIMULATION"
                  ? "border-jamber/50 bg-jamber/10 text-jamber"
                  : "border-jcyan/40 bg-jcyan/10 text-jcyan",
              )}
            >
              {recording.provenance === "SIMULATION" ? "Simulation" : "User-provided"}
            </span>
          </div>
          <p className="mt-1 font-mono text-[10px] text-jmuted">
            {recording.hashAlgorithm} · {recording.fileHash.slice(0, 16)}… · {fmtBytes(recording.sizeBytes)}
            {recording.durationSeconds ? ` · ${fmtTime(recording.durationSeconds * 1000)}` : ""}
          </p>
        </div>
        <span className="font-mono text-[9px] uppercase tracking-wider text-jmuted">
          {TRANSCRIPTION_LABEL[recording.transcription.status] ?? recording.transcription.status}
        </span>
      </div>

      <div className="p-4">
        {audio?.url ? (
          <audio ref={audioRef} controls src={audio.url} className="w-full">
            Audio playback is not supported in this browser.
          </audio>
        ) : (
          <p className="border border-jborder/50 bg-jsurface/40 px-3 py-2 text-[11px] text-jmuted">
            Audio playback is unavailable.
          </p>
        )}

        {recording.transcription.status === "UNAVAILABLE" || recording.transcription.status === "FAILED" ? (
          <div className="mt-3 border border-jborder/60 bg-jsurface/50 px-3 py-2 text-[11px] leading-relaxed text-jmuted">
            {recording.transcription.error === "empty-transcript"
              ? "The speech provider returned no usable words. No transcript or findings were invented."
              : "Transcription is unavailable on this deployment. The original recording is preserved. No transcript or findings were invented."}
          </div>
        ) : recording.transcription.status === "NO_SPEECH" ? (
          <div className="mt-3 border border-jborder/60 bg-jsurface/50 px-3 py-2 text-[11px] text-jmuted">
            No speech was detected. No transcript or findings were generated.
          </div>
        ) : recording.transcription.status !== "COMPLETED" ? (
          <div className="mt-3 flex items-center gap-2 text-[11px] text-jmuted">
            <Loader2 className="size-3.5 animate-spin text-jcyan" />
            {recording.transcription.status === "PROCESSING"
              ? "Transcribing the recording. Results will appear here."
              : "Queued for transcription. Nothing is displayed until the provider returns."}
          </div>
        ) : (
          <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <div className="flex items-center justify-between gap-2">
                <h4 className="jaal-label">Timestamped transcript</h4>
                <span className="font-mono text-[8px] uppercase tracking-wider text-jmuted">
                  {recording.transcriptSource === "SPEECH_PROVIDER" ? "speech-to-text" : "user-provided"}
                </span>
              </div>
              <div className="mt-2 max-h-72 space-y-1.5 overflow-y-auto pr-1">
                {segments.length > 0 ? (
                  segments.map((segment, index) => {
                    const segmentCorrection = corrections.find((item) => item.segmentIndex === index);
                    return (
                      <div key={`${segment.startMs}-${index}`} className="border border-transparent transition-colors hover:border-jcyan/30 hover:bg-jcyan/5">
                        <button
                          type="button"
                          onClick={() => seek(segment.startMs)}
                          className="flex w-full gap-2 px-2 pb-1 pt-1.5 text-left text-[11px] leading-relaxed"
                        >
                          <span className="shrink-0 font-mono text-[10px] text-jcyan">{fmtTime(segment.startMs)}</span>
                          <span className="text-jtext">
                            {segment.speaker && <strong className="text-jcyan">{segment.speaker}: </strong>}
                            {segment.text}
                          </span>
                        </button>
                        <div className="flex items-center gap-2 px-2 pb-1.5 pl-12">
                          <span className="font-mono text-[8px] uppercase tracking-wider text-jmuted/60">
                            segment {index + 1} · {fmtTime(segment.startMs)}–{fmtTime(segment.endMs)}
                          </span>
                          <button
                            type="button"
                            onClick={() => setCorrection({ index, text: segment.text })}
                            className="font-mono text-[8px] uppercase tracking-wider text-jcyan/80 hover:text-jcyan"
                          >
                            correct
                          </button>
                        </div>
                        {segmentCorrection && (
                          <p className="mx-2 mb-1.5 border-l border-jamber/40 pl-2 text-[10px] text-jmuted">
                            Investigator correction: <span className="text-jtext">{segmentCorrection.corrected}</span>{" "}
                            <span className="text-jmuted/60">(machine original retained)</span>
                          </p>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-jtext">{recording.transcript}</p>
                )}
              </div>
              <p className="mt-2 text-[10px] text-jmuted">Click a timestamp to seek the audio.</p>
              {corrections.length > 0 && (
                <div className="mt-3 border-t border-jborder/50 pt-2">
                  <p className="jaal-label">Corrections retained separately</p>
                  {corrections.map((item, index) => (
                    <p key={index} className="mt-1 text-[10px] text-jmuted">
                      {item.segmentIndex != null ? `Segment ${item.segmentIndex + 1}` : "Whole transcript"}:{" "}
                      <span className="text-jtext">{item.corrected}</span>
                    </p>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between gap-2">
                <h4 className="jaal-label">Proposed findings</h4>
                <span className="font-mono text-[8px] uppercase tracking-wider text-jamber">
                  {findings.length} proposed · {accepted.length} accepted
                </span>
              </div>
              <div className="mt-2 max-h-72 space-y-2 overflow-y-auto pr-1">
                {findings.length === 0 ? (
                  <p className="text-[11px] text-jmuted">
                    {recording.analysis.status === "COMPLETED"
                      ? "No warning-sign finding was returned."
                      : "No findings yet. Nothing is inferred before analysis completes."}
                  </p>
                ) : (
                  findings.map((finding) => {
                    const verdict = reviews[finding.id]?.verdict;
                    const source = segmentForMs(segments, finding.timestampMs);
                    return (
                      <div
                        key={finding.id}
                        className={cn(
                          "border p-2.5",
                          verdict === "accepted"
                            ? "border-jgreen/40 bg-jgreen/5"
                            : verdict === "rejected"
                              ? "border-jborder/50 bg-jsurface/40 opacity-70"
                              : "border-jamber/35 bg-jamber/5",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            seek(finding.timestampMs);
                          }}
                          className="w-full text-left"
                        >
                          <p className="text-[11px] font-medium text-jtext">{finding.tactic}</p>
                          <p className="mt-1 text-[10px] leading-relaxed text-jmuted">{finding.explanation}</p>
                          {finding.excerpt && (
                            <p className="mt-1 border-l border-jamber/40 pl-2 text-[10px] italic text-jtext">
                              “{finding.excerpt}”
                            </p>
                          )}
                          {typeof finding.timestampMs === "number" && (
                            <p className="mt-1 font-mono text-[9px] text-jcyan">
                              {fmtTime(finding.timestampMs)} ·{" "}
                              {source
                                ? `segment ${source.index + 1} · ${fmtTime(source.segment.startMs)}–${fmtTime(source.segment.endMs)}`
                                : "timestamp only"}{" "}
                              · open in audio
                            </p>
                          )}
                        </button>
                        <div className="mt-2 flex flex-wrap gap-1">
                          <ReviewButton active={verdict === "accepted"} onClick={() => void setVerdict(finding.id, "accepted")} label="Accept" />
                          <ReviewButton active={verdict === "rejected"} onClick={() => void setVerdict(finding.id, "rejected")} label="Dismiss" />
                          <ReviewButton active={verdict === "needs_further_review"} onClick={() => void setVerdict(finding.id, "needs_further_review")} label="Needs review" />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              {findings.filter((finding) => reviews[finding.id]?.verdict !== "rejected").length > 0 && (
                <div className="mt-3 border border-jcyan/25 bg-jcyan/[0.04] p-2.5">
                  <p className="jaal-label !text-jcyan">Call Companion · post-recording suggestions</p>
                  <p className="mt-1 text-[9px] leading-relaxed text-jmuted">
                    Generated only from the processed transcript. Analysis happens after recording; these are not live captions.
                  </p>
                  <div className="mt-2 space-y-1.5">
                    {findings
                      .filter((finding) => reviews[finding.id]?.verdict !== "rejected")
                      .slice(0, 4)
                      .map((finding) => {
                        const source = segmentForMs(segments, finding.timestampMs);
                        return (
                          <button
                            key={`suggestion-${finding.id}`}
                            type="button"
                            onClick={() => seek(finding.timestampMs)}
                            className="block w-full border-l-2 border-jcyan/50 pl-2 text-left hover:border-jcyan"
                          >
                            <span className="block text-[10px] leading-relaxed text-jtext">{companionSuggestion(finding)}</span>
                            <span className="mt-0.5 block font-mono text-[8px] uppercase tracking-wider text-jmuted">
                              triggered by “{finding.excerpt || finding.tactic}” · {fmtTime(finding.timestampMs)}
                              {source ? ` · segment ${source.index + 1}` : ""}
                            </span>
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}
              {recording.analysis.indicators && recording.analysis.indicators.length > 0 && (
                <div className="mt-3">
                  <p className="jaal-label">Possible indicators</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {recording.analysis.indicators.map((indicator, index) => (
                      <span key={index} className="border border-jborder/60 bg-jsurface px-1.5 py-0.5 font-mono text-[9px] text-jtext">
                        {indicator.type}: {indicator.value}
                      </span>
                    ))}
                  </div>
                  <p className="mt-1 text-[9px] text-jmuted">Extracted text, not verified intelligence.</p>
                </div>
              )}
              {accepted.length > 0 && (
                <p className="mt-2 text-[10px] text-jmuted">
                  Accepted findings are available to the case report. Source segments remain clickable.
                </p>
              )}
              <button
                type="button"
                onClick={() => setCorrection({ index: undefined, text: recording.transcript ?? "" })}
                className="mt-3 text-[10px] text-jcyan hover:underline"
              >
                Correct or annotate the transcript
              </button>
            </div>
          </div>
        )}

        {correction && (
          <div className="mt-3 border border-jcyan/30 bg-jcyan/5 p-3">
            <p className="jaal-label">Human correction · original retained</p>
            <textarea
              value={correction.text}
              onChange={(event) => setCorrection({ ...correction, text: event.target.value })}
              rows={3}
              className="mt-2 w-full border border-jborder/70 bg-jsurface p-2 text-[11px] text-jtext outline-none focus:border-jcyan/60"
            />
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => void saveCorrection()} disabled={saving} className="metal-button rounded-sm px-3 py-1.5 text-[10px] font-semibold disabled:opacity-50">
                {saving ? "Saving…" : "Save correction"}
              </button>
              <button type="button" onClick={() => setCorrection(null)} className="border border-jborder/70 px-3 py-1.5 text-[10px] text-jmuted">
                Cancel
              </button>
            </div>
          </div>
        )}
        {error && (
          <p className="mt-2 flex items-center gap-2 text-[11px] text-jred">
            <AlertTriangle className="size-3.5" /> {error}
          </p>
        )}
      </div>
    </section>
  );
}

function ReviewButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "border px-2 py-1 font-mono text-[8px] uppercase tracking-wider transition-colors",
        active ? "border-jcyan/60 bg-jcyan/15 text-jcyan" : "border-jborder/60 text-jmuted hover:text-jtext",
      )}
    >
      {label}
    </button>
  );
}

type DecoyTurn = {
  id: string;
  speaker: "jaal" | "scammer";
  text: string;
  at: number;
  stage?: string;
  reason?: string;
  claim?: string;
  tactics?: string[];
  indicators?: string[];
};

function DecoyCallPanel({ caseId, scenarioKey }: { caseId: string; scenarioKey?: string }) {
  const calls = useQuery(api.caseWorkspace.getCaseCalls, { caseId }) as
    | Array<{
        _id: Id<"call_sessions">;
        status: "running" | "paused" | "ended";
        scenarioKey?: string;
        engine: string;
        maxTurns: number;
        currentTurn: number;
        turns: DecoyTurn[];
        syncedAt?: number;
        createdAt: number;
        endedAt?: number;
      }>
    | undefined;
  const create = useMutation(api.caseWorkspace.createDecoyCall);
  const advance = useMutation(api.caseWorkspace.advanceDecoyCall);
  const setStatus = useMutation(api.caseWorkspace.setDecoyCallStatus);
  const sync = useMutation(api.jaal.syncDecoyCallToCase);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [synced, setSynced] = useState(false);
  const [maxTurns, setMaxTurns] = useState(5);
  const session = calls?.[0] ?? null;
  const scenario = getScenario(session?.scenarioKey ?? scenarioKey);
  const scammerTurns = (session?.turns ?? []).filter((turn) => turn.speaker === "scammer");
  const tactics = [...new Set(scammerTurns.flatMap((turn) => turn.tactics ?? []))];
  const indicators = [...new Set(scammerTurns.flatMap((turn) => turn.indicators ?? []))];
  const claims = [...new Set(scammerTurns.map((turn) => turn.claim).filter((claim): claim is string => Boolean(claim)))];
  const elapsedMs = session && session.turns.length > 0
    ? Math.max(session.turns[session.turns.length - 1]!.at - session.createdAt, 0)
    : 0;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The simulation could not continue.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="jaal-panel overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-jborder/60 p-4">
        <div>
          <p className="jaal-label !text-jamber">AI Decoy Call Simulation</p>
          <h2 className="mt-1 text-base font-semibold text-jtext">JAAL talks to a synthetic scammer</h2>
          <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-jmuted">
            This is a simulation. No number is dialled, no telephony provider is used, and no real person is
            contacted. JAAL asks factual follow-ups; the scammer is a deterministic synthetic script.
          </p>
        </div>
        <span className="border border-jamber/50 bg-jamber/10 px-2 py-1 font-mono text-[8px] uppercase tracking-wider text-jamber">
          Simulated call
        </span>
      </div>

      <div className="p-4">
        {!session ? (
          <div className="space-y-3">
            <div className="grid gap-2 text-[11px] leading-relaxed text-jmuted md:grid-cols-[1fr_auto] md:items-end">
              <div className="border border-jborder/60 bg-jsurface/40 p-3">
                <p className="font-mono text-[8px] uppercase tracking-wider text-jamber">Scenario chosen</p>
                <p className="mt-1 text-[12px] font-medium text-jtext">
                  {scenario?.title ?? "Digital arrest simulation"}
                </p>
                <p className="mt-1 text-[10px]">
                  <span className="text-jcyan">Objective:</span>{" "}
                  {scenario?.decoyObjective ?? "Establish the claimed identity, payment destination and deadline."}
                </p>
              </div>
              <label className="border border-jborder/60 bg-jsurface/40 p-3 text-[9px] font-mono uppercase tracking-wider text-jmuted">
                Maximum turns
                <select
                  value={maxTurns}
                  onChange={(event) => setMaxTurns(Number(event.target.value))}
                  className="mt-1 block w-full border border-jborder/70 bg-jsurface px-2 py-1 text-[10px] text-jtext outline-none"
                >
                  {[3, 4, 5, 6, 8].map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void run(() => create({ caseId, maxTurns }))}
                disabled={busy}
                className="metal-button inline-flex items-center gap-2 rounded-sm px-4 py-2 text-[11px] font-semibold disabled:opacity-50"
              >
                <Play className="size-3.5" /> Start simulated call
              </button>
              <p className="text-[10px] text-jmuted">
                You control every turn. Pausing stops progression; ending generates no extra turns.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="border border-jamber/40 bg-jamber/10 px-2 py-1 font-mono text-[8px] uppercase tracking-wider text-jamber">
                {session.status}
              </span>
              <span className="font-mono text-[9px] uppercase tracking-wider text-jmuted">
                {session.engine} · turn {session.currentTurn}/{session.maxTurns} · elapsed {fmtTime(elapsedMs)} · {session.scenarioKey ?? "scenario"}
              </span>
              {session.status === "running" && (
                <>
                  <button type="button" onClick={() => void run(() => advance({ sessionId: session._id }))} disabled={busy} className="metal-button rounded-sm px-3 py-1.5 text-[10px] font-semibold disabled:opacity-50">
                    <AudioLines className="mr-1 inline size-3" /> Next turn
                  </button>
                  <button type="button" onClick={() => void run(() => setStatus({ sessionId: session._id, status: "paused" }))} disabled={busy} className="border border-jamber/40 px-3 py-1.5 text-[10px] text-jamber disabled:opacity-50">
                    <Pause className="mr-1 inline size-3" /> Pause
                  </button>
                </>
              )}
              {session.status === "paused" && (
                <button type="button" onClick={() => void run(() => setStatus({ sessionId: session._id, status: "running" }))} disabled={busy} className="border border-jcyan/40 px-3 py-1.5 text-[10px] text-jcyan disabled:opacity-50">
                  <Play className="mr-1 inline size-3" /> Resume
                </button>
              )}
              {session.status !== "ended" && (
                <button type="button" onClick={() => void run(() => setStatus({ sessionId: session._id, status: "ended" }))} disabled={busy} className="border border-jred/40 px-3 py-1.5 text-[10px] text-jred disabled:opacity-50">
                  <CircleStop className="mr-1 inline size-3" /> End call
                </button>
              )}
            </div>

            <div className="max-h-80 space-y-2 overflow-y-auto border border-jborder/50 bg-[#04101f]/60 p-3">
              {session.turns.length === 0 ? (
                <p className="text-[11px] text-jmuted">No turns yet. Press “Next turn” to begin.</p>
              ) : (
                session.turns.map((turn) => (
                  <div
                    key={turn.id}
                    className={cn(
                      "max-w-[92%] border px-2.5 py-2",
                      turn.speaker === "jaal" ? "ml-auto border-jcyan/30 bg-jcyan/[0.06]" : "border-jamber/25 bg-jamber/5",
                    )}
                  >
                    <p className="font-mono text-[8px] uppercase tracking-wider text-jmuted">
                      {turn.speaker === "jaal" ? "JAAL decoy" : "Synthetic scammer"}
                      {turn.stage ? ` · ${turn.stage}` : ""} · {fmtTime(Math.max(0, turn.at - session.createdAt))}
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-jtext">{turn.text}</p>
                    {turn.reason && <p className="mt-1 text-[9px] text-jmuted">Why JAAL asked: {turn.reason}</p>}
                    {turn.claim && <p className="mt-1 font-mono text-[8px] uppercase tracking-wider text-jamber">Claim: {turn.claim}</p>}
                    {turn.tactics && turn.tactics.length > 0 && (
                      <p className="mt-1 text-[9px] text-jmuted">Automated tactic label: {turn.tactics.join(", ")}</p>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              <div className="border border-jamber/30 bg-jamber/[0.04] p-2.5">
                <p className="jaal-label !text-jamber">Tactics detected so far</p>
                {tactics.length === 0 ? (
                  <p className="mt-1 text-[10px] text-jmuted">No call turn has been processed yet.</p>
                ) : (
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[10px] text-jtext">
                    {tactics.map((tactic) => <li key={tactic}>{tactic}</li>)}
                  </ul>
                )}
              </div>
              <div className="border border-jcyan/25 bg-jcyan/[0.04] p-2.5">
                <p className="jaal-label !text-jcyan">Extracted indicators · pending review</p>
                {indicators.length === 0 ? (
                  <p className="mt-1 text-[10px] text-jmuted">No links, payment handles or code requests extracted yet.</p>
                ) : (
                  <ul className="mt-1 space-y-0.5 text-[10px] text-jtext">
                    {indicators.map((indicator) => <li key={indicator} className="font-mono">{indicator}</li>)}
                  </ul>
                )}
              </div>
            </div>

            {session.status === "ended" && (
              <div className="border border-jborder/60 bg-jsurface/40 p-3">
                <p className="jaal-label !text-jcyan">Post-call simulation review</p>
                <p className="mt-1 text-[11px] leading-relaxed text-jmuted">
                  {scammerTurns.length} synthetic scammer turn{scammerTurns.length === 1 ? "" : "s"} processed over{" "}
                  {fmtTime(elapsedMs)} of simulated time. No real call occurred.
                </p>
                <div className="mt-2 grid gap-3 md:grid-cols-2">
                  <div>
                    <p className="font-mono text-[8px] uppercase tracking-wider text-jmuted">Claimed identities / claims</p>
                    {claims.length === 0 ? (
                      <p className="mt-1 text-[10px] text-jmuted">No specific identity claim was recorded.</p>
                    ) : (
                      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[10px] text-jtext">
                        {claims.map((claim) => <li key={claim}>{claim}</li>)}
                      </ul>
                    )}
                  </div>
                  <div>
                    <p className="font-mono text-[8px] uppercase tracking-wider text-jmuted">Unanswered / unverified questions</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[10px] text-jtext">
                      {!indicators.some((item) => /^URL:/i.test(item)) && <li>No independently checkable website was established.</li>}
                      {!indicators.some((item) => /email|upi|payment/i.test(item)) && <li>No payment destination was established.</li>}
                      <li>The claimed organisation was not independently verified during the simulation.</li>
                    </ul>
                  </div>
                </div>
                <p className="mt-2 text-[10px] text-jmuted">
                  Review the source-linked turns above, then add them to the case to continue review in the timeline and evidence board.
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy || Boolean(session.syncedAt) || synced || session.turns.length === 0}
                onClick={() =>
                  void run(async () => {
                    await sync({ caseId, sessionId: session._id });
                    setSynced(true);
                  })
                }
                className="border border-jgreen/40 bg-jgreen/5 px-3 py-1.5 text-[10px] text-jgreen disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ShieldCheck className="mr-1 inline size-3" />
                {session.syncedAt || synced ? "Turns added to case" : "Add call turns to case"}
              </button>
              <p className="text-[10px] text-jmuted">
                Added turns keep SIMULATION provenance in the conversation, timeline and report.
              </p>
            </div>
          </div>
        )}
        {error && (
          <p className="mt-2 flex items-center gap-2 text-[11px] text-jred">
            <AlertTriangle className="size-3.5" /> {error}
          </p>
        )}
      </div>
    </section>
  );
}
