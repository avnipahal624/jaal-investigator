import { router } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Button } from "../../src/components/ui/Button";
import { Card } from "../../src/components/ui/Card";
import { Screen } from "../../src/components/ui/Screen";
import { useAuth } from "../../src/hooks/use-auth";
import { colors, fontSize, spacing } from "../../src/theme";

function initials(label: string): string {
  return label.trim().charAt(0).toUpperCase() || "?";
}

/** Profile tab — account details and sign out. */
export default function Profile() {
  const { user, signOut } = useAuth();

  const email = user?.email ?? null;
  const displayName = user?.name ?? email ?? "Signed in";
  const isGuest = !email;

  async function handleSignOut() {
    await signOut();
    router.replace("/(auth)/welcome");
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(displayName)}</Text>
          </View>
          <Text style={styles.name}>{displayName}</Text>
          <Text style={styles.role}>
            {isGuest ? "Guest session" : "JAAL account"}
          </Text>
        </View>

        <Card>
          <Text style={styles.sectionTitle}>Account</Text>
          <Row label="Email" value={email ?? "Not signed in with email"} />
          <Row label="Access" value="Consumer (Normal People)" />
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>About JAAL Companion</Text>
          <Text style={styles.body}>
            JAAL Companion helps you understand suspicious messages, links, and
            calls, and submit reports to the JAAL investigator team.
          </Text>
          <Text style={styles.body}>
            JAAL provides safety information, not legal advice. Submitting a
            report stores it for investigator review — it does not file a police
            complaint or guarantee recovery.
          </Text>
        </Card>

        <Button label="Sign out" variant="danger" onPress={handleSignOut} />
      </ScrollView>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingBottom: spacing.xxl },
  header: { alignItems: "center", gap: spacing.xs, paddingVertical: spacing.lg },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.white, fontSize: fontSize.xxl, fontWeight: "800" },
  name: { fontSize: fontSize.xl, fontWeight: "800", color: colors.deep },
  role: { fontSize: fontSize.sm, color: colors.muted },
  sectionTitle: {
    fontSize: fontSize.base,
    fontWeight: "800",
    color: colors.deep,
    marginBottom: spacing.xs,
  },
  body: { fontSize: fontSize.sm, color: colors.muted, lineHeight: 21 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  rowLabel: { fontSize: fontSize.sm, color: colors.muted },
  rowValue: { fontSize: fontSize.sm, color: colors.text, fontWeight: "600", flexShrink: 1, textAlign: "right" },
});
