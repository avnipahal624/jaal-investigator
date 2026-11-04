import { useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { Screen } from "../../../components/ui/Screen";
import { TextField } from "../../../components/ui/TextField";
import { colors, fontSize, radius, spacing } from "../../../theme";
import {
  useDeleteVoiceRecording,
  useProcessVoiceRecording,
  useSubmitTranscript,
  useVoiceAudioUrl,
  useVoiceRecording,
} from "../../../services/voice-intelligence";
import { RecordingPreview } from "../components/RecordingPreview";
import { TranscriptionViewer } from "../components/TranscriptionViewer";
import { VoiceAnalysisCard } from "../components/VoiceAnalysisCard";
import { VoiceTimeline } from "../components/VoiceTimeline";
import { VoiceReportSummary } from "../components/VoiceReportSummary";
import { buildTimeline } from "../services/voice-analysis-service";
import { buildReportSummary } from "../services/voice-report-service";

/**
 * One voice analysis: playback, timeline, transcript, findings and the report.
 *
 * Everything is driven by the live Convex record, so transcription and analysis
 * statuses update in place without a manual refresh.
 */
export function VoiceResultsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { recording, loading } = useVoiceRecording(id);
  const { url } = useVoiceAudioUrl(id);
  const process = useProcessVoiceRecording();
  const submitTranscript = useSubmitTranscript();
  const deleteRecording = useDeleteVoiceRecording();

  const [seekTo, setSeekTo] = useState<number | null>(null);
  const [retrying, setRetrying] = useState(false);
  const retryInFlight = useRef(false);
  const [deleting, setDeleting] = useState(false);
  const [manualTranscript, setManualTranscript] = useState("");
  const [manualSaving, setManualSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timeline = useMemo(
    () => buildTimeline(recording?.analysis.findings),
    [recording?.analysis.findings],
  );
  const summary = useMemo(
    () => (recording ? buildReportSummary(recording) : null),
    [recording],
  );

  async function retry() {
    if (!id || retryInFlight.current) return;
    retryInFlight.current = true;
    setRetrying(true);
    setError(null);
    try {
      await process(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Processing failed. Try again.");
    } finally {
      retryInFlight.current = false;
      setRetrying(false);
    }
  }

  async function saveTranscript() {
    if (!id || !manualTranscript.trim()) return;
    setManualSaving(true);
    setError(null);
    try {
      await submitTranscript({ recordingId: id as never, transcript: manualTranscript });
      setManualTranscript("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that transcript.");
    } finally {
      setManualSaving(false);
    }
  }

  function confirmDelete() {
    if (!id) return;
    Alert.alert(
      "Delete this recording?",
      "The audio and transcript will be removed and cannot be recovered. The report reference stays in your reports.",
      [
        { text: "Keep it", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteRecording({ recordingId: id as never });
              router.back();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not delete it.");
              setDeleting(false);
            }
          },
        },
      ],
    );
  }

  if (loading) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.muted}>Loading analysis…</Text>
        </View>
      </Screen>
    );
  }

  if (!recording || !summary) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>This recording isn’t available</Text>
          <Text style={styles.muted}>
            It may have been deleted, or it belongs to another account.
          </Text>
          <Button label="Back to voice" variant="secondary" onPress={() => router.replace("/voice")} />
        </View>
      </Screen>
    );
  }

  const canAddTranscript =
    recording.transcriptSource !== "SPEECH_PROVIDER" && !recording.transcript;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>{recording.caseId}</Text>
          <Text style={styles.title} numberOfLines={2}>
            {recording.fileName}
          </Text>
          <Text style={styles.muted}>
            {recording.claimedIdentity
              ? `Caller claimed to be: ${recording.claimedIdentity}`
              : "No caller details added"}
          </Text>
        </View>

        <Card>
          {url ? (
            <RecordingPreview uri={url} seekToMs={seekTo} label="Recording" />
          ) : (
            <Text style={styles.muted}>
              Playback isn’t available for this recording right now. The stored file is
              still kept for investigators.
            </Text>
          )}
        </Card>

        <VoiceAnalysisCard analysis={recording.analysis} onRetry={retry} retrying={retrying} />

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <VoiceTimeline
          entries={timeline}
          onSeek={url ? (ms) => setSeekTo(ms) : undefined}
        />

        <TranscriptionViewer
          transcript={recording.transcript}
          segments={recording.transcriptSegments}
          source={recording.transcriptSource}
          status={recording.transcription.status}
          language={recording.transcription.language}
          error={recording.transcription.error}
          onSeek={url ? (ms) => setSeekTo(ms) : undefined}
        />

        {canAddTranscript ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Add what was said yourself</Text>
            <Text style={styles.muted}>
              If the audio can’t be transcribed, you can type or paste the parts you
              remember. It is labelled as your own words, never as an automatic
              transcript, and the recording is still kept.
            </Text>
            <TextField
              label="What was said"
              value={manualTranscript}
              onChangeText={setManualTranscript}
              placeholder="Type what you remember from the call"
              multiline
              numberOfLines={6}
            />
            <Button
              label="Save and analyse this text"
              variant="secondary"
              onPress={async () => {
                await saveTranscript();
                await retry();
              }}
              loading={manualSaving}
              disabled={!manualTranscript.trim()}
            />
          </View>
        ) : null}

        <VoiceReportSummary summary={summary} onDelete={confirmDelete} deleting={deleting} />

        <Button label="Back to voice" variant="ghost" onPress={() => router.back()} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.sm, gap: spacing.lg, paddingBottom: spacing.xxl },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm },
  header: { gap: 2 },
  eyebrow: {
    fontSize: fontSize.sm,
    fontWeight: "800",
    color: colors.primary,
    letterSpacing: 0.6,
  },
  title: { fontSize: fontSize.xl, fontWeight: "800", color: colors.deep },
  section: { gap: spacing.sm },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: "800", color: colors.deep },
  muted: { fontSize: fontSize.sm, color: colors.muted, lineHeight: 21, textAlign: "left" },
  emptyTitle: { fontSize: fontSize.base, fontWeight: "700", color: colors.deep },
  errorBox: { backgroundColor: "#FADBD8", borderRadius: radius.md, padding: spacing.md },
  errorText: { fontSize: fontSize.sm, color: colors.danger, lineHeight: 20 },
});
