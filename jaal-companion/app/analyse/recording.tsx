import { useRef, useState } from "react";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { useAction, useMutation } from "convex/react";
import type { Id } from "@convex-dataModel";
import { Button } from "../../src/components/ui/Button";
import { Card } from "../../src/components/ui/Card";
import { Screen } from "../../src/components/ui/Screen";
import { TextField } from "../../src/components/ui/TextField";
import { api } from "../../src/services/api";
import {
  CONSENT_VERSION,
  MAX_AUDIO_BYTES,
  isAllowedMime,
  readBytes,
  resolveMimeType,
  newSubmissionKey,
  sha256Hex,
  uploadBytes,
} from "../../src/services/voiceUpload";
import { colors, fontSize, radius, spacing } from "../../src/theme";

interface PickedAsset {
  uri: string;
  name: string;
  size?: number;
  mimeType?: string;
}

/** Record/upload a suspicious call with explicit consent → real voice pipeline. */
export default function Recording() {
  const generateUploadUrl = useMutation(api.voice.generateUploadUrl);
  const createVoiceReport = useMutation(api.voice.createVoiceReport);
  const process = useAction(api.voiceActions.processRecording);

  const [asset, setAsset] = useState<PickedAsset | null>(null);
  const [consent, setConsent] = useState(false);
  const [whatHappened, setWhatHappened] = useState("");
  const [claimedIdentity, setClaimedIdentity] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Synchronous guards: two taps in one frame both see the old state value.
  const inFlight = useRef(false);
  const submissionKey = useRef(newSubmissionKey());

  async function pickFile() {
    setError(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: "audio/*",
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled) return;
      const a = (res.assets?.[0] ?? res) as unknown as PickedAsset;
      if (!a?.uri) return;
      if (a.size && a.size > MAX_AUDIO_BYTES) {
        setError(
          `That file is too large (${(a.size / 1024 / 1024).toFixed(1)} MB). The maximum is 25 MB.`,
        );
        return;
      }
      const mime = resolveMimeType(a.mimeType, a.name);
      if (!isAllowedMime(mime)) {
        setError("Please choose an audio file (MP3, M4A, WAV, AAC, OGG, WebM or AMR).");
        return;
      }
      submissionKey.current = newSubmissionKey();
      setAsset(a);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open the file picker.");
    }
  }

  async function submit() {
    if (busy || inFlight.current) return;
    setError(null);
    if (!asset) {
      setError("Choose a recording first.");
      return;
    }
    if (!consent) {
      setError("Please confirm your consent before uploading.");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    try {
      const bytes = await readBytes(asset.uri);
      const sizeBytes = bytes.byteLength;
      if (sizeBytes <= 0) throw new Error("The selected file appears to be empty.");
      if (sizeBytes > MAX_AUDIO_BYTES) throw new Error("The file is too large (max 25 MB).");

      const mimeType = resolveMimeType(asset.mimeType, asset.name);
      const fileHash = await sha256Hex(bytes);
      const uploadUrl = await generateUploadUrl({});
      const storageId = await uploadBytes(uploadUrl, bytes, mimeType);

      const created = await createVoiceReport({
        storageId,
        fileName: asset.name,
        mimeType,
        sizeBytes,
        fileHash,
        consentAccepted: true,
        consentVersion: CONSENT_VERSION,
        idempotencyKey: submissionKey.current,
        whatHappened: whatHappened.trim() || undefined,
        claimedIdentity: claimedIdentity.trim() || undefined,
      });

      const recordingId = created?.recordingId;
      if (!recordingId) throw new Error("Could not create the report.");

      // Kick off transcription + analysis (honest pending/unavailable states
      // are shown on the next screen). A failure is stored server-side by the
      // action, so the results screen offers a real Retry instead of losing it.
      void process({ recordingId: recordingId as Id<"voice_recordings"> }).catch(
        () => undefined,
      );

      router.replace(`/analysis/${recordingId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed. Please try again.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Record a call</Text>
        <Text style={styles.subtitle}>
          Upload a suspicious call or voice note. It’s stored securely and only
          seen by you and the JAAL investigator team.
        </Text>

        <Button
          label={asset ? "Change recording" : "Choose a recording"}
          variant="secondary"
          onPress={pickFile}
        />
        {asset ? (
          <Card>
            <Text style={styles.fileName} numberOfLines={1}>
              {asset.name}
            </Text>
            <Text style={styles.muted}>
              {asset.size ? `${(asset.size / 1024 / 1024).toFixed(1)} MB` : "Audio file"}
            </Text>
          </Card>
        ) : null}

        <TextField
          label="What happened? (optional)"
          value={whatHappened}
          onChangeText={setWhatHappened}
          placeholder="e.g. Someone claiming to be my bank asked for an OTP"
          multiline
          numberOfLines={4}
        />
        <TextField
          label="Who did they claim to be? (optional)"
          value={claimedIdentity}
          onChangeText={setClaimedIdentity}
          placeholder="e.g. bank, police, relative"
        />

        {/* Explicit consent */}
        <Pressable
          onPress={() => setConsent((c) => !c)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: consent }}
          style={styles.consent}
        >
          <View style={[styles.checkbox, consent && styles.checkboxOn]}>
            {consent ? <Text style={styles.check}>✓</Text> : null}
          </View>
          <Text style={styles.consentText}>
            I consent to upload this recording for analysis (consent version{" "}
            {CONSENT_VERSION}). It will be stored and reviewed by JAAL. I have the
            right to record this call.
          </Text>
        </Pressable>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <Button
          label="Upload & analyse"
          onPress={submit}
          loading={busy}
          disabled={!asset || !consent}
        />

        <Text style={styles.disclaimer}>
          Your recording is uploaded for analysis — it is never shared publicly.
          JAAL gives safety information, not legal advice.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.sm, gap: spacing.lg, paddingBottom: spacing.xxl },
  title: { fontSize: fontSize.xxl, fontWeight: "800", color: colors.deep },
  subtitle: { fontSize: fontSize.base, color: colors.muted, lineHeight: 24 },
  fileName: { fontSize: fontSize.base, fontWeight: "700", color: colors.text },
  muted: { fontSize: fontSize.sm, color: colors.muted },
  consent: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "flex-start",
    backgroundColor: colors.glass,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  checkboxOn: { backgroundColor: colors.primary },
  check: { color: colors.white, fontSize: 16, fontWeight: "800" },
  consentText: { flex: 1, fontSize: fontSize.sm, color: colors.text, lineHeight: 21 },
  errorBox: { backgroundColor: "#FADBD8", borderRadius: radius.md, padding: spacing.md },
  errorText: { fontSize: fontSize.sm, color: colors.danger },
  disclaimer: { fontSize: fontSize.xs, color: colors.muted, textAlign: "center", lineHeight: 18 },
});
