/**
 * JAAL Companion consumer palette — friendly blue / white / mint.
 * Deliberately distinct from the investigator console's dark forensic theme.
 */
export const colors = {
  /** App background — soft sky blue. */
  background: "#EAF3FF",
  /** Secondary background — slightly deeper sky. */
  backgroundAlt: "#DCEBFF",
  /** Primary action blue. */
  primary: "#2878D7",
  /** Deep navy for headings / high-contrast text. */
  deep: "#12366F",
  white: "#FFFFFF",
  /** Translucent glass surface for cards. */
  glass: "#F5F9FF",
  /** Hairline borders. */
  border: "#C9DDF8",
  /** Mint accent — success / reassurance. */
  mint: "#BDEFE1",
  /** Teal accent — secondary emphasis / icons. */
  teal: "#159B78",
  /** Muted secondary text. */
  muted: "#60748F",
  /** Default body text. */
  text: "#102D5C",
  /** Warning / caution. */
  warning: "#B7791F",
  /** Danger / high concern. */
  danger: "#C53030",
} as const;

export type ColorName = keyof typeof colors;
