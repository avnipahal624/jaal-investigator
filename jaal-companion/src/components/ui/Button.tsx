import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type ViewStyle,
} from "react-native";
import { colors, fontSize, radius, MIN_TOUCH_TARGET } from "../../theme";

type Variant = "primary" | "secondary" | "ghost" | "danger";

/**
 * The app's single button. Meets the 48px minimum touch target, exposes a
 * clear pressed/disabled state, and keeps body text at >= 16px.
 */
export function Button({
  label,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const isDisabled = disabled || loading;
  const palette = VARIANTS[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      accessibilityLabel={label}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: palette.bg, borderColor: palette.border },
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.text} />
      ) : (
        <Text style={[styles.label, { color: palette.text }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const VARIANTS: Record<Variant, { bg: string; text: string; border: string }> = {
  primary: { bg: colors.primary, text: colors.white, border: colors.primary },
  secondary: { bg: colors.white, text: colors.deep, border: colors.border },
  ghost: { bg: "transparent", text: colors.primary, border: "transparent" },
  danger: { bg: colors.white, text: colors.danger, border: colors.border },
};

const styles = StyleSheet.create({
  base: {
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    fontSize: fontSize.base,
    fontWeight: "600",
  },
});
