import { useCallback, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { Link, useNavigate } from "react-router";
import {
  Mic,
  Shield,
  Upload,
  Trash2,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Loader2,
  AlertTriangle,
  Phone,
  FileAudio,
  HelpCircle,
  Lock,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { sha256HexBytes } from "@/utils/hash";

// ---------------------------------------------------------------------------
// Upload limits (mirrored server-side in src/convex/voice.ts).
// ---------------------------------------------------------------------------

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const ALLOWED_AUDIO_MIME = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/aac",
  "audio/ogg",
  "audio/webm",
  "audio/amr",
];
const ACCEPT_ATTR = ".mp3,.wav,.m4a,.aac,.ogg,.webm,.amr,audio/*";

type Stage =
  | "choose"
  | "upload"
  | "processing"
  | "results"
  | "live";

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function fmtTime(ms?: number): string {
  if (typeof ms !== "number") return "";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export default function ConsumerVoiceCallPage() {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>("choose");

  return (
    <div className="max-w-3xl mx-auto">
      <header className="mb-8">
        <Link
          to="/consumer/report"
          className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-consumer-muted)] hover:text-[var(--color-consumer-text)] transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Report a Scam
        </Link>
        <h1 className="text-2xl font-semibold text-[var(--color-consumer-deep)] flex items-center gap-2">
          <Mic className="w-6 h-6 text-[var(--color-consumer-primary)]" />
          Voice Call Scam
        </h1>
        <p className="mt-1 text-[var(--color-consumer-muted)] text-base">
          Understand a suspicious call — from a recording you already have, or
          with safety guidance while you're on a call.
        </p>
      </header>

      {stage === "choose" && (
        <ChooseOption
          onAnalyse={() => setStage("upload")}
          onLive={() => setStage("live")}
        />
      )}
      {stage === "upload" && (
        <UploadFlow
          onBack={() => setStage("choose")}
          onDone={(recordingId, reportId) => {
            // Hand off to the results screen, which drives + watches processing.
            navigate(`/consumer/voice/result?r=${recordingId}&rep=${reportId}`);
          }}
        />
      )}
      {stage === "live" && <LiveProtection onBack={() => setStage("choose")} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Option chooser — clearly explains the difference between the two paths.
// ---------------------------------------------------------------------------

function ChooseOption({
  onAnalyse,
  onLive,
}: {
  onAnalyse: () => void;
  onLive: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <button
          type="button"
          onClick={onAnalyse}
          className="glass-strong p-6 text-left shadow-md hover:shadow-lg transition-shadow rounded-2xl border border-[var(--color-consumer-border)]"
        >
          <span className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[var(--color-consumer-primary-soft)] text-[var(--color-consumer-primary)] mb-4">
            <FileAudio className="w-6 h-6" strokeWidth={1.85} />
          </span>
          <h2 className="text-lg font-semibold text-[var(--color-consumer-deep)]">
            Analyse an Existing Recording
          </h2>
          <p className="mt-2 text-sm text-[var(--color-consumer-muted)] leading-relaxed">
            Already recorded the call on your phone? Upload the audio file. JAAL
            keeps the original safe, checks its integrity, and reviews what was
            said for common scam tactics.
          </p>
          <span className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-[var(--color-consumer-primary)]">
            Upload a recording
            <ArrowRight className="w-4 h-4" />
          </span>
        </button>

        <button
          type="button"
          onClick={onLive}
          className="glass-strong p-6 text-left shadow-md hover:shadow-lg transition-shadow rounded-2xl border border-[var(--color-consumer-border)]"
        >
          <span className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[var(--color-consumer-mint)] text-[var(--color-consumer-teal)] mb-4">
            <Shield className="w-6 h-6" strokeWidth={1.85} />
          </span>
          <h2 className="text-lg font-semibold text-[var(--color-consumer-deep)]">
            Protect Me During a Call
          </h2>
          <p className="mt-2 text-sm text-[var(--color-consumer-muted)] leading-relaxed">
            Get safety guidance and a way to report during or right after a
            call. Live protection depends on your device — a web page cannot
            listen to your phone line, so read what it can and can't do first.
          </p>
          <span className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-[var(--color-consumer-teal)]">
            See live protection options
            <ArrowRight className="w-4 h-4" />
          </span>
        </button>
      </div>

      <p className="text-xs text-[var(--color-consumer-muted)] leading-relaxed">
        JAAL's review looks for warning signs in what was said. It is not proof
        of a crime and does not verify anyone's identity. Always independently
        verify any request for money or details, and never share your OTP, PIN
        or password with anyone.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upload flow — validation, progress, remove/replace, consent, optional fields.
// ---------------------------------------------------------------------------

function UploadFlow({
  onBack,
  onDone,
}: {
  onBack: () => void;
  onDone: (recordingId: string, reportId: string) => void;
}) {
  const generateUploadUrl = useMutation(api.voice.generateUploadUrl);
  const createVoiceReport = useMutation(api.voice.createVoiceReport);

  const [file, setFile] = useState<File | null>(null);
  const [fileHash, setFileHash] = useState<string | null>(null);
  const [hashing, setHashing] = useState(false);
  const [duration, setDuration] = useState<number | null>(null);

  const [status, setStatus] = useState<"idle" | "hashing" | "uploading" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Optional context fields — none are forced.
  const [callerPhone, setCallerPhone] = useState("");
  const [claimedIdentity, setClaimedIdentity] = useState("");
  const [callDate, setCallDate] = useState("");
  const [whatHappened, setWhatHappened] = useState("");
  const [moneyRequested, setMoneyRequested] = useState(false);
  const [credentialsRequested, setCredentialsRequested] = useState(false);
  const [transferredOrShared, setTransferredOrShared] = useState(false);
  const [selfTranscript, setSelfTranscript] = useState("");

  const [consentAccepted, setConsentAccepted] = useState(false);
  const [attention, setAttention] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const flashAttention = (msg: string) => {
    setAttention(msg);
    setTimeout(() => setAttention(null), 5000);
  };

  const resetFile = useCallback(() => {
    setFile(null);
    setFileHash(null);
    setDuration(null);
    setStatus("idle");
    setError(null);
    setProgress(0);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const handleFile = useCallback(
    async (picked: File | null) => {
      if (!picked) return;
      setError(null);
      setSubmitError(null);

      const mimeOk =
        (picked.type && ALLOWED_AUDIO_MIME.includes(picked.type.toLowerCase())) ||
        /\.(mp3|wav|m4a|aac|ogg|webm|amr)$/i.test(picked.name);
      if (!mimeOk) {
        setStatus("error");
        setError(
          "Unsupported format. Please choose an MP3, WAV, M4A, AAC, OGG, WebM or AMR audio file.",
        );
        return;
      }
      if (picked.size > MAX_AUDIO_BYTES) {
        setStatus("error");
        setError(
          `This file is ${fmtBytes(picked.size)}. The maximum size is ${fmtBytes(MAX_AUDIO_BYTES)}.`,
        );
        return;
      }
      if (picked.size === 0) {
        setStatus("error");
        setError("This file appears to be empty.");
        return;
      }

      setFile(picked);
      setStatus("hashing");
      setHashing(true);
      setProgress(15);
      try {
        // Read the file ONCE: hash the exact bytes we will upload, so the
        // recorded hash always covers the original file.
        const buf = await picked.arrayBuffer();
        const hash = await sha256HexBytes(buf);
        setFileHash(hash);
        setProgress(55);

        // Read duration from the audio element (best effort; not required).
        const url = URL.createObjectURL(picked);
        const audio = document.createElement("audio");
        audio.preload = "metadata";
        audio.onloadedmetadata = () => {
          if (Number.isFinite(audio.duration)) setDuration(audio.duration);
          URL.revokeObjectURL(url);
        };
        audio.onerror = () => URL.revokeObjectURL(url);
        audio.src = url;

        setHashing(false);
        setStatus("ready");
        setProgress(100);
      } catch {
        setHashing(false);
        setStatus("error");
        setError(
          "Could not read this file. Please try a different recording.",
        );
      }
    },
    [],
  );

  const validate = (): string | null => {
    if (!file) return "Please choose a call recording to upload.";
    if (!fileHash) return "The file is still being prepared.";
    if (!consentAccepted)
      return "Please confirm the consent and privacy notice to continue.";
    return null;
  };

  const handleSubmit = async () => {
    const problem = validate();
    if (problem) {
      flashAttention(problem);
      return;
    }
    if (!file || !fileHash) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      // 1. Get a signed upload URL and send the ORIGINAL bytes to storage.
      const url = await generateUploadUrl();
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!res.ok) throw new Error("Upload failed. Please try again.");
      const { storageId } = (await res.json()) as { storageId: string };

      // 2. Create the report + recording (hash + consent + context).
      const approxCallAt = callDate ? new Date(callDate).getTime() : undefined;
      const result = await createVoiceReport({
        storageId,
        fileName: file.name,
        mimeType: file.type || "audio/mpeg",
        sizeBytes: file.size,
        fileHash,
        durationSeconds: duration ?? undefined,
        consentAccepted,
        consentVersion: "voice-consent-1",
        callerPhone: callerPhone.trim() || undefined,
        claimedIdentity: claimedIdentity.trim() || undefined,
        approximateCallAt: Number.isFinite(approxCallAt) ? approxCallAt : undefined,
        whatHappened: whatHappened.trim() || undefined,
        moneyRequested,
        credentialsRequested,
        moneyTransferredOrShared: transferredOrShared,
        consumerTranscript: selfTranscript.trim() || undefined,
      });

      onDone(result.recordingId, result.reportId);
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : "Could not submit your recording. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Upload card */}
      <section className="glass-strong p-6 shadow-md rounded-2xl">
        <h2 className="text-lg font-semibold text-[var(--color-consumer-deep)] flex items-center gap-2">
          <Upload className="w-5 h-5 text-[var(--color-consumer-primary)]" />
          Upload the call recording
        </h2>
        <p className="mt-1 text-sm text-[var(--color-consumer-muted)]">
          Your original file is stored exactly as you uploaded it and is never
          changed.
        </p>

        {/* Consent + privacy notice — shown BEFORE upload, required. */}
        <div className="mt-4 rounded-xl border border-[var(--color-consumer-border)] bg-[var(--color-consumer-glass)] p-4">
          <div className="flex items-start gap-3">
            <Lock className="w-5 h-5 text-[var(--color-consumer-teal)] shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-[var(--color-consumer-text)]">
                Privacy & consent
              </p>
              <ul className="mt-2 space-y-1 text-xs text-[var(--color-consumer-muted)] leading-relaxed">
                <li>
                  • Only upload a recording you are allowed to have. If you
                  weren't part of the call, make sure you have a lawful basis.
                </li>
                <li>
                  • The recording is stored privately, tied to your account,
                  and reviewed by authorised JAAL investigators. It is never
                  public.
                </li>
                <li>
                  • JAAL analyses what was said to flag scam tactics. This is
                  not proof of a crime and does not verify anyone's identity.
                </li>
                <li>
                  • Your recording is not used to train AI models.
                </li>
                <li>
                  • You can delete your recording and its audio at any time from
                  the report.
                </li>
              </ul>
              <label className="mt-3 flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-[var(--color-consumer-border)]"
                  checked={consentAccepted}
                  onChange={(e) => setConsentAccepted(e.target.checked)}
                />
                <span className="text-xs text-[var(--color-consumer-muted)] leading-relaxed pt-0.5">
                  I have the right to share this recording and agree to JAAL
                  storing and analysing it as described above.
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* File picker */}
        <div className="mt-4">
          <input
            ref={inputRef}
            id="voice-file"
            type="file"
            accept={ACCEPT_ATTR}
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />

          {!file && status !== "error" && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="w-full rounded-xl border-2 border-dashed border-[var(--color-consumer-border)] bg-[var(--color-consumer-glass)] py-8 flex flex-col items-center gap-2 text-[var(--color-consumer-muted)] hover:border-[var(--color-consumer-primary)] hover:text-[var(--color-consumer-primary)] transition-colors"
            >
              <Mic className="w-8 h-8" strokeWidth={1.6} />
              <span className="text-sm font-medium">
                Choose an audio file (MP3, WAV, M4A, AAC)
              </span>
              <span className="text-xs">Up to {fmtBytes(MAX_AUDIO_BYTES)}</span>
            </button>
          )}

          {status === "error" && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm text-red-700 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                {error}
              </p>
              <button
                type="button"
                onClick={() => {
                  resetFile();
                  inputRef.current?.click();
                }}
                className="mt-3 text-sm font-medium text-[var(--color-consumer-primary)] hover:underline"
              >
                Choose a different file
              </button>
            </div>
          )}

          {file && status !== "error" && (
            <div className="rounded-xl border border-[var(--color-consumer-border)] bg-[var(--color-consumer-mint)] p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <FileAudio className="w-5 h-5 text-[var(--color-consumer-teal)] shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--color-consumer-deep)] truncate">
                      {file.name}
                    </p>
                    <p className="text-xs text-[var(--color-consumer-muted)]">
                      {fmtBytes(file.size)}
                      {duration ? ` · ${fmtTime(duration * 1000)}` : ""}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={resetFile}
                  className="text-[var(--color-consumer-muted)] hover:text-[var(--color-consumer-teal)] shrink-0"
                  aria-label={`Remove ${file.name}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {(hashing || status === "hashing") && (
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs text-[var(--color-consumer-muted)] mb-1">
                    <span>Preparing file & computing integrity hash…</span>
                  </div>
                  <div className="h-2 rounded-full bg-[var(--color-consumer-border)] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[var(--color-consumer-primary)] transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              {status === "ready" && fileHash && (
                <div className="mt-3 space-y-1">
                  <p className="text-xs text-[var(--color-consumer-deep)] flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-[var(--color-consumer-teal)]" />
                    Ready to submit
                  </p>
                  <p className="text-[11px] text-[var(--color-consumer-muted)] font-mono break-all">
                    SHA-256: {fileHash}
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="mt-3 text-sm font-medium text-[var(--color-consumer-primary)] hover:underline"
              >
                Replace with a different recording
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Optional context */}
      <section className="glass-strong p-6 shadow-md rounded-2xl">
        <h2 className="text-lg font-semibold text-[var(--color-consumer-deep)]">
          Anything you can share about the call
        </h2>
        <p className="mt-1 text-sm text-[var(--color-consumer-muted)]">
          All of this is optional — only share what you have. It helps the
          review.
        </p>

        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="callerPhone" className="block text-sm font-medium text-[var(--color-consumer-text)] mb-1">
                Caller phone number <span className="text-[var(--color-consumer-muted)] font-normal">(optional)</span>
              </label>
              <input
                id="callerPhone"
                type="tel"
                value={callerPhone}
                onChange={(e) => setCallerPhone(e.target.value)}
                placeholder="The number that called you"
                className="w-full rounded-xl border border-[var(--color-consumer-border)] bg-white px-4 py-3 text-sm"
              />
            </div>
            <div>
              <label htmlFor="claimedIdentity" className="block text-sm font-medium text-[var(--color-consumer-text)] mb-1">
                Who they claimed to be <span className="text-[var(--color-consumer-muted)] font-normal">(optional)</span>
              </label>
              <input
                id="claimedIdentity"
                type="text"
                value={claimedIdentity}
                onChange={(e) => setClaimedIdentity(e.target.value)}
                placeholder="e.g. 'bank fraud team', 'police'"
                className="w-full rounded-xl border border-[var(--color-consumer-border)] bg-white px-4 py-3 text-sm"
              />
            </div>
          </div>

          <div>
            <label htmlFor="callDate" className="block text-sm font-medium text-[var(--color-consumer-text)] mb-1">
              Approximate date & time of the call <span className="text-[var(--color-consumer-muted)] font-normal">(optional)</span>
            </label>
            <input
              id="callDate"
              type="datetime-local"
              value={callDate}
              onChange={(e) => setCallDate(e.target.value)}
              className="w-full rounded-xl border border-[var(--color-consumer-border)] bg-white px-4 py-3 text-sm"
            />
          </div>

          <div>
            <label htmlFor="whatHappened" className="block text-sm font-medium text-[var(--color-consumer-text)] mb-1">
              What happened <span className="text-[var(--color-consumer-muted)] font-normal">(optional)</span>
            </label>
            <textarea
              id="whatHappened"
              rows={3}
              value={whatHappened}
              onChange={(e) => setWhatHappened(e.target.value)}
              placeholder="In your own words, what did they say and ask you to do?"
              className="w-full rounded-xl border border-[var(--color-consumer-border)] bg-white px-4 py-3 text-sm resize-y"
            />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-[var(--color-consumer-text)]">
              Did any of these happen? <span className="text-[var(--color-consumer-muted)] font-normal">(optional)</span>
            </p>
            {[
              { label: "They asked for money or a payment", checked: moneyRequested, set: setMoneyRequested },
              { label: "They asked for an OTP, PIN, password or banking details", checked: credentialsRequested, set: setCredentialsRequested },
              { label: "I transferred money or shared information", checked: transferredOrShared, set: setTransferredOrShared },
            ].map((item) => (
              <label key={item.label} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-[var(--color-consumer-border)]"
                  checked={item.checked}
                  onChange={(e) => item.set(e.target.checked)}
                />
                <span className="text-sm text-[var(--color-consumer-text)]">{item.label}</span>
              </label>
            ))}
          </div>

          <div>
            <label htmlFor="selfTranscript" className="block text-sm font-medium text-[var(--color-consumer-text)] mb-1">
              What was said (your own notes) <span className="text-[var(--color-consumer-muted)] font-normal">(optional)</span>
            </label>
            <textarea
              id="selfTranscript"
              rows={4}
              value={selfTranscript}
              onChange={(e) => setSelfTranscript(e.target.value)}
              placeholder="If you already know roughly what was said, you can write it here. JAAL will analyse this text — it will be clearly marked as your own notes, not an automatic transcription of the audio."
              className="w-full rounded-xl border border-[var(--color-consumer-border)] bg-white px-4 py-3 text-sm resize-y"
            />
            <p className="mt-1 text-xs text-[var(--color-consumer-muted)]">
              Never include your own OTP, PIN, password or full card number —
              even in your notes.
            </p>
          </div>
        </div>
      </section>

      {attention && (
        <div className="text-sm text-[var(--color-consumer-teal)] bg-[var(--color-consumer-mint)] rounded-xl p-3 border border-[var(--color-consumer-border)]">
          {attention}
        </div>
      )}
      {submitError && (
        <div className="text-sm text-red-700 bg-red-50 rounded-xl p-3 border border-red-200">
          {submitError}
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-consumer-muted)] hover:text-[var(--color-consumer-text)] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || hashing || status !== "ready"}
          className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm shadow-md hover:shadow-lg transition-shadow disabled:opacity-60"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Submitting…
            </>
          ) : (
            <>
              Submit recording
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Live protection — honest, platform-aware. No fake capture or analysis.
// ---------------------------------------------------------------------------

function LiveProtection({ onBack }: { onBack: () => void }) {
  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-consumer-muted)] hover:text-[var(--color-consumer-text)] transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to options
      </button>

      <div className="glass-strong p-6 shadow-md rounded-2xl">
        <h2 className="text-lg font-semibold text-[var(--color-consumer-deep)] flex items-center gap-2">
          <Shield className="w-5 h-5 text-[var(--color-consumer-teal)]" />
          Live Call Protection — what it can and can't do
        </h2>
        <p className="mt-2 text-sm text-[var(--color-consumer-text)] leading-relaxed">
          JAAL runs in your web browser. A website <strong>cannot listen to the
          calls on your phone's cellular line</strong> — the phone operating
          system does not allow that, on Android or iPhone. So this page does
          not record your call or show a live transcript. That would not be
          possible, and pretending otherwise would be dishonest.
        </p>
        <p className="mt-2 text-sm text-[var(--color-consumer-text)] leading-relaxed">
          Here is what real, supported protection looks like — and how to get it
          on your device.
        </p>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-xl border border-[var(--color-consumer-border)] bg-[var(--color-consumer-glass)] p-4">
            <h3 className="text-sm font-semibold text-[var(--color-consumer-deep)] flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[var(--color-consumer-teal)]" />
              What JAAL can do now
            </h3>
            <ul className="mt-2 space-y-2 text-xs text-[var(--color-consumer-muted)] leading-relaxed">
              <li>• Analyse a call recording you already have (see the other option).</li>
              <li>• Give you clear warning signs to listen for during a call.</li>
              <li>• Help you report a suspicious call straight afterwards.</li>
              <li>• Remind you to never share OTP, PIN, password or card details.</li>
            </ul>
          </div>
          <div className="rounded-xl border border-[var(--color-consumer-border)] bg-[var(--color-consumer-glass)] p-4">
            <h3 className="text-sm font-semibold text-[var(--color-consumer-deep)] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              What needs a phone app
            </h3>
            <ul className="mt-2 space-y-2 text-xs text-[var(--color-consumer-muted)] leading-relaxed">
              <li>• Seeing a caller-risk warning when your phone rings.</li>
              <li>• Automatic call screening (only where your phone supports it).</li>
              <li>• Recording a call from within your phone's own dialer.</li>
            </ul>
          </div>
        </div>

        {/* Android + iOS honest guidance, grounded in platform reality. */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <PlatformCard
            title="On Android"
            points={[
              "Use your phone dialer's built-in call recording (availability varies by device and region). Announce that the call is being recorded.",
              "Enable your dialer's Caller-ID & spam protection for risk warnings when a call arrives.",
              "A third-party app cannot access both sides of a normal cellular call, and using Accessibility Services to do so violates Google Play policy.",
            ]}
          />
          <PlatformCard
            title="On iPhone"
            points={[
              "iOS has no supported way for an app to record a live cellular call. The Phone app's own recording (iOS 18+) notifies both parties and saves to Notes.",
              "Use Settings → Phone → Call Blocking & Identification to enable caller-ID/spam extensions.",
              "Record with your phone's own tools if allowed, then import the file here for analysis.",
            ]}
          />
        </div>

        <p className="mt-5 text-xs text-[var(--color-consumer-muted)] leading-relaxed border-t border-[var(--color-consumer-border)] pt-4">
          During any suspicious call: stay calm, don't act on pressure, hang up
          and call back on an official number you trust. Never share your OTP,
          PIN or password, and never install an app or screen-share at a
          caller's request. If you already lost money, contact your bank right
          away and report it through your national cybercrime channel.
        </p>

        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            to="/consumer/report"
            className="btn-primary inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm shadow-md"
          >
            <Phone className="w-4 h-4" />
            Report a suspicious call
          </Link>
          <Link
            to="/consumer/protected"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border border-[var(--color-consumer-border)] bg-white hover:bg-[var(--color-consumer-glass)] transition-colors"
          >
            <HelpCircle className="w-4 h-4" />
            Safety tips
          </Link>
        </div>
      </div>
    </div>
  );
}

function PlatformCard({ title, points }: { title: string; points: string[] }) {
  return (
    <div className="rounded-xl border border-[var(--color-consumer-border)] bg-[var(--color-consumer-glass)] p-4">
      <h3 className="text-sm font-semibold text-[var(--color-consumer-deep)]">{title}</h3>
      <ul className="mt-2 space-y-2 text-xs text-[var(--color-consumer-muted)] leading-relaxed">
        {points.map((p, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-0.5 shrink-0 text-[var(--color-consumer-teal)]">•</span>
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
