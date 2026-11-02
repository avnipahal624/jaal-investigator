/**
 * SHARED PROTECTION INTERFACES.
 *
 * One contract for every proactive-protection capability so the Android and
 * iOS implementations can be swapped behind the same API without pretending
 * the two platforms have identical native abilities. The app always renders
 * the *actual* platform status from `ProtectionCapability` — never an assumed
 * one — so a feature the OS cannot provide is shown as `UNSUPPORTED` rather
 * than being faked.
 */

export type PlatformId = "android" | "ios" | "web" | "unknown";

/**
 * Real, observable state of a protection feature.
 *
 *  ENABLED            — user turned it on AND the OS capability is configured
 *  DISABLED           — supported, but the user has it switched off
 *  REQUIRES_SETUP     — supported, needs a one-time setup step
 *  REQUIRES_PERMISSION— supported, needs an OS permission/role the user grants
 *  UNSUPPORTED        — this platform/build cannot provide the capability
 *  UNKNOWN            — not yet determined (loading, or native module missing)
 */
export type CapabilityState =
  | "ENABLED"
  | "DISABLED"
  | "REQUIRES_SETUP"
  | "REQUIRES_PERMISSION"
  | "UNSUPPORTED"
  | "UNKNOWN";

export type ProtectionFeature =
  | "caller"
  | "messages"
  | "links"
  | "shareToJaal"
  | "voice";

/** Status of one protection feature as reported by the device. */
export interface ProtectionCapability {
  feature: ProtectionFeature;
  state: CapabilityState;
  /** True only when the OS itself can provide this capability here. */
  supportedByOs: boolean;
  /** True only when the required OS permission/role is actually granted. */
  permissionGranted: boolean;
  /** The user's JAAL-side switch for this feature. */
  userEnabled: boolean;
  /** Plain-language, platform-specific explanation of the real state. */
  explanation: string;
  /** What the user can do next, or null when there is nothing to configure. */
  setupAction: string | null;
}

// ---------------------------------------------------------------------------
// Caller intelligence
// ---------------------------------------------------------------------------

export type CallerRisk =
  /** No record in JAAL threat intelligence — NOT a claim that the caller is safe. */
  | "NO_RECORD"
  /** One or more JAAL users reported this number (unverified). */
  | "USER_REPORTED"
  /** A JAAL investigator confirmed this indicator. */
  | "VERIFIED_SUSPICIOUS"
  /** The number belongs to the user's own contacts — never flagged. */
  | "KNOWN_CONTACT"
  /** The lookup did not run (offline, unavailable, rate-limited). */
  | "UNKNOWN";

/** Result of checking one number against JAAL threat intelligence. */
export interface CallerIntelligence {
  /** The number as the OS supplied it. */
  number: string;
  /** Canonical key that was actually looked up (null if it could not be read). */
  normalizedNumber: string | null;
  risk: CallerRisk;
  /** Short, human-readable reason — empty when there is no record. */
  reason: string;
  /** Provenance of the finding: user report vs investigator-confirmed. */
  provenance: "USER_REPORTED" | "VERIFIED" | null;
  /** How many distinct JAAL accounts reported it (0 when none/verified). */
  reporterCount: number;
  /** When the record was last updated (epoch ms), or null. */
  lastUpdatedAt: number | null;
  /** Whether this number also appears in the user's own submitted reports. */
  inMyReports: boolean;
  /** True when the caller is an unsaved/unknown number (never "suspicious"). */
  isUnknownNumber: boolean;
  /** Honest caveat shown with the result. */
  notice: string;
}

// ---------------------------------------------------------------------------
// Notification / message intelligence
// ---------------------------------------------------------------------------

/** What the notification integration is allowed to see. */
export interface NotificationAccessScope {
  /** Packages the feature is allowed to read (allow-list, never all apps). */
  packages: string[];
  /** Maximum characters of a notification body that may be read. */
  maxChars: number;
  /** Whether anything is persisted on the device before consent. */
  persistsContent: boolean;
}

export interface NotificationIntelligence {
  /** True when the OS granted notification-listener access. */
  accessGranted: boolean;
  scope: NotificationAccessScope;
  /** Rule-based, on-device match made WITHOUT sending anything anywhere. */
  localMatch: boolean;
  /** Which local rule fired (e.g. "payment_request"), empty when none. */
  localRule: string;
  /**
   * Set only after the user consented to AI processing AND the content was
   * submitted. Never populated silently.
   */
  aiAssessment: string | null;
  /** Honest note about what was and was not examined. */
  notice: string;
}

// ---------------------------------------------------------------------------
// Link intelligence
// ---------------------------------------------------------------------------

export type LinkVerdict =
  | "SAFE_LOOKING"
  | "SUSPICIOUS"
  | "KNOWN_INDICATOR"
  | "INVALID"
  | "UNAVAILABLE";

export interface LinkIntelligence {
  /** The URL exactly as provided — never opened, fetched or resolved. */
  raw: string;
  /** Canonical key checked against threat intelligence (null when invalid). */
  normalized: string | null;
  host: string;
  verdict: LinkVerdict;
  /** Deterministic, string-only warning signs found in the URL itself. */
  localFlags: { label: string; level: "LOW" | "MEDIUM" | "HIGH" }[];
  /** Threat-intelligence match provenance, when there is one. */
  provenance: "USER_REPORTED" | "VERIFIED" | null;
  reason: string;
  /** True only when a *known indicator* was matched (not a heuristic). */
  matchedThreatIntel: boolean;
  /** AI assessment — only present when the user consented to AI processing. */
  aiSummary: string | null;
  /** Always true: JAAL never opened this URL. */
  neverOpened: boolean;
  notice: string;
}

// ---------------------------------------------------------------------------
// Settings + alerts
// ---------------------------------------------------------------------------

export interface ProtectionSettings {
  callerProtection: boolean;
  messageProtection: boolean;
  linkProtection: boolean;
  aiProcessing: boolean;
  alertNotifications: boolean;
  shareToJaal: boolean;
}

export type AlertKind = "caller" | "message" | "link" | "analysis" | "report";

/**
 * A raised security finding. `origin` is the honesty switch: `THREAT_INTEL`
 * means a stored indicator actually matched, `AI_ANALYSIS` means a model
 * produced an assessment. The UI must never blur the two.
 */
export interface ThreatAlert {
  _id: string;
  kind: AlertKind;
  title: string;
  explanation: string;
  evidence: string;
  recommendedAction: string;
  origin: "THREAT_INTEL" | "AI_ANALYSIS";
  indicatorType?: string;
  read: boolean;
  createdAt: number;
}
