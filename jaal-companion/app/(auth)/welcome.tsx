import { router } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Button } from "../../src/components/ui/Button";
import { Screen } from "../../src/components/ui/Screen";
import { useAuth } from "../../src/hooks/use-auth";
import { colors, fontSize, radius, spacing } from "../../src/theme";

const FEATURES = [
  {
    title: "Check a message or link",
    body: "Paste something suspicious and get a plain-language explanation — before you reply.",
  },
  {
    title: "Record it",
    body: "Capture a suspicious call or voice note and let JAAL look at it.",
  },
  {
    title: "Ask JAAL",
    body: "A safety assistant that answers in real language, not canned scripts.",
  },
];

/** Landing / welcome screen for signed-out users. */
export default function Welcome() {
  const { signIn } = useAuth();

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brand}>
          <View style={styles.mark}>
            <Text style={styles.markText}>J</Text>
          </View>
          <Text style={styles.title}>JAAL Companion</Text>
          <Text style={styles.subtitle}>
            Your friendly safety companion. Understand suspicious messages, links, and
            calls — and know what to do next.
          </Text>
        </View>

        <View style={styles.features}>
          {FEATURES.map((f) => (
            <View key={f.title} style={styles.feature}>
              <View style={styles.dot} />
              <View style={styles.featureText}>
                <Text style={styles.featureTitle}>{f.title}</Text>
                <Text style={styles.featureBody}>{f.body}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.actions}>
          <Button label="Get started" onPress={() => router.push("/(auth)/sign-up")} />
          <Button
            label="I already have an account"
            variant="secondary"
            onPress={() => router.push("/(auth)/sign-in")}
          />
          <Button
            label="Continue as guest"
            variant="ghost"
            onPress={() => {
              void signIn("anonymous", {});
            }}
          />
          <Text style={styles.disclaimer}>
            JAAL gives safety information, not legal advice.
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.xxl, paddingBottom: spacing.xxl, gap: spacing.xl },
  brand: { alignItems: "center", gap: spacing.sm },
  mark: {
    width: 72,
    height: 72,
    borderRadius: radius.xl,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  markText: { color: colors.white, fontSize: 40, fontWeight: "800" },
  title: { fontSize: fontSize.xxxl, fontWeight: "800", color: colors.deep },
  subtitle: {
    fontSize: fontSize.base,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 24,
    paddingHorizontal: spacing.sm,
  },
  features: { gap: spacing.lg },
  feature: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.teal,
    marginTop: 7,
  },
  featureText: { flex: 1, gap: 2 },
  featureTitle: { fontSize: fontSize.base, fontWeight: "700", color: colors.text },
  featureBody: { fontSize: fontSize.sm, color: colors.muted, lineHeight: 20 },
  actions: { gap: spacing.md },
  disclaimer: {
    fontSize: fontSize.xs,
    color: colors.muted,
    textAlign: "center",
    marginTop: spacing.xs,
  },
});
