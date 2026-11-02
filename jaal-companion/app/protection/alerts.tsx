import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Card } from "../../src/components/ui/Card";
import { Screen } from "../../src/components/ui/Screen";
import { formatDate } from "../../src/utils/format";
import {
  useMarkAllAlertsRead,
  useMarkAlertRead,
  useProtectionAlerts,
  useUnreadAlertCount,
} from "../../src/protection/threatIntel";
import type { ThreatAlert } from "../../src/protection/types";
import { colors, fontSize, spacing } from "../../src/theme";

const KIND_ICON: Record<string, string> = {
  caller: "📞",
  message: "💬",
  link: "🔗",
  analysis: "🎙️",
  report: "📄",
};

/**
 * Colour + wording that keeps AI assessments visually separate from actual
 * threat-intelligence matches — a model output must never look like a
 * confirmed indicator hit.
 */
function originBadge(alert: ThreatAlert) {
  if (alert.origin === "THREAT_INTEL") {
    return { label: "Threat intel match", tone: colors.teal ?? "#159B78" };
  }
  return { label: "AI assessment", tone: colors.primary };
}

/** Protection alert history — what JAAL raised, why, and what to do next. */
export default function AlertsScreen() {
  const router = useRouter();
  const alerts = useProtectionAlerts(50);
  const unread = useUnreadAlertCount();
  const markRead = useMarkAlertRead();
  const markAllRead = useMarkAllAlertsRead();

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Alerts</Text>
          {unread ? <Text style={styles.unread}>{unread} new</Text> : null}
        </View>
        <Text style={styles.subtitle}>
          What JAAL found, the evidence behind it, and what you can safely do
          next.
        </Text>
        {alerts && alerts.length > 0 && unread ? (
          <Pressable
            onPress={() => void markAllRead()}
            style={styles.markAll}
            hitSlop={8}
          >
            <Text style={styles.markAllText}>Mark all as read</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      >
        {alerts === undefined ? (
          <Text style={styles.empty}>Loading alerts…</Text>
        ) : alerts.length === 0 ? (
          <Card style={styles.card}>
            <Text style={styles.icon}>🛡️</Text>
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>No alerts yet</Text>
              <Text style={styles.text}>
                JAAL raises an alert when a number or link you check matches
                threat intelligence, when an analysis finishes, or when a
                report needs more information from you.
              </Text>
            </View>
          </Card>
        ) : (
          alerts.map((alert) => {
            const badge = originBadge(alert);
            return (
              <Pressable
                key={alert._id}
                onPress={() => void markRead({ alertId: alert._id })}
                style={({ pressed }) => [
                  styles.card,
                  pressed && styles.cardPressed,
                ]}
              >
                <Card style={styles.cardInner}>
                  <Text style={styles.icon}>{KIND_ICON[alert.kind] ?? "🛡️"}</Text>
                  <View style={styles.cardBody}>
                    <View style={styles.badgeRow}>
                      <View
                        style={[styles.badge, { backgroundColor: badge.tone }]}
                      >
                        <Text style={styles.badgeText}>{badge.label}</Text>
                      </View>
                      {!alert.read ? <Text style={styles.dot}>• New</Text> : null}
                    </View>

                    <Text style={styles.cardTitle}>{alert.title}</Text>
                    <Text style={styles.text}>{alert.explanation}</Text>

                    <Text style={styles.label}>Evidence</Text>
                    <Text style={styles.evidence}>{alert.evidence}</Text>

                    <Text style={styles.label}>What you can do</Text>
                    <Text style={styles.text}>{alert.recommendedAction}</Text>

                    <Text style={styles.time}>
                      {formatDate(alert.createdAt)}
                    </Text>
                  </View>
                </Card>
              </Pressable>
            );
          })
        )}

        <Pressable onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>Back to Protection</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    gap: 4,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { fontSize: fontSize.xxl, fontWeight: "800", color: colors.deep },
  unread: {
    fontSize: fontSize.xs,
    fontWeight: "700",
    color: colors.white,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: "hidden",
  },
  subtitle: { fontSize: fontSize.sm, color: colors.muted, lineHeight: 20 },
  markAll: { marginTop: 6, alignSelf: "flex-start" },
  markAllText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
  list: { paddingHorizontal: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxl },
  empty: { fontSize: fontSize.sm, color: colors.muted, textAlign: "center" },
  card: { gap: 0 },
  cardInner: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  cardPressed: { opacity: 0.7 },
  icon: { fontSize: 24 },
  cardBody: { flex: 1, gap: 4 },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: 999,
  },
  badgeText: { fontSize: 10, fontWeight: "800", color: colors.white },
  dot: { fontSize: fontSize.xs, color: colors.primary, fontWeight: "700" },
  cardTitle: { fontSize: fontSize.base, fontWeight: "700", color: colors.text },
  label: {
    fontSize: fontSize.xs,
    fontWeight: "800",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 6,
  },
  evidence: {
    fontSize: fontSize.sm,
    color: colors.text,
    backgroundColor: colors.glass ?? "#F5F9FF",
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: spacing.sm,
    lineHeight: 20,
  },
  text: { fontSize: fontSize.sm, color: colors.muted, lineHeight: 21 },
  time: { fontSize: fontSize.xs, color: colors.muted, marginTop: 6 },
  back: { alignItems: "center", paddingVertical: spacing.md },
  backText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: "700" },
});
