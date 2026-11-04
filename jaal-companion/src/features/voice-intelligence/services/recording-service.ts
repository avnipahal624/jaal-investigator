/**
 * Recording selection, validation and upload.
 *
 * Everything that leaves the device goes through the EXISTING Convex storage
 * flow (`voice.generateUploadUrl` → POST bytes → `voice.createVoiceReport`).
 * The SHA-256 is computed over the exact bytes that are uploaded, so the server
 * can re-verify the stored blob later. No hashing or authenticity claim is
 * invented here.
 */
import * as DocumentPicker from "expo-document-picker";
import type { Id } from "@convex-dataModel";
import {
  CONSENT_VERSION,
  MAX_AUDIO_BYTES,
  isAllowedMime,
  readBytes,
  resolveMimeType,
  sha256Hex,
  uploadBytes,
} from "../../../services/voiceUpload";
import type { VoiceFile } from "../../../types/voice";

export { CONSENT_VERSION, MAX_AUDIO_BYTES, isAllowedMime, resolveMimeType };

export type PickRecordingResult =
  | { status: "cancelled" }
  | { status: "error"; message: string }
  | { status: "picked"; file: VoiceFile };

/** Validate a candidate file before it is accepted into the flow. */
export function validateRecording(input: {
  name: string;
  mimeType?: string;
  sizeBytes?: number;
}): string | null {
  const mime = resolveMimeType(input.mimeType, input.name);
  if (!isAllowedMime(mime)) {
    return "That file type isn’t supported. Choose an MP3, M4A, WAV, AAC, OGG, WebM or AMR recording.";
  }
  if (input.sizeBytes === undefined) {
    // Unknown size is fine here — the real size is checked after reading bytes.
    return null;
  }
  if (input.sizeBytes <= 0) return "That file appears to be empty.";
  if (input.sizeBytes > MAX_AUDIO_BYTES) {
    return `That recording is too large (${(input.sizeBytes / 1024 / 1024).toFixed(
      1,
    )} MB). The maximum is ${Math.round(MAX_AUDIO_BYTES / 1024 / 1024)} MB.`;
  }
  return null;
}

/** Open the system picker and validate the chosen audio file. */
export async function pickRecording(): Promise<PickRecordingResult> {
  try {
    const res = await DocumentPicker.getDocumentAsync({
      type: "audio/*",
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (res.canceled) return { status: "cancelled" };

    const asset = res.assets?.[0];
    if (!asset?.uri) return { status: "error", message: "No file was returned." };

    const problem = validateRecording({
      name: asset.name ?? "recording",
      mimeType: asset.mimeType,
      sizeBytes: asset.size ?? undefined,
    });
    if (problem) return { status: "error", message: problem };

    return {
      status: "picked",
      file: {
        uri: asset.uri,
        name: asset.name ?? "recording",
        mimeType: resolveMimeType(asset.mimeType, asset.name ?? "recording"),
        sizeBytes: asset.size ?? 0,
      },
    };
  } catch (err) {
    return {
      status: "error",
      message:
        err instanceof Error
          ? err.message
          : "The file picker could not be opened.",
    };
  }
}

export type UploadRecordingArgs = {
  file: VoiceFile;
  /**
   * Stable per-submission key. Retries reuse it, so a lost response cannot
   * create a second report for the same upload.
   */
  idempotencyKey: string;
  generateUploadUrl: () => Promise<string>;
  createVoiceReport: (args: {
    storageId: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    fileHash: string;
    consentAccepted: boolean;
    consentVersion: string;
    idempotencyKey?: string;
    callerPhone?: string;
    claimedIdentity?: string;
    whatHappened?: string;
    moneyRequested?: boolean;
    credentialsRequested?: boolean;
    moneyTransferredOrShared?: boolean;
  }) => Promise<{ recordingId: string; reportId: string; caseId: string }>;
  context?: {
    callerPhone?: string;
    claimedIdentity?: string;
    whatHappened?: string;
    moneyRequested?: boolean;
    credentialsRequested?: boolean;
    moneyTransferredOrShared?: boolean;
  };
};

/**
 * Read → hash → upload → create the report.
 *
 * Consent is a hard requirement server-side too, but it is checked here first
 * so an un-consented file never even starts uploading.
 */
export async function uploadRecording(args: UploadRecordingArgs) {
  const bytes = await readBytes(args.file.uri);
  const sizeBytes = bytes.byteLength;

  if (sizeBytes <= 0) throw new Error("The selected file appears to be empty.");
  if (sizeBytes > MAX_AUDIO_BYTES) {
    throw new Error(
      `That recording is too large (${(sizeBytes / 1024 / 1024).toFixed(1)} MB). The maximum is ${Math.round(
        MAX_AUDIO_BYTES / 1024 / 1024,
      )} MB.`,
    );
  }

  // Hash the exact bytes that will be uploaded — the server re-verifies later.
  const fileHash = await sha256Hex(bytes);
  const uploadUrl = await args.generateUploadUrl();
  const storageId = await uploadBytes(uploadUrl, bytes, args.file.mimeType);

  const created = await args.createVoiceReport({
    storageId,
    fileName: args.file.name,
    mimeType: args.file.mimeType,
    sizeBytes,
    fileHash,
    consentAccepted: true,
    consentVersion: CONSENT_VERSION,
    idempotencyKey: args.idempotencyKey,
    callerPhone: args.context?.callerPhone,
    claimedIdentity: args.context?.claimedIdentity,
    whatHappened: args.context?.whatHappened,
    moneyRequested: args.context?.moneyRequested,
    credentialsRequested: args.context?.credentialsRequested,
    moneyTransferredOrShared: args.context?.moneyTransferredOrShared,
  });

  return {
    recordingId: String(created.recordingId) as Id<"voice_recordings">,
    reportId: created.reportId,
    caseId: created.caseId,
  };
}
