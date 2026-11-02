import { StyleSheet, Text, View } from "react-native";
import { colors, fontSize, radius, spacing } from "../../theme";

type Tone = "neutral" | "info" | "good" | "warn" | "danger";

/** Compact pill for statuses (risk level, report state, evidence type). */
export function Badge({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  const t = TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      <Text style={[styles.text, { color: t.text }]}>{label}</Text>
    </View>
  );
}

const TONES: Record<Tone, { bg: string; text: string }> = {
  neutral: { bg: colors.backgroundAlt, text: colors.deep },
  info: { bg: colors.backgroundAlt, text: colors.primary },
  good: { bg: colors.mint, text: colors.teal },
  warn: { bg: "#FCEFCB", text: colors.warning },
  danger: { bg: "#FADBD8", text: colors.danger },
};

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: "flex-start",
  },
  text: { fontSize: fontSize.xs, fontWeight: "700" },
});
