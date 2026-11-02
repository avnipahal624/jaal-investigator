import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Card } from "../../src/components/ui/Card";
import { Screen } from "../../src/components/ui/Screen";
import { colors, fontSize, spacing } from "../../src/theme";

const TIPS = [
  {
    emoji: "💳",
    title: "Never share OTPs or PINs",
    body: "No bank, government office, or company will ever ask for your OTP, CVV, or UPI PIN. If someone does, it’s a scam.",
  },
  {
    emoji: "🔗",
    title: "Don’t tap unknown links",
    body: "Check a link with JAAL before opening it. Scam links often look almost right but have a wrong or unusual address.",
  },
  {
    emoji: "🤝",
    title: "Verify unexpected requests",
    body: "If a friend, family member, or company asks for money or details unexpectedly, confirm through a different channel you already trust.",
  },
  {
    emoji: "🎤",
    title: "Record suspicious calls",
    body: "If a call feels off, record it and let JAAL listen. The voice and words people use are strong signals.",
  },
  {
    emoji: "⏸️",
    title: "Slow down under pressure",
    body: "Scammers create urgency — “act now”, “your account will close”. Legitimate organisations give you time. Pause and check.",
  },
  {
    emoji: "🚫",
    title: "It’s okay to say no",
    body: "You can hang up, delete, or ignore any request. You never owe anyone your money or information.",
  },
];

/** Protection tab — practical safety guidance. */
export default function Protection() {
  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <Text style={styles.title}>Stay protected</Text>
        <Text style={styles.subtitle}>
          Simple habits that stop most scams before they start.
        </Text>
      </View>
      <ScrollView
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      >
        {TIPS.map((t) => (
          <Card key={t.title} style={styles.card}>
            <Text style={styles.emoji}>{t.emoji}</Text>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>{t.title}</Text>
              <Text style={styles.cardBody}>{t.body}</Text>
            </View>
          </Card>
        ))}
        <Text style={styles.disclaimer}>
          JAAL provides safety information to help you decide. It is not legal
          advice, and reporting through JAAL does not guarantee recovery or any
          particular outcome.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.xl,
    gap: 2,
  },
  title: { fontSize: fontSize.xxl, fontWeight: "800", color: colors.deep },
  subtitle: { fontSize: fontSize.sm, color: colors.muted, lineHeight: 20 },
  list: {
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  card: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  emoji: { fontSize: 26 },
  cardText: { flex: 1, gap: 4 },
  cardTitle: { fontSize: fontSize.base, fontWeight: "700", color: colors.text },
  cardBody: { fontSize: fontSize.sm, color: colors.muted, lineHeight: 21 },
  disclaimer: {
    fontSize: fontSize.xs,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 18,
    marginTop: spacing.sm,
  },
});
