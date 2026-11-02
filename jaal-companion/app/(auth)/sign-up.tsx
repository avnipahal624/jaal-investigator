import { Link } from "expo-router";
import { ScrollView, StyleSheet, Text } from "react-native";
import { Screen } from "../../src/components/ui/Screen";
import { EmailOtpForm } from "../../src/features/auth/EmailOtpForm";
import { colors, fontSize, spacing } from "../../src/theme";

/** Create-account screen — same email + one-time code flow. */
export default function SignUp() {
  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Create your account</Text>
        <Text style={styles.subtitle}>
          Use your email — we’ll send a code, no password required.
        </Text>
        <EmailOtpForm mode="sign-up" />
        <Text style={styles.footer}>
          Already have an account?{" "}
          <Link href="/(auth)/sign-in" style={styles.link}>
            Sign in
          </Link>
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.xxl, gap: spacing.lg, paddingBottom: spacing.xxl },
  title: { fontSize: fontSize.xxl, fontWeight: "800", color: colors.deep },
  subtitle: { fontSize: fontSize.base, color: colors.muted, lineHeight: 24 },
  footer: { fontSize: fontSize.base, color: colors.muted, textAlign: "center" },
  link: { color: colors.primary, fontWeight: "700" },
});
