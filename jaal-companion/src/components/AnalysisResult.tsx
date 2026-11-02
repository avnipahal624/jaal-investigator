import { StyleSheet, Text, View } from "react-native";
import { Badge } from "./ui/Badge";
import { Card } from "./ui/Card";
import { colors, fontSize, spacing } from "../theme";
import type { ConsumerAnalysisResult } from "../types/analysis";

/**
 * Renders a structured analysis result. Shows an honest unavailable/failed
 * state instead of a fake result, and never invents an overall risk score —
 * only per-indicator qualitative levels and verbatim excerpts.
 */
export function AnalysisResult({
  result,
  children,
}: {
  result: ConsumerAnalysisResult;
  children?: React.ReactNode;
}) {
  if (result.status === "UNAVAILABLE" || result.status === "FAILED") {
    return (
      <Card style={styles.stateCard}>
        <Text style={styles.stateEmoji}>
          {result.status === "UNAVAILABLE" ? "⚠️" : "ℹ️"}
        </Text>
        <Text style={styles.stateTitle}>
          {result.status === "UNAVAILABLE"
            ? "Analysis unavailable"
            : "Couldn’t complete the analysis"}
        </Text>
        <Text style={styles.muted}>{result.error}</Text>
        {children}
      </Card>
    );
  }

  return (
    <View style={styles.wrap}>
      <Card>
        <View style={styles.headRow}>
          <Badge label={result.category} tone="info" />
        </View>
        <Text style={styles.assessment}>{result.assessment}</Text>
        <Text style={styles.explanation}>{result.explanation}</Text>
      </Card>

      {result.indicators.length > 0 ? (
        <Card>
          <Text style={styles.section}>What we noticed</Text>
          {result.indicators.map((ind, i) => (
            <View key={i} style={styles.indicatorRow}>
              <Text style={styles.indicatorLabel}>{ind.label}</Text>
              <Badge
                label={ind.level}
                tone={
                  ind.level === "HIGH"
                    ? "danger"
                    : ind.level === "MEDIUM"
                      ? "warn"
                      : "neutral"
                }
              />
            </View>
          ))}
        </Card>
      ) : null}

      {result.excerpts.length > 0 ? (
        <Card>
          <Text style={styles.section}>From your content</Text>
          {result.excerpts.map((ex, i) => (
            <View key={i} style={styles.excerpt}>
              <Text style={styles.excerptText}>“{ex}”</Text>
            </View>
          ))}
        </Card>
      ) : null}

      {result.tactics.length > 0 ? (
        <Card>
          <Text style={styles.section}>Tactics used</Text>
          {result.tactics.map((t, i) => (
            <View key={i} style={styles.tactic}>
              <Text style={styles.tacticName}>{t.name}</Text>
              <Text style={styles.muted}>{t.explanation}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      {result.actions.length > 0 ? (
        <Card>
          <Text style={styles.section}>What you can do</Text>
          {result.actions.map((a, i) => (
            <View key={i} style={styles.actionRow}>
              <Text style={styles.actionBullet}>•</Text>
              <Text style={styles.actionText}>{a}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  headRow: { flexDirection: "row" },
  assessment: { fontSize: fontSize.lg, fontWeight: "800", color: colors.deep, lineHeight: 26 },
  explanation: { fontSize: fontSize.base, color: colors.text, lineHeight: 24 },
  section: { fontSize: fontSize.base, fontWeight: "800", color: colors.deep, marginBottom: spacing.xs },
  muted: { fontSize: fontSize.sm, color: colors.muted, lineHeight: 21 },
  indicatorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  indicatorLabel: { fontSize: fontSize.sm, color: colors.text, flex: 1 },
  excerpt: {
    backgroundColor: colors.backgroundAlt,
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.xs,
  },
  excerptText: { fontSize: fontSize.sm, color: colors.deep, fontStyle: "italic", lineHeight: 21 },
  tactic: { paddingVertical: spacing.xs, gap: 2 },
  tacticName: { fontSize: fontSize.sm, fontWeight: "700", color: colors.text },
  actionRow: { flexDirection: "row", gap: spacing.sm, paddingVertical: 2 },
  actionBullet: { fontSize: fontSize.base, color: colors.teal, fontWeight: "800" },
  actionText: { fontSize: fontSize.sm, color: colors.text, flex: 1, lineHeight: 21 },
  stateCard: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xl },
  stateEmoji: { fontSize: 36 },
  stateTitle: { fontSize: fontSize.lg, fontWeight: "800", color: colors.deep, textAlign: "center" },
});
