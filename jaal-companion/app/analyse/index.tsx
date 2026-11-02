import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Screen } from "../../src/components/ui/Screen";
import { colors, fontSize, radius, spacing } from "../../src/theme";

const OPTIONS = [
  {
    route: "/analyse/text" as const,
    emoji: "✉️",
    title: "Check a message",
    body: "Paste a suspicious SMS, chat, or email and get a plain-language assessment.",
  },
  {
    route: "/analyse/link" as const,
    emoji: "🔗",
    title: "Check a link",
    body: "Paste a URL to review its domain and structure. We never open it for you.",
  },
  {
    route: "/analyse/recording" as const,
    emoji: "🎤",
    title: "Record a call",
    body: "Upload a suspicious call recording (with your consent) for review.",
  },
];

/** Choose what to analyse. */
export default function AnalyseIndex() {
  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Analyse something</Text>
        <Text style={styles.subtitle}>
          Pick what you have. We’ll look at the actual content you provide.
        </Text>

        {OPTIONS.map((o) => (
          <Pressable
            key={o.route}
            onPress={() => router.push(o.route)}
            accessibilityRole="button"
            accessibilityLabel={o.title}
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
          >
            <Text style={styles.emoji}>{o.emoji}</Text>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>{o.title}</Text>
              <Text style={styles.cardBody}>{o.body}</Text>
            </View>
            <Text style={styles.arrow}>→</Text>
          </Pressable>
        ))}

        <Text style={styles.note}>
          JAAL gives safety information, not legal advice.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.sm, gap: spacing.lg, paddingBottom: spacing.xxl },
  title: { fontSize: fontSize.xxl, fontWeight: "800", color: colors.deep },
  subtitle: { fontSize: fontSize.base, color: colors.muted, lineHeight: 24 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  pressed: { opacity: 0.85 },
  emoji: { fontSize: 30 },
  cardText: { flex: 1, gap: 4 },
  cardTitle: { fontSize: fontSize.lg, fontWeight: "800", color: colors.text },
  cardBody: { fontSize: fontSize.sm, color: colors.muted, lineHeight: 20 },
  arrow: { fontSize: fontSize.xl, color: colors.primary, fontWeight: "700" },
  note: { fontSize: fontSize.xs, color: colors.muted, textAlign: "center" },
});
