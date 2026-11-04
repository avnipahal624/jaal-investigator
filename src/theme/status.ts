/**
 * JAAL status colors — the single source of truth.
 *
 * Every status surface (report stamps, evidence drawer, evidence board,
 * activity feed, panel chips, workspace engine chip) derives its colors from
 * the CSS variables emitted by this module. Screen (dark UI) and paper
 * (report/print) palettes are defined here; the print stylesheet remaps the
 * screen variables so PDF output follows the print table exactly.
 *
 * Status labels always carry text — color is never the only signal.
 */

export interface StatusColor {
  text: string;
  bg: string;
  border: string;
}

/** Screen palette — dark application surfaces. */
export const STATUS_SCREEN = {
  inv: {
    active: { text: "#39D6E8", bg: "#0B2933", border: "#1B8F91" },
    completed: { text: "#35C99A", bg: "#0B2B25", border: "#238B69" },
    archived: { text: "#91A4B2", bg: "#17232C", border: "#526574" },
  },
  engine: {
    claude: { text: "#39D6E8", bg: "#0B2933", border: "#1B8F91" },
    simulation: { text: "#FFAA45", bg: "#302314", border: "#A8732C" },
    error: { text: "#F15B64", bg: "#321B20", border: "#A83E49" },
  },
  integrity: {
    nothashed: { text: "#91A4B2", bg: "#17232C", border: "#526574" },
    generated: { text: "#FFAA45", bg: "#302314", border: "#A8732C" },
    verified: { text: "#35C99A", bg: "#0B2B25", border: "#238B69" },
    mismatch: { text: "#F15B64", bg: "#321B20", border: "#A83E49" },
    // Tamper simulation reuses the alert palette (same semantic family as a
    // mismatch — no new status color); the label carries the distinction.
    tampered: { text: "#F15B64", bg: "#321B20", border: "#A83E49" },
  },
  review: {
    needsreview: { text: "#FFAA45", bg: "#302314", border: "#A8732C" },
    confirmed: { text: "#35C99A", bg: "#0B2B25", border: "#238B69" },
    incorrect: { text: "#F15B64", bg: "#321B20", border: "#A83E49" },
  },
  /** Kill-chain stage states — existing stage semantics mapped onto the
   *  sanctioned palette: pending = neutral, active = caution amber,
   *  detected = cyan, completed = completed green. */
  stage: {
    pending: { text: "#91A4B2", bg: "#17232C", border: "#526574" },
    active: { text: "#FFAA45", bg: "#302314", border: "#A8732C" },
    detected: { text: "#39D6E8", bg: "#0B2933", border: "#1B8F91" },
    completed: { text: "#35C99A", bg: "#0B2B25", border: "#238B69" },
  },
  /** Runtime state of a case session — reuses ACTIVE/COMPLETED semantics. */
  run: {
    active: { text: "#39D6E8", bg: "#0B2933", border: "#1B8F91" },
    paused: { text: "#FFAA45", bg: "#302314", border: "#A8732C" },
    completed: { text: "#35C99A", bg: "#0B2B25", border: "#238B69" },
  },
} as const satisfies Record<string, Record<string, StatusColor>>;

/** Paper/print palette — report page and PDF output. Backgrounds are
 *  transparent: printing may disable background graphics, so ink and rules
 *  carry all meaning. */
export const STATUS_PAPER = {
  inv: {
    active: "#1B8F91",
    completed: "#238B69",
    archived: "#526574",
  },
  engine: {
    claude: "#1B8F91",
    simulation: "#A8732C",
    error: "#A83E49",
  },
  integrity: {
    nothashed: "#526574",
    generated: "#A8732C",
    verified: "#238B69",
    mismatch: "#A83E49",
    tampered: "#A83E49",
  },
  review: {
    needsreview: "#A8732C",
    confirmed: "#238B69",
    incorrect: "#A83E49",
  },
  stage: {
    pending: "#526574",
    active: "#A8732C",
    detected: "#1B8F91",
    completed: "#238B69",
  },
  run: {
    active: "#1B8F91",
    paused: "#A8732C",
    completed: "#238B69",
  },
} as const satisfies Record<string, Record<string, string>>;

/** Indicator-type accents — subtle icon/label/border accents only. These
 *  identify the kind of data, never its risk or validity. */
export const INDICATOR_ACCENT = {
  phone: "#39D6E8",
  upi: "#FFAA45",
  url: "#1B8F91",
  payment_request: "#D9A441",
  email: "#6CA6DF",
  account_id: "#91A4B2",
  other: "#91A4B2",
  // Non-identifier evidence kinds reuse the neutral accent.
  scam_message: "#91A4B2",
  transcript: "#91A4B2",
} as const satisfies Record<string, string>;

/** Raw integrity values (backend + frontend-normalized) → config key. */
const INTEGRITY_KEY: Record<string, keyof (typeof STATUS_SCREEN)["integrity"]> = {
  NOT_HASHED: "nothashed",
  HASH_GENERATED: "generated",
  INTEGRITY_VERIFIED: "verified",
  HASH_MISMATCH: "mismatch",
  TAMPER_SIMULATION: "tampered",
  none: "nothashed",
  generated: "generated",
  verified: "verified",
  mismatch: "mismatch",
  tampered: "tampered",
};

const REVIEW_KEY: Record<string, keyof (typeof STATUS_SCREEN)["review"]> = {
  confirmed: "confirmed",
  incorrect: "incorrect",
  needs_review: "needsreview",
};

const INV_KEY: Record<string, keyof (typeof STATUS_SCREEN)["inv"]> = {
  active: "active",
  completed: "completed",
  archived: "archived",
};

const ENGINE_KEY: Record<string, keyof (typeof STATUS_SCREEN)["engine"]> = {
  GROQ: "claude",
  ANTHROPIC: "claude",
  claude: "claude",
  SIMULATION: "simulation",
  simulation: "simulation",
  ERROR: "error",
  error: "error",
};

export function integrityKey(raw: string): keyof (typeof STATUS_SCREEN)["integrity"] {
  return INTEGRITY_KEY[raw] ?? "nothashed";
}
export function reviewKey(raw: string | null | undefined): keyof (typeof STATUS_SCREEN)["review"] | null {
  if (!raw) return null;
  return REVIEW_KEY[raw] ?? null;
}
export function invKey(raw: string): keyof (typeof STATUS_SCREEN)["inv"] {
  return INV_KEY[raw] ?? "archived";
}
export function engineKey(raw: string): keyof (typeof STATUS_SCREEN)["engine"] {
  return ENGINE_KEY[raw] ?? "simulation";
}

/**
 * True when a strategy/summary came from a model rather than the rules engine.
 * `GROQ` is the current label; `ANTHROPIC` is accepted only so records written
 * before the provider migration still display as AI-assisted.
 */
export function isAiEngine(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const key = raw.trim().toUpperCase();
  return key === "GROQ" || key === "ANTHROPIC" || key === "CLAUDE";
}
/** Kill-chain stage status → config key (identity, with a safe fallback). */
export function stageStatusKey(
  raw: string,
): keyof (typeof STATUS_SCREEN)["stage"] {
  return raw in STATUS_SCREEN.stage
    ? (raw as keyof (typeof STATUS_SCREEN)["stage"])
    : "pending";
}
/** Run status → config key (`running` maps to the ACTIVE chip). */
export function runStatusKey(
  raw: string,
): keyof (typeof STATUS_SCREEN)["run"] {
  if (raw === "running" || raw === "active") return "active";
  if (raw === "paused") return "paused";
  return "completed";
}

/** Activity-feed event kind → text color (single source: status text hexes). */
export const ACTIVITY_TEXT = {
  case_started: STATUS_SCREEN.inv.active.text,
  message: STATUS_SCREEN.inv.archived.text, // neutral
  identifier_extracted: STATUS_SCREEN.inv.active.text,
  tactic_detected: STATUS_SCREEN.engine.simulation.text,
  hash_generated: STATUS_SCREEN.integrity.generated.text,
  stage_advanced: STATUS_SCREEN.stage.active.text,
  report_created: STATUS_SCREEN.inv.completed.text,
  integrity_verified: STATUS_SCREEN.integrity.verified.text,
  integrity_mismatch: STATUS_SCREEN.integrity.mismatch.text,
  evidence_reviewed: STATUS_SCREEN.review.confirmed.text,
  correlation: STATUS_SCREEN.review.confirmed.text,
  ai_analysis: STATUS_SCREEN.engine.claude.text,
} as const satisfies Record<string, string>;

/** Activity kind → text color hex (use via inline style; unknown kinds fall
 *  back to neutral). */
export function activityColor(kind: string): string {
  return ACTIVITY_TEXT[kind as keyof typeof ACTIVITY_TEXT] ??
    STATUS_SCREEN.inv.archived.text;
}

/** Inline style for a status on a dark UI surface. Pair with a `border` class. */
export function statusStyle(
  group: keyof typeof STATUS_SCREEN,
  key: string,
): { color: string; backgroundColor: string; borderColor: string } {
  return {
    color: `var(--st-${group}-${key}-text)`,
    backgroundColor: `var(--st-${group}-${key}-bg)`,
    borderColor: `var(--st-${group}-${key}-border)`,
  };
}

/** Inline style for a status on the paper report (print palette). */
export function paperStyle(
  group: keyof typeof STATUS_PAPER,
  key: string,
): { color: string; borderColor: string } {
  return {
    color: `var(--stp-${group}-${key}-text)`,
    borderColor: `var(--stp-${group}-${key}-border)`,
  };
}

/** Subtle indicator-type accent (icon / label / left-border color). */
export function indicatorAccent(type: string): string {
  return INDICATOR_ACCENT[type as keyof typeof INDICATOR_ACCENT] ?? INDICATOR_ACCENT.other;
}

/** Text-only color for bare (non-chip) status labels. */
export function statusTextColor(
  group: keyof typeof STATUS_SCREEN,
  key: string,
): { color: string } {
  return { color: `var(--st-${group}-${key}-text)` };
}

/** Dot fill for compact status indicators (inline background). */
export function statusDot(group: keyof typeof STATUS_SCREEN, key: string): string {
  return `var(--st-${group}-${key}-text)`;
}

function emitScreenVars(): string {
  const lines: string[] = [];
  for (const [group, entries] of Object.entries(STATUS_SCREEN)) {
    for (const [key, c] of Object.entries(entries)) {
      lines.push(`--st-${group}-${key}-text:${c.text}`);
      lines.push(`--st-${group}-${key}-bg:${c.bg}`);
      lines.push(`--st-${group}-${key}-border:${c.border}`);
    }
  }
  return lines.join(";");
}

function emitPaperVars(): string {
  const lines: string[] = [];
  for (const [group, entries] of Object.entries(STATUS_PAPER)) {
    for (const [key, hex] of Object.entries(entries)) {
      lines.push(`--stp-${group}-${key}-text:${hex}`);
      lines.push(`--stp-${group}-${key}-bg:transparent`);
      lines.push(`--stp-${group}-${key}-border:${hex}`);
    }
  }
  return lines.join(";");
}

function emitPrintOverrides(): string {
  const lines: string[] = [];
  for (const [group, entries] of Object.entries(STATUS_PAPER)) {
    for (const [key, hex] of Object.entries(entries)) {
      lines.push(`--st-${group}-${key}-text:${hex}`);
      lines.push(`--st-${group}-${key}-bg:transparent`);
      lines.push(`--st-${group}-${key}-border:${hex}`);
    }
  }
  return lines.join(";");
}

function emitIndicatorVars(): string {
  return Object.entries(INDICATOR_ACCENT)
    .map(([type, hex]) => `--st-ind-${type}:${hex}`)
    .join(";");
}

/**
 * Emitted once into the document (AppShell). Screen vars flip to the paper
 * palette inside @media print; --stp-* vars are the paper palette everywhere
 * (the report page is paper on screen and on paper).
 */
export const STATUS_COLOR_CSS = `
:root{${emitScreenVars()};${emitIndicatorVars()}}
:root{${emitPaperVars()}}
@media print{:root{${emitPrintOverrides()}}}
`;
