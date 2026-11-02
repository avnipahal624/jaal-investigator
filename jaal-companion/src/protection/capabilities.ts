/**
 * PLATFORM CAPABILITY DETECTION.
 *
 * Answers one question honestly: can THIS device, in THIS build, actually
 * provide a given protection capability? Every answer is derived from real
 * signals — the OS, whether the native module is linked, whether the build
 * has the config plugin compiled in, and the OS permission/role state. Nothing
 * here is assumed to be true because a screen exists.
 */

import Constants, { ExecutionEnvironment } from "expo-constants";
import { NativeModules, Platform } from "react-native";
import type { PlatformId, ProtectionCapability } from "./types";

export const platformId: PlatformId = (() => {
  switch (Platform.OS) {
    case "android":
      return "android";
    case "ios":
      return "ios";
    case "web":
      return "web";
    default:
      return "unknown";
  }
})();

/**
 * True when running inside a dev/EAS build rather than Expo Go. Config
 * plugins (expo-sharing's inbound share intent, our local native modules)
 * only exist in a prebuilt binary — in Expo Go they simply are not there, and
 * we must say so instead of pretending the feature works.
 */
export const isPrebuilt: boolean =
  Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

/** Look up an Expo local module by its registered native name. */
export function nativeModule(name: string): Record<string, any> | null {
  try {
    const mod = (NativeModules as Record<string, unknown>)[name];
    return (mod as Record<string, any>) ?? null;
  } catch {
    return null;
  }
}

/** Native module names registered by our local modules (see /modules). */
export const NATIVE = {
  callerScreening: "JaalCallerScreening",
  notificationReader: "JaalNotificationReader",
} as const;

export interface OsCapability {
  supported: boolean;
  /** Why, in plain language. Always truthful about the platform. */
  reason: string;
}

/**
 * Raw OS-level capability, independent of the user's JAAL switches.
 *
 * Android CallScreeningService needs a prebuilt binary (the service lives in
 * our manifest) plus the CALL_SCREENING role. iOS caller identification needs
 * a Call Directory app-extension target, which this build does not ship — so
 * iOS is honestly reported as unsupported here rather than simulated.
 */
export function osCallerScreening(): OsCapability {
  if (platformId === "android") {
    if (!isPrebuilt) {
      return {
        supported: false,
        reason:
          "Android call screening needs a development or store build. Expo Go cannot register the call-screening service.",
      };
    }
    if (!nativeModule(NATIVE.callerScreening)) {
      return {
        supported: false,
        reason:
          "The call-screening component is not installed in this build.",
      };
    }
    return {
      supported: true,
      reason:
        "Android's call screening service checks the number against JAAL before you answer. You stay in control — JAAL never answers or blocks for you.",
    };
  }

  if (platformId === "ios") {
    return {
      supported: false,
      reason:
        "iOS caller identification requires a Call Directory app extension, which this build does not include. Apple does not allow iOS apps to intercept or screen live calls.",
    };
  }

  return {
    supported: false,
    reason: "Call screening is only available on Android and iOS.",
  };
}

/**
 * Notification access. Android exposes an official notification-listener
 * service the user must enable in system settings. iOS offers no equivalent
 * for third-party apps, so it is reported as unsupported — iOS message
 * filtering only covers SMS, never WhatsApp, Instagram or other private apps.
 */
export function osNotificationAccess(): OsCapability {
  if (platformId === "android") {
    if (!isPrebuilt) {
      return {
        supported: false,
        reason:
          "Message protection needs a development or store build — notification access cannot be registered in Expo Go.",
      };
    }
    if (!nativeModule(NATIVE.notificationReader)) {
      return {
        supported: false,
        reason: "The message-protection component is not installed.",
      };
    }
    return {
      supported: true,
      reason:
        "JAAL can read a short snippet of incoming message notifications — only after you turn it on, and only from the apps you choose.",
    };
  }

  if (platformId === "ios") {
    return {
      supported: false,
      reason:
        "iOS does not give third-party apps access to notifications from WhatsApp, Instagram or other private apps. Only Apple's own SMS filtering is available, and this app does not use it.",
    };
  }

  return {
    supported: false,
    reason: "Message protection is only available on Android.",
  };
}

/** Share-to-JAAL relies on the expo-sharing inbound intent (prebuild only). */
export function osShareToJaal(): OsCapability {
  if (platformId === "web") {
    return {
      supported: false,
      reason: "Sharing into JAAL is not available in a web browser.",
    };
  }
  if (!isPrebuilt) {
    return {
      supported: false,
      reason:
        "Sharing into JAAL needs a development or store build. Expo Go does not include the share target.",
    };
  }
  return {
    supported: true,
    reason:
      "Share a message, link or screenshot from another app straight into JAAL to check it before you act.",
  };
}

/** Voice recording uses expo-audio — available on both native platforms. */
export function osVoiceRecording(): OsCapability {
  if (platformId === "web") {
    return {
      supported: false,
      reason: "Voice recording is not available in a web browser.",
    };
  }
  return {
    supported: true,
    reason:
      "You can record a suspicious call yourself and let JAAL analyse it. JAAL cannot listen to live calls — the OS does not allow that.",
  };
}

// ---------------------------------------------------------------------------
// Async OS permission/role state
// ---------------------------------------------------------------------------

export interface CallerScreeningStatus {
  available: boolean;
  /** True only when the CALL_SCREENING role is actually granted. */
  roleGranted: boolean;
  /** True only when the service reports itself active and enabled. */
  serviceEnabled: boolean;
}

/**
 * Read the real state of Android's call-screening role. Returns an honest
 * "not available" object whenever the native module or platform is missing —
 * it never reports enabled.
 */
export async function getCallerScreeningStatus(): Promise<CallerScreeningStatus> {
  const unavailable: CallerScreeningStatus = {
    available: false,
    roleGranted: false,
    serviceEnabled: false,
  };
  if (platformId !== "android" || !isPrebuilt) return unavailable;
  const mod = nativeModule(NATIVE.callerScreening);
  if (!mod || typeof mod.getStatus !== "function") return unavailable;
  try {
    const status = await mod.getStatus();
    return {
      available: status?.available !== false,
      roleGranted: status?.roleGranted === true,
      serviceEnabled: status?.serviceEnabled === true,
    };
  } catch {
    return unavailable;
  }
}

export interface NotificationAccessStatus {
  available: boolean;
  granted: boolean;
}

/** Read whether the user has granted Android notification-listener access. */
export async function getNotificationAccessStatus(): Promise<NotificationAccessStatus> {
  const unavailable: NotificationAccessStatus = {
    available: false,
    granted: false,
  };
  if (platformId !== "android" || !isPrebuilt) return unavailable;
  const mod = nativeModule(NATIVE.notificationReader);
  if (!mod || typeof mod.getStatus !== "function") return unavailable;
  try {
    const status = await mod.getStatus();
    return {
      available: status?.available !== false,
      granted: status?.granted === true,
    };
  } catch {
    return unavailable;
  }
}

/** Ask Android for the call-screening role (user is taken to the OS UI). */
export async function requestCallerScreeningRole(): Promise<boolean> {
  const mod = nativeModule(NATIVE.callerScreening);
  if (!mod || typeof mod.requestRole !== "function") return false;
  try {
    await mod.requestRole();
    return true;
  } catch {
    return false;
  }
}

/** Take the user to Android's notification-access settings. */
export async function openNotificationAccessSettings(): Promise<boolean> {
  const mod = nativeModule(NATIVE.notificationReader);
  if (!mod || typeof mod.openSettings !== "function") return false;
  try {
    await mod.openSettings();
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Composed capability state
// ---------------------------------------------------------------------------

export interface CapabilityInput {
  feature: ProtectionCapability["feature"];
  os: OsCapability;
  userEnabled: boolean;
  permissionGranted: boolean;
  setupAction: string;
  /** Explanation shown when the feature is on and working. */
  enabledExplanation: string;
  /** Explanation shown when the user simply has not turned it on yet. */
  disabledExplanation: string;
  /** Explanation shown when an OS permission/role is still missing. */
  permissionExplanation: string;
}

/** Derive the single state the UI should render from real inputs. */
export function composeCapability(input: CapabilityInput): ProtectionCapability {
  if (!input.os.supported) {
    return {
      feature: input.feature,
      state: "UNSUPPORTED",
      supportedByOs: false,
      permissionGranted: false,
      userEnabled: false,
      explanation: input.os.reason,
      setupAction: null,
    };
  }
  if (!input.userEnabled) {
    return {
      feature: input.feature,
      state: "DISABLED",
      supportedByOs: true,
      permissionGranted: input.permissionGranted,
      userEnabled: false,
      explanation: input.disabledExplanation,
      setupAction: input.setupAction,
    };
  }
  if (!input.permissionGranted) {
    return {
      feature: input.feature,
      state: "REQUIRES_PERMISSION",
      supportedByOs: true,
      permissionGranted: false,
      userEnabled: true,
      explanation: input.permissionExplanation,
      setupAction: input.setupAction,
    };
  }
  return {
    feature: input.feature,
    state: "ENABLED",
    supportedByOs: true,
    permissionGranted: true,
    userEnabled: true,
    explanation: input.enabledExplanation,
    setupAction: null,
  };
}
