import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Badge } from "../../../components/ui/Badge";
import { Screen } from "../../../components/ui/Screen";
import { colors, fontSize, radius, spacing } from "../../../theme";
import { ASSESSMENT_COPY, useVoiceQueue } from "../../../services/voice-intelligence";
import { osCallerScreening, platformId } from "../../../protection/capabilities";
import { formatDate } from "../../../utils/format";

const TONE = {
  danger: "danger",
  warning: "warn",
  mint: "good",
  neutral: "neutral",
} as const;

/** Voice Intelligence home — the two supported voice workflows. */
export function VoiceHomeScreen() {
  const rows = useVoiceQueue();
  const os = osCallerScreening();

  const liveLabel =
    platformId === "android" && os.supported
      ? "Supported on this device"
      : platformId === "ios"
        ? "Limited on iPhone"
        : "Not available here";

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Voice Intelligence</Text>
          <Text style={styles.title}>Understand a suspicious call</Text>
          <Text style={styles.subtitle}>
            JAAL reads what was said, explains the tactics being used, and helps you
            keep the evidence if you decide to report it.
          </Text>
        </View>

        <Pressable
          onPress={() => router.push("/voice/record")}
          accessibilityRole="button"
          accessibilityLabel="Analyse a recording"
          style={({ pressed }) => [styles.primaryCard, pressed && styles.pressed]}
        >
          <Text style={styles.cardIcon}>🎙️</Text>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>Analyse a Recording</Text>
            <Text style={styles.cardText}>
              Have a suspicious call recording? JAAL can help you understand what was
              said and identify potential scam tactics.
            </Text>
          </View>
          <Text style={styles.cardCta}>Analyse →</Text>
        </Pressable>

        <Pressable
          onPress={() => router.push("/voice/live")}
          accessibilityRole="button"
          accessibilityLabel="Live Call Safety"
          style={({ pressed }) => [styles.secondaryCard, pressed && styles.pressed]}
        >
          <View style={styles.cardTop}>
            <Text style={styles.cardIcon}>🛡️</Text>
            <Badge label={liveLabel} tone={os.supported ? "good" : "neutral"} />
          </View>
          <Text style={styles.cardTitleDark}>Live Call Safety</Text>
          <Text style={styles.cardTextDark}>
            Get supported safety assistance during suspicious calls and review the
            interaction afterwards.
          </Text>
          <Text style={styles.cardLink}>Open safety guidance →</Text>
        </Pressable>

        <Text style={styles.sectionTitle}>Recent voice analyses</Text>
        {rows === undefined ? (
          <Text style={styles.muted}>Loading…</Text>
        ) : rows.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Nothing analysed yet</Text>
            <Text style={styles.muted}>
              When you analyse a recording it appears here with its report reference.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {rows.map((row) => {
              const copy = row.assessment ? ASSESSMENT_COPY[row.assessment] : null;
              return (
                <Pressable
                  key={row._id}
                  onPress={() => router.push(`/voice/${row._id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`Open analysis for ${row.fileName}`}
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                >
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {row.fileName}
                    </Text>
                    <Text style={styles.muted}>
                      {row.caseId} · {formatDate(row.createdAt)}
                    </Text>
                  </View>
                  {copy ? (
                    <Badge label={copy.label} tone={TONE[copy.tone]} />
                  ) : (
                    <Badge
                      label={row.analysisStatus === "PROCESSING" ? "Analysing" : "Pending"}
                      tone="neutral"
                    />
                  )}
                </Pressable>
              );
            })}
          </View>
        )}

        <Text style={styles.disclaimer}>
          JAAL explains warning signs from what was said. It does not prove a crime
          occurred, and it never records your calls for you.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.sm, gap: spacing.lg, paddingBottom: spacing.xxl },
  header: { gap: spacing.xs },
  eyebrow: {
    fontSize: fontSize.sm,
    fontWeight: "800",
    color: colors.primary,
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  title: { fontSize: fontSize.xxl, fontWeight: "800", color: colors.deep, lineHeight: 34 },
  subtitle: { fontSize: fontSize.base, color: colors.muted, lineHeight: 24 },
  primaryCard: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  secondaryCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  pressed: { opacity: 0.92 },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  cardIcon: { fontSize: 30 },
  cardBody: { gap: spacing.xs },
  cardTitle: { fontSize: fontSize.xl, fontWeight: "800", color: colors.white },
  cardText: { fontSize: fontSize.base, color: "#E8F1FF", lineHeight: 24 },
  cardCta: { fontSize: fontSize.base, fontWeight: "800", color: colors.white },
  cardTitleDark: { fontSize: fontSize.xl, fontWeight: "800", color: colors.deep },
  cardTextDark: { fontSize: fontSize.base, color: colors.muted, lineHeight: 24 },
  cardLink: { fontSize: fontSize.base, fontWeight: "700", color: colors.primary },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: "800",
    color: colors.deep,
    marginTop: spacing.sm,
  },
  list: { gap: spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.glass,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    minHeight: 64,
  },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { fontSize: fontSize.base, fontWeight: "700", color: colors.text },
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
  disclaimer: {
    fontSize: fontSize.xs,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 18,
    marginTop: spacing.md,
  },
});
