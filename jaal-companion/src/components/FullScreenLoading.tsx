import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { colors, fontSize, spacing } from "../theme";

/** Full-screen spinner shown while the auth session is restoring. */
export function FullScreenLoading({ message = "Loading…" }: { message?: string }) {
  return (
    <View style={styles.root}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  text: { fontSize: fontSize.base, color: colors.muted },
});
