import { StyleSheet, Text, View } from "react-native";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { colors, fontSize, radius, spacing } from "../../../theme";
import type { VoiceAnalysis } from "../../../types/voice";
import { ASSESSMENT_COPY, statusLabel } from "../../../services/voice-intelligence";
import { describeProcessingError, mainConcern } from "../services/voice-analysis-service";

const TONE = {
  danger: "danger",
  warning: "warn",
  mint: "good",
  neutral: "neutral",
} as const;

/**
 * The overall assessment.
 *
 * Always framed as an AI assessment of warning signs — never as a confirmed
 * finding of crime, and never with a numeric fraud probability.
 */
export function VoiceAnalysisCard({
  analysis,
  onRetry,
  retrying = false,
}: {
  analysis: VoiceAnalysis;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const copy = analysis.assessment ? ASSESSMENT_COPY[analysis.assessment] : null;
  const concern = mainConcern(analysis.findings);
  const failure = describeProcessingError("analysis", analysis.error);

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.heading}>What JAAL found</Text>
        {copy ? <Badge label={copy.label} tone={TONE[copy.tone]} /> : null}
      </View>

      {analysis.status === "COMPLETED" && analysis.summary ? (
        <>
          <Text style={styles.summary}>{analysis.summary}</Text>

          {concern ? (
            <View style={styles.concernBox}>
              <Text style={styles.concernLabel}>Main concern</Text>
              <Text style={styles.concernText}>{concern.tactic}</Text>
            </View>
          ) : null}

          {copy ? <Text style={styles.muted}>{copy.short}</Text> : null}

          <View style={styles.aiNotice}>
            <Text style={styles.aiNoticeText}>
              This is an automated assessment of the transcript, not a confirmed
              finding that a crime occurred. The caller’s identity has not been
              verified.
            </Text>
          </View>

          {analysis.limitations && analysis.limitations.length > 0 ? (
            <View style={styles.limits}>
              <Text style={styles.limitsTitle}>Keep in mind</Text>
              {analysis.limitations.map((limit, index) => (
                <Text key={index} style={styles.limitItem}>
                  • {limit}
                </Text>
              ))}
            </View>
          ) : null}
        </>
      ) : (
        <View style={styles.pending}>
          <Text style={styles.pendingTitle}>
            {analysis.status === "PROCESSING"
              ? "Analysing the transcript…"
              : analysis.status === "NOT_STARTED"
                ? "Analysis hasn’t started yet"
                : `Analysis ${statusLabel(analysis.status).toLowerCase()}`}
          </Text>
          <Text style={styles.muted}>
            {failure ??
              (analysis.status === "PROCESSING"
                ? "This usually takes under a minute."
                : "You can try again, or add what was said on the call yourself.")}
          </Text>
          {onRetry ? (
            <Button
              label={analysis.status === "FAILED" ? "Retry analysis" : "Run analysis"}
              variant="secondary"
              onPress={onRetry}
              loading={retrying}
            />
          ) : null}
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
  summary: { fontSize: fontSize.base, color: colors.text, lineHeight: 26 },
  concernBox: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
    borderLeftWidth: 4,
    borderLeftColor: colors.warning,
  },
  concernLabel: { fontSize: fontSize.xs, fontWeight: "800", color: colors.muted },
  concernText: { fontSize: fontSize.base, fontWeight: "700", color: colors.deep },
  muted: { fontSize: fontSize.sm, color: colors.muted, lineHeight: 21 },
  aiNotice: {
    backgroundColor: colors.backgroundAlt,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  aiNoticeText: { fontSize: fontSize.sm, color: colors.deep, lineHeight: 21 },
  limits: { gap: 2 },
  limitsTitle: { fontSize: fontSize.sm, fontWeight: "800", color: colors.deep },
  limitItem: { fontSize: fontSize.xs, color: colors.muted, lineHeight: 18 },
  pending: {
    backgroundColor: colors.glass,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  pendingTitle: { fontSize: fontSize.base, fontWeight: "700", color: colors.deep },
});
