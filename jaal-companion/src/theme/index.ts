import { colors } from "./colors";

export { colors };

/** 4pt spacing scale. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/** Rounded-corner scale — friendly, rounded cards. */
export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

/** Type scale — body text stays >= 16px for readability. */
export const fontSize = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 22,
  xxl: 28,
  xxxl: 34,
} as const;

/** Minimum touch target for accessibility. */
export const MIN_TOUCH_TARGET = 48;

export const theme = { colors, spacing, radius, fontSize, MIN_TOUCH_TARGET } as const;
