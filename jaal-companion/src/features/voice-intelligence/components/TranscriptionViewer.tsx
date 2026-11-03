import { Pressable, StyleSheet, Text, View } from "react-native";
import { Badge } from "../../../components/ui/Badge";
import { colors, fontSize, radius, spacing } from "../../../theme";
import type {
  TranscriptSegment,
  TranscriptSource,
  TranscriptionStatus,
} from "../../../types/voice";
import { formatTimestamp } from "../../../services/voice-intelligence";
import { describeProcessingError } from "../services/voice-analysis-service";

/**
 * The transcript, exactly as produced.
 *
 * Timestamps are rendered only for segments that carry a real `startMs`, and
 * speaker labels only where the provider actually supplied them. When neither
 * exists the transcript is still shown — silently, without a fake timeline.
 */
export function TranscriptionViewer({
  transcript,
  segments,
  source,
  status,
  language,
  error,
  onSeek,
}: {
  transcript: string | null;
  segments: TranscriptSegment[] | null;
  source: TranscriptSource | null;
  status: TranscriptionStatus;
  language?: string | null;
  error?: string | null;
  onSeek?: (ms: number) => void;
}) {
  const sourceBadge =
    source === "SPEECH_PROVIDER"
      ? { label: "Automatic transcript", tone: "info" as const }
      : source === "CONSUMER_PROVIDED"
        ? { label: "You typed this", tone: "warn" as const }
        : null;

  const timed = (segments ?? []).filter(
    (s) => typeof s.startMs === "number" && s.text.trim().length > 0,
  );
  const speakerLabeled = (segments ?? []).some((s) => Boolean(s.speaker));

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.heading}>Transcript</Text>
        {sourceBadge ? <Badge label={sourceBadge.label} tone={sourceBadge.tone} /> : null}
      </View>

      {language ? (
        <Text style={styles.meta}>Detected language: {language}</Text>
      ) : null}

      {transcript ? (
        <>
          {timed.length > 0 ? (
            <View style={styles.segments}>
              {timed.map((segment, index) => {
                const label = formatTimestamp(segment.startMs);
                const content = (
                  <>
                    <Text style={styles.stamp}>{label}</Text>
                    <View style={styles.segmentText}>
                      {segment.speaker ? (
                        <Text style={styles.speaker}>{segment.speaker}</Text>
                      ) : null}
                      <Text style={styles.line}>{segment.text}</Text>
                    </View>
                  </>
                );
                return onSeek ? (
                  <Pressable
                    key={`${segment.startMs}-${index}`}
                    onPress={() => onSeek(segment.startMs ?? 0)}
                    accessibilityRole="button"
                    accessibilityLabel={`Play from ${label}`}
                    style={({ pressed }) => [styles.segment, pressed && styles.pressed]}
                  >
                    {content}
                  </Pressable>
                ) : (
                  <View key={`${segment.startMs}-${index}`} style={styles.segment}>
                    {content}
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={styles.paragraph}>{transcript}</Text>
          )}

          {timed.length > 0 ? (
            <Text style={styles.note}>Tap a timestamp to play that moment.</Text>
          ) : (
            <Text style={styles.note}>
              This transcript has no timestamps, so it is shown without a timeline.
            </Text>
          )}

          {!speakerLabeled ? (
            <Text style={styles.note}>
              Speaker labels weren’t available for this recording, so who said each
              line is not identified.
            </Text>
          ) : null}

          <Text style={styles.note}>
            Automatic transcripts can contain errors. If a line looks wrong, rely on
            the recording itself.
          </Text>
        </>
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>
            {status === "PROCESSING" ? "Transcribing…" : "No transcript yet"}
          </Text>
          <Text style={styles.note}>
            {describeProcessingError("transcription", error) ??
              (status === "PROCESSING"
                ? "This usually takes under a minute."
                : "Once the audio is read, the transcript will appear here.")}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  heading: { fontSize: fontSize.lg, fontWeight: "800", color: colors.deep },
  meta: { fontSize: fontSize.sm, color: colors.muted },
  segments: { gap: spacing.sm },
  segment: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "flex-start",
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    minHeight: 48,
  },
  pressed: { backgroundColor: colors.backgroundAlt },
  stamp: {
    fontSize: fontSize.sm,
    fontWeight: "800",
    color: colors.primary,
    fontVariant: ["tabular-nums"],
    minWidth: 44,
  },
  segmentText: { flex: 1, gap: 2 },
  speaker: { fontSize: fontSize.sm, fontWeight: "700", color: colors.muted },
  line: { fontSize: fontSize.base, color: colors.text, lineHeight: 26 },
  paragraph: { fontSize: fontSize.base, color: colors.text, lineHeight: 27 },
  note: { fontSize: fontSize.xs, color: colors.muted, lineHeight: 18 },
  empty: {
    backgroundColor: colors.glass,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  emptyTitle: { fontSize: fontSize.base, fontWeight: "700", color: colors.deep },
});
