import { StyleSheet, Text, View } from "react-native";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { colors, fontSize, radius, spacing } from "../../../theme";
import {
  INTEGRITY_EXPLANATION,
  RECORDING_STORAGE_EXPLANATION,
  type VoiceReportSummaryModel,
} from "../services/voice-report-service";

/**
 * The submitted report at a glance.
 *
 * Indicators here are quoted from the transcript and explicitly NOT verified
 * intelligence — a threat-intelligence match would be shown separately.
 */
export function VoiceReportSummary({
  summary,
  onDelete,
  deleting = false,
}: {
  summary: VoiceReportSummaryModel;
  onDelete?: () => void;
  deleting?: boolean;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.heading}>Your report</Text>
        <Badge label={summary.intakeLabel} tone="info" />
      </View>

      <View style={styles.refBox}>
        <Text style={styles.refLabel}>Reference</Text>
        <Text style={styles.refValue}>{summary.caseId}</Text>
        <Text style={styles.muted}>
          Saved to your JAAL reports. An investigator can review the recording,
          transcript and notes.
        </Text>
      </View>

      {summary.headline ? (
        <Text style={styles.headline}>{summary.headline}</Text>
      ) : null}

      {summary.indicators.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Details mentioned on the call</Text>
          <Text style={styles.muted}>
            Copied from what was said. These have not been checked and are not
            confirmed scam numbers or accounts.
          </Text>
          {summary.indicators.map((group) => (
            <View key={group.type} style={styles.indicatorGroup}>
              <Text style={styles.indicatorLabel}>{group.label}</Text>
              {group.items.map((item, index) => (
                <View key={`${group.type}-${index}`} style={styles.indicatorRow}>
                  <Text style={styles.indicatorValue}>{item.value}</Text>
                  {item.context ? (
                    <Text style={styles.indicatorContext}>{item.context}</Text>
                  ) : null}
                </View>
              ))}
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recommended next steps</Text>
        {summary.nextSteps.map((step, index) => (
          <Text key={index} style={styles.step}>
            {index + 1}. {step}
          </Text>
        ))}
        <Text style={styles.muted}>
          JAAL gives safety guidance, not legal advice. Use official contact details
          you look up yourself.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Evidence details</Text>
        {summary.evidence.map((fact) => (
          <View key={fact.label} style={styles.factRow}>
            <Text style={styles.factLabel}>{fact.label}</Text>
            <Text style={styles.factValue}>{fact.value}</Text>
          </View>
        ))}
        <Text style={styles.muted}>{INTEGRITY_EXPLANATION}</Text>
        <Text style={styles.muted}>{RECORDING_STORAGE_EXPLANATION}</Text>
      </View>

      {onDelete ? (
        <Button
          label="Delete recording and audio"
          variant="danger"
          onPress={onDelete}
          loading={deleting}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  heading: { fontSize: fontSize.lg, fontWeight: "800", color: colors.deep },
  refBox: { gap: 2 },
  refLabel: { fontSize: fontSize.xs, fontWeight: "800", color: colors.muted },
  refValue: {
    fontSize: fontSize.xl,
    fontWeight: "800",
    color: colors.primary,
    letterSpacing: 0.5,
  },
  headline: { fontSize: fontSize.base, color: colors.text, lineHeight: 25 },
  section: { gap: spacing.xs },
  sectionTitle: { fontSize: fontSize.base, fontWeight: "800", color: colors.deep },
  muted: { fontSize: fontSize.xs, color: colors.muted, lineHeight: 18 },
  step: { fontSize: fontSize.base, color: colors.text, lineHeight: 24 },
  indicatorGroup: { gap: 2, marginTop: spacing.xs },
  indicatorLabel: { fontSize: fontSize.xs, fontWeight: "800", color: colors.muted },
  indicatorRow: {
    backgroundColor: colors.white,
    borderRadius: radius.sm,
    padding: spacing.sm,
    gap: 2,
  },
  indicatorValue: { fontSize: fontSize.base, color: colors.deep, fontWeight: "600" },
  indicatorContext: { fontSize: fontSize.xs, color: colors.muted },
  factRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
  factLabel: { fontSize: fontSize.sm, color: colors.muted },
  factValue: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontWeight: "600",
    flexShrink: 1,
    textAlign: "right",
  },
});
