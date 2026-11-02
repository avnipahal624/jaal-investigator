import { Link } from "expo-router";
import { ScrollView, StyleSheet, Text } from "react-native";
import { Screen } from "../../src/components/ui/Screen";
import { EmailOtpForm } from "../../src/features/auth/EmailOtpForm";
import { colors, fontSize, spacing } from "../../src/theme";

/** Sign-in screen — email + one-time code. */
export default function SignIn() {
  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Sign in to your JAAL account.</Text>
        <EmailOtpForm mode="sign-in" />
        <Text style={styles.footer}>
          New here?{" "}
          <Link href="/(auth)/sign-up" style={styles.link}>
            Create an account
          </Link>
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.xxl, gap: spacing.lg, paddingBottom: spacing.xxl },
  title: { fontSize: fontSize.xxl, fontWeight: "800", color: colors.deep },
  subtitle: { fontSize: fontSize.base, color: colors.muted },
  footer: { fontSize: fontSize.base, color: colors.muted, textAlign: "center" },
  link: { color: colors.primary, fontWeight: "700" },
});
