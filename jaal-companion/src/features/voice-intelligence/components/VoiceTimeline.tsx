import { Pressable, StyleSheet, Text, View } from "react-native";
import { Badge } from "../../../components/ui/Badge";
import { colors, fontSize, radius, spacing } from "../../../theme";
import type { TimelineEntry } from "../services/voice-analysis-service";

const SEVERITY_TONE = {
  high: "danger",
  medium: "warn",
  low: "neutral",
} as const;

/**
 * Suspicious statements in audio order.
 *
 * Entries carry a timestamp only when the backend supplied one; untimed
 * findings are still listed but visibly marked, never placed at a made-up
 * position.
 */
export function VoiceTimeline({
  entries,
  onSeek,
}: {
  entries: TimelineEntry[];
  onSeek?: (ms: number) => void;
}) {
  if (entries.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>No suspicious statements found</Text>
        <Text style={styles.muted}>
          No specific lines were flagged in this transcript. That is not a
          guarantee the call was safe.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {entries.map((entry) => (
        <View key={entry.id} style={styles.card}>
          <View style={styles.topRow}>
            {entry.timestampMs !== undefined && entry.timestampLabel ? (
              <Pressable
                onPress={() => onSeek?.(entry.timestampMs ?? 0)}
                disabled={!onSeek}
                accessibilityRole="button"
                accessibilityLabel={`Play from ${entry.timestampLabel}`}
                style={({ pressed }) => [styles.stampButton, pressed && styles.pressed]}
              >
                <Text style={styles.stampText}>▶ {entry.timestampLabel}</Text>
              </Pressable>
            ) : (
              <Badge label="No timestamp" tone="neutral" />
            )}
            <Badge
              label={`${entry.severity === "high" ? "High" : entry.severity === "medium" ? "Medium" : "Low"} concern`}
              tone={SEVERITY_TONE[entry.severity] ?? "neutral"}
            />
          </View>

          <Text style={styles.tactic}>{entry.tactic}</Text>

          <View style={styles.quoteBox}>
            <Text style={styles.quote}>“{entry.excerpt}”</Text>
            <Text style={styles.quoteSource}>
              {entry.observed
                ? "Quoted from the transcript"
                : "AI interpretation — not a direct quote"}
            </Text>
          </View>

          <Text style={styles.explanation}>{entry.explanation}</Text>

          <View style={styles.actionBox}>
            <Text style={styles.actionLabel}>What you can do</Text>
            <Text style={styles.actionText}>{entry.recommendedAction}</Text>
          </View>

          <Text style={styles.confidence}>
            Model confidence: {entry.confidence}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  card: {
    backgroundColor: colors.glass,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  stampButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    minHeight: 36,
    justifyContent: "center",
  },
  pressed: { opacity: 0.85 },
  stampText: {
    color: colors.white,
    fontSize: fontSize.sm,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  tactic: { fontSize: fontSize.base, fontWeight: "800", color: colors.deep },
  quoteBox: {
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    paddingLeft: spacing.md,
    gap: 2,
  },
  quote: { fontSize: fontSize.base, color: colors.text, lineHeight: 26, fontStyle: "italic" },
  quoteSource: { fontSize: fontSize.xs, color: colors.muted },
  explanation: { fontSize: fontSize.base, color: colors.text, lineHeight: 25 },
  actionBox: {
    backgroundColor: colors.white,
    borderRadius: radius.sm,
    padding: spacing.md,
    gap: 2,
  },
  actionLabel: { fontSize: fontSize.xs, fontWeight: "800", color: colors.teal },
  actionText: { fontSize: fontSize.base, color: colors.text, lineHeight: 24 },
  confidence: { fontSize: fontSize.xs, color: colors.muted },
  empty: {
    backgroundColor: colors.glass,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  emptyTitle: { fontSize: fontSize.base, fontWeight: "700", color: colors.deep },
  muted: { fontSize: fontSize.sm, color: colors.muted, lineHeight: 21 },
});
