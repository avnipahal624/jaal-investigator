import { Pressable, StyleSheet, Text, View } from "react-native";
import { Badge } from "./ui/Badge";
import { colors, fontSize, radius, spacing } from "../theme";
import type { ConsumerReport } from "../types/consumer";
import { relativeTime } from "../utils/format";

const CATEGORY_TONE: Record<string, "info" | "warn" | "danger" | "neutral"> = {
  message: "info",
  call: "warn",
  voice: "warn",
  payment: "danger",
  link: "danger",
  other: "neutral",
};

/** One report in a list. Tapping opens the report detail. */
export function ReportRow({
  report,
  onPress,
}: {
  report: ConsumerReport;
  onPress: () => void;
}) {
  const statusTone =
    report.status === "completed" ? "good" : "info";
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Report ${report.caseId}: ${report.title}`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.header}>
        <Badge label={report.category} tone={CATEGORY_TONE[report.category] ?? "neutral"} />
        <Badge label={report.status} tone={statusTone} />
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {report.title}
      </Text>
      <View style={styles.meta}>
        <Text style={styles.metaText}>{report.caseId}</Text>
        <Text style={styles.dot}>·</Text>
        <Text style={styles.metaText}>{report.evidenceCount} evidence</Text>
        <Text style={styles.dot}>·</Text>
        <Text style={styles.metaText}>{relativeTime(report.createdAt)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  pressed: { opacity: 0.85 },
  header: { flexDirection: "row", gap: spacing.sm },
  title: { fontSize: fontSize.base, fontWeight: "700", color: colors.text },
  meta: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  metaText: { fontSize: fontSize.xs, color: colors.muted },
  dot: { fontSize: fontSize.xs, color: colors.muted },
});
