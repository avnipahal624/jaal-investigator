import { router } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Pressable } from "react-native";
import { useQuery } from "convex/react";
import { ReportRow } from "../../src/components/ReportRow";
import { Button } from "../../src/components/ui/Button";
import { Card } from "../../src/components/ui/Card";
import { Screen } from "../../src/components/ui/Screen";
import { api } from "../../src/services/api";
import { useAuth } from "../../src/hooks/use-auth";
import { colors, fontSize, radius, spacing } from "../../src/theme";
import type { ConsumerDashboard } from "../../src/types/consumer";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function initials(user: { name?: string | null; email?: string | null } | null | undefined): string {
  const source = user?.name || user?.email || "?";
  return source.trim().charAt(0).toUpperCase() || "?";
}

/** Consumer home dashboard. */
export default function Home() {
  const { user } = useAuth();
  const dashboard = useQuery(api.consumer.consumerDashboard) as
    | ConsumerDashboard
    | undefined;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.greeting}>{greeting()},</Text>
            <Text style={styles.name}>
              {(user?.name || user?.email || "there").toString()}
            </Text>
          </View>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(user)}</Text>
          </View>
        </View>

        {/* Primary CTA */}
        <Pressable
          onPress={() => router.push("/analyse")}
          accessibilityRole="button"
          accessibilityLabel="Analyse something suspicious"
          style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
        >
          <Text style={styles.ctaEmoji}>🔎</Text>
          <View style={styles.ctaText}>
            <Text style={styles.ctaTitle}>Analyse something suspicious</Text>
            <Text style={styles.ctaBody}>
              Check a message, link, or record — before you act on it.
            </Text>
          </View>
          <Text style={styles.ctaArrow}>→</Text>
        </Pressable>

        {/* Voice intelligence entry */}
        <Pressable
          onPress={() => router.push("/voice")}
          accessibilityRole="button"
          accessibilityLabel="Voice intelligence"
          style={({ pressed }) => [styles.voiceCard, pressed && styles.ctaPressed]}
        >
          <Text style={styles.voiceEmoji}>🎙️</Text>
          <View style={styles.voiceText}>
            <Text style={styles.voiceTitle}>Voice Intelligence</Text>
            <Text style={styles.voiceBody}>
              Analyse a suspicious call recording, or get safety guidance during a call.
            </Text>
          </View>
          <Text style={styles.voiceArrow}>→</Text>
        </Pressable>

        {/* Protection overview */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Protection overview</Text>
        </View>
        <View style={styles.stats}>
          <Stat
            label="Reports"
            value={dashboard?.totalReports}
            tint={colors.primary}
          />
          <Stat
            label="Under review"
            value={dashboard?.underReview}
            tint={colors.warning}
          />
          <Stat
            label="Resolved"
            value={dashboard?.completed}
            tint={colors.teal}
          />
          <Stat
            label="Evidence"
            value={dashboard?.evidenceCount}
            tint={colors.deep}
          />
        </View>

        {/* Recent activity */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent activity</Text>
          {dashboard && dashboard.recent.length > 0 ? (
            <Pressable onPress={() => router.push("/(tabs)/activity")}>
              <Text style={styles.link}>View all</Text>
            </Pressable>
          ) : null}
        </View>

        {dashboard === undefined ? (
          <Card>
            <Text style={styles.muted}>Loading your reports…</Text>
          </Card>
        ) : dashboard.recent.length === 0 ? (
          <Card>
            <Text style={styles.emptyTitle}>No reports yet</Text>
            <Text style={styles.muted}>
              When you analyse or report something, it will show up here.
            </Text>
          </Card>
        ) : (
          <View style={styles.list}>
            {dashboard.recent.map((r) => (
              <ReportRow
                key={r._id}
                report={r}
                onPress={() => router.push(`/reports/${r._id}`)}
              />
            ))}
          </View>
        )}

        {/* Safety assistant */}
        <Card style={styles.assistant}>
          <Text style={styles.assistantEmoji}>💬</Text>
          <View style={styles.assistantText}>
            <Text style={styles.assistantTitle}>JAAL Safety Assistant</Text>
            <Text style={styles.muted}>
              Ask anything about a suspicious message, call, or request.
            </Text>
          </View>
          <Button
            label="Ask"
            onPress={() => router.push("/assistant")}
            style={styles.askBtn}
          />
        </Card>
      </ScrollView>
    </Screen>
  );
}

function Stat({
  label,
  value,
  tint,
}: {
  label: string;
  value: number | undefined;
  tint: string;
}) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color: tint }]}>
        {value === undefined ? "—" : value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  voiceCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    minHeight: 72,
  },
  voiceEmoji: { fontSize: 26 },
  voiceText: { flex: 1, gap: 2 },
  voiceTitle: { fontSize: fontSize.base, fontWeight: "800", color: colors.deep },
  voiceBody: { fontSize: fontSize.sm, color: colors.muted, lineHeight: 20 },
  voiceArrow: { fontSize: fontSize.lg, color: colors.primary, fontWeight: "800" },
  content: { paddingBottom: spacing.xxl, gap: spacing.lg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: spacing.sm,
  },
  headerText: { gap: 2 },
  greeting: { fontSize: fontSize.base, color: colors.muted },
  name: { fontSize: fontSize.xxl, fontWeight: "800", color: colors.deep },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.white, fontSize: fontSize.lg, fontWeight: "800" },

  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  ctaPressed: { opacity: 0.9 },
  ctaEmoji: { fontSize: 30 },
  ctaText: { flex: 1, gap: 2 },
  ctaTitle: { fontSize: fontSize.lg, fontWeight: "800", color: colors.white },
  ctaBody: { fontSize: fontSize.sm, color: "#DCEBFF" },
  ctaArrow: { fontSize: fontSize.xl, color: colors.white, fontWeight: "700" },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: "800", color: colors.deep },
  link: { fontSize: fontSize.sm, color: colors.primary, fontWeight: "700" },

  stats: { flexDirection: "row", gap: spacing.sm },
  stat: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    alignItems: "center",
    gap: 2,
  },
  statValue: { fontSize: fontSize.xl, fontWeight: "800" },
  statLabel: { fontSize: fontSize.xs, color: colors.muted, textAlign: "center" },

  list: { gap: spacing.sm },
  muted: { fontSize: fontSize.sm, color: colors.muted, lineHeight: 20 },
  emptyTitle: { fontSize: fontSize.base, fontWeight: "700", color: colors.text },

  assistant: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.mint,
    borderColor: "#A9E4D4",
  },
  assistantEmoji: { fontSize: 30 },
  assistantText: { flex: 1, gap: 2 },
  assistantTitle: { fontSize: fontSize.base, fontWeight: "800", color: colors.deep },
  askBtn: { paddingHorizontal: spacing.lg },
});
