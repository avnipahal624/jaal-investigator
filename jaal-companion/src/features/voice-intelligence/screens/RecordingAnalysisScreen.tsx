import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation } from "convex/react";
import { Button } from "../../../components/ui/Button";
import { Screen } from "../../../components/ui/Screen";
import { TextField } from "../../../components/ui/TextField";
import { colors, fontSize, radius, spacing } from "../../../theme";
import { api } from "../../../services/api";
import { useProcessVoiceRecording } from "../../../services/voice-intelligence";
import type { VoiceFile } from "../../../types/voice";
import { RecordingPicker } from "../components/RecordingPicker";
import { RecordingPreview } from "../components/RecordingPreview";
import { RecordingConsent } from "../components/RecordingConsent";
import { uploadRecording } from "../services/recording-service";
import { processRecording } from "../services/voice-analysis-service";

/**
 * Recorded-call analysis — the cross-platform workflow.
 *
 * Order is enforced: choose → consent → upload → process. Nothing is uploaded
 * before consent, and a failed upload keeps the chosen file so the user can
 * retry without picking it again.
 */
export function RecordingAnalysisScreen() {
  const { flagged } = useLocalSearchParams<{ flagged?: string }>();
  const generateUploadUrl = useMutation(api.voice.generateUploadUrl);
  const createVoiceReport = useMutation(api.voice.createVoiceReport);
  const runProcessing = useProcessVoiceRecording();

  const [file, setFile] = useState<VoiceFile | null>(null);
  const [consent, setConsent] = useState(false);
  const [callerPhone, setCallerPhone] = useState("");
  const [claimedIdentity, setClaimedIdentity] = useState("");
  const [whatHappened, setWhatHappened] = useState(
    flagged === "1" ? "I marked this call as suspicious while it was happening." : "",
  );
  const [moneyRequested, setMoneyRequested] = useState(false);
  const [credentialsRequested, setCredentialsRequested] = useState(false);
  const [stage, setStage] = useState<"idle" | "uploading" | "processing">("idle");
  const [error, setError] = useState<string | null>(null);

  const busy = stage !== "idle";

  async function submit() {
    if (!file) {
      setError("Choose a recording first.");
      return;
    }
    if (!consent) {
      setError("Please confirm your consent before uploading.");
      return;
    }

    setError(null);
    setStage("uploading");
    try {
      const created = await uploadRecording({
        file,
        generateUploadUrl: () => generateUploadUrl({}),
        createVoiceReport,
        context: {
          callerPhone: callerPhone.trim() || undefined,
          claimedIdentity: claimedIdentity.trim() || undefined,
          whatHappened: whatHappened.trim() || undefined,
          moneyRequested: moneyRequested || undefined,
          credentialsRequested: credentialsRequested || undefined,
        },
      });

      setStage("processing");
      // Navigate first so the user sees live status while the server works.
      router.replace(`/voice/${created.recordingId}`);

      const outcome = await processRecording(created.recordingId, runProcessing);
      if (!outcome.ok) {
        // The result screen also offers a retry; nothing is invented here.
        setError(outcome.message);
      }
    } catch (err) {
      // The file and consent are kept, so this can be retried safely.
      setError(
        err instanceof Error ? err.message : "Upload failed. Please try again.",
      );
      setStage("idle");
    }
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Analyse a recording</Text>
          <Text style={styles.subtitle}>
            Upload a call recording. JAAL transcribes it, looks for scam tactics, and
            keeps the original file as evidence for your report.
          </Text>
        </View>

        <RecordingPicker
          file={file}
          onSelect={(selected) => {
            setFile(selected);
            setError(null);
          }}
          onRemove={() => setFile(null)}
          disabled={busy}
        />

        {file ? (
          <RecordingPreview uri={file.uri} label="Selected recording" />
        ) : null}

        <RecordingConsent consent={consent} onChange={setConsent} disabled={busy} />

        <View style={styles.section}>
          <Text style={styles.step}>Step 3 · Tell JAAL about the call (optional)</Text>
          <TextField
            label="Caller number, if you have it"
            value={callerPhone}
            onChangeText={setCallerPhone}
            placeholder="e.g. the number that called you"
            keyboardType="phone-pad"
          />
          <TextField
            label="Who did they claim to be?"
            value={claimedIdentity}
            onChangeText={setClaimedIdentity}
            placeholder="e.g. bank, police, delivery, relative"
          />
          <TextField
            label="What happened?"
            value={whatHappened}
            onChangeText={setWhatHappened}
            placeholder="A sentence in your own words"
            multiline
            numberOfLines={4}
          />

          <ToggleRow
            label="They asked for money"
            value={moneyRequested}
            onChange={() => setMoneyRequested((v) => !v)}
          />
          <ToggleRow
            label="They asked for an OTP, PIN or banking details"
            value={credentialsRequested}
            onChange={() => setCredentialsRequested((v) => !v)}
          />
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <Button
          label={
            stage === "uploading"
              ? "Uploading…"
              : stage === "processing"
                ? "Analysing…"
                : "Upload & analyse"
          }
          onPress={submit}
          loading={busy}
          disabled={!file || !consent}
        />

        <Text style={styles.disclaimer}>
          Nothing is uploaded until you tap the button above. You can delete the
          recording and its audio afterwards.
        </Text>
      </ScrollView>
    </Screen>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: () => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Button
        label={value ? "Yes" : "No"}
        variant={value ? "primary" : "secondary"}
        onPress={onChange}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.sm, gap: spacing.lg, paddingBottom: spacing.xxl },
  header: { gap: spacing.xs },
  title: { fontSize: fontSize.xxl, fontWeight: "800", color: colors.deep },
  subtitle: { fontSize: fontSize.base, color: colors.muted, lineHeight: 24 },
  section: { gap: spacing.sm },
  step: { fontSize: fontSize.lg, fontWeight: "800", color: colors.deep },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    minHeight: 48,
  },
  toggleLabel: { flex: 1, fontSize: fontSize.base, color: colors.text, lineHeight: 23 },
  errorBox: { backgroundColor: "#FADBD8", borderRadius: radius.md, padding: spacing.md },
  errorText: { fontSize: fontSize.sm, color: colors.danger, lineHeight: 20 },
  disclaimer: {
    fontSize: fontSize.xs,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 18,
  },
});
