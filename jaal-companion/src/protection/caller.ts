/**
 * CALLER-INTELLIGENCE SERVICE.
 *
 * A single interface both platforms implement, so caller checks always go
 * through the same JAAL backend intelligence regardless of what the OS can
 * actually do. The two implementations deliberately do NOT claim parity: the
 * iOS implementation reports itself unsupported (this build ships no Call
 * Directory extension) instead of pretending otherwise.
 */

import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import { api } from "../services/api";
import { useMutation, useQuery } from "convex/react";
import {
  composeCapability,
  getCallerScreeningStatus,
  nativeModule,
  NATIVE,
  osCallerScreening,
  platformId,
  type CallerScreeningStatus,
} from "./capabilities";
import {
  checkCallerIntelligence,
  useProtectionSettings,
  type LookupFn,
} from "./threatIntel";
import type {
  CapabilityState,
  ProtectionCapability,
} from "./types";
import type { CallerIntelligence } from "./types";

export interface ScreeningPolicy {
  /** Reject investigator-verified numbers. Off unless the user turns it on. */
  autoRejectVerified: boolean;
  warnNotifications: boolean;
  screeningLog: boolean;
}

export interface ScreenedCall {
  number: string;
  normalized: string;
  provenance: string;
  reason: string;
  at: number;
}

/** Platform-specific mechanics behind one shared contract. */
export interface CallerPlatform {
  readonly id: "android" | "ios" | "unsupported";
  getStatus(): Promise<CallerScreeningStatus>;
  requestRole(): Promise<boolean>;
  syncWatchlist(indicators: unknown[]): Promise<boolean>;
  setPolicy(policy: ScreeningPolicy): Promise<boolean>;
  getScreenedLog(): Promise<ScreenedCall[]>;
  clearScreenedLog(): Promise<boolean>;
}

const UNAVAILABLE_STATUS: CallerScreeningStatus = {
  available: false,
  roleGranted: false,
  serviceEnabled: false,
};

const androidPlatform: CallerPlatform = {
  id: "android",
  getStatus: getCallerScreeningStatus,
  async requestRole() {
    const mod = nativeModule(NATIVE.callerScreening);
    if (!mod || typeof mod.requestRole !== "function") return false;
    try {
      return (await mod.requestRole()) === true;
    } catch {
      return false;
    }
  },
  async syncWatchlist(indicators) {
    const mod = nativeModule(NATIVE.callerScreening);
    if (!mod || typeof mod.syncIndicators !== "function") return false;
    try {
      mod.syncIndicators(JSON.stringify(indicators));
      return true;
    } catch {
      return false;
    }
  },
  async setPolicy(policy) {
    const mod = nativeModule(NATIVE.callerScreening);
    if (!mod || typeof mod.setPolicy !== "function") return false;
    try {
      mod.setPolicy(JSON.stringify(policy));
      return true;
    } catch {
      return false;
    }
  },
  async getScreenedLog() {
    const mod = nativeModule(NATIVE.callerScreening);
    if (!mod || typeof mod.getScreenedLog !== "function") return [];
    try {
      const raw = await mod.getScreenedLog();
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      return Array.isArray(parsed) ? (parsed as ScreenedCall[]) : [];
    } catch {
      return [];
    }
  },
  async clearScreenedLog() {
    const mod = nativeModule(NATIVE.callerScreening);
    if (!mod || typeof mod.clearScreenedLog !== "function") return false;
    try {
      return (await mod.clearScreenedLog()) === true;
    } catch {
      return false;
    }
  },
};

/**
 * iOS has no supported equivalent in this build: caller identification needs
 * a Call Directory app-extension target that is not compiled here, and iOS
 * does not permit call interception or live call audio access. Every method
 * fails honestly rather than simulating success.
 */
const iosPlatform: CallerPlatform = {
  id: "ios",
  getStatus: async () => UNAVAILABLE_STATUS,
  requestRole: async () => false,
  syncWatchlist: async () => false,
  setPolicy: async () => false,
  getScreenedLog: async () => [],
  clearScreenedLog: async () => false,
};

const unsupportedPlatform: CallerPlatform = {
  id: "unsupported",
  getStatus: async () => UNAVAILABLE_STATUS,
  requestRole: async () => false,
  syncWatchlist: async () => false,
  setPolicy: async () => false,
  getScreenedLog: async () => [],
  clearScreenedLog: async () => false,
};

export const callerPlatform: CallerPlatform =
  platformId === "android"
    ? androidPlatform
    : platformId === "ios"
      ? iosPlatform
      : unsupportedPlatform;

// ---------------------------------------------------------------------------
// Capability status
// ---------------------------------------------------------------------------

export interface CallerCapabilityState {
  capability: ProtectionCapability | null;
  status: CallerScreeningStatus;
  refresh(): void;
}

/**
 * Real, polled state of caller protection: OS capability × OS role × the
 * user's JAAL switch. Refreshes whenever the app returns to the foreground,
 * because the role grant happens in system settings.
 */
export function useCallerCapability(): CallerCapabilityState {
  const settings = useProtectionSettings();
  const [status, setStatus] = useState<CallerScreeningStatus>(
    UNAVAILABLE_STATUS,
  );
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    callerPlatform
      .getStatus()
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch(() => {
        if (!cancelled) setStatus(UNAVAILABLE_STATUS);
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const userEnabled = settings?.callerProtection === true;
  const os = osCallerScreening();

  const capability = composeCapability({
    feature: "caller",
    os,
    userEnabled,
    permissionGranted: status.roleGranted,
    setupAction: "Set up caller protection",
    enabledExplanation:
      os.supported && status.roleGranted
        ? "JAAL checks incoming numbers against its threat intelligence before you answer. You always make the final decision."
        : os.reason,
    disabledExplanation:
      "Turn on caller protection to check incoming numbers against JAAL threat intelligence. JAAL never answers or blocks calls for you.",
    permissionExplanation:
      "JAAL needs Android's call-screening role before it can check incoming numbers. You grant it in system settings, and you can revoke it there at any time.",
  });

  return { capability, status, refresh };
}

// ---------------------------------------------------------------------------
// Enabling / disabling
// ---------------------------------------------------------------------------

/** Keep the on-device watchlist in step with JAAL threat intelligence. */
export async function syncCallerWatchlist(
  indicators: unknown[],
): Promise<boolean> {
  return await callerPlatform.syncWatchlist(indicators);
}

export function useEnableCallerProtection() {
  const save = useMutation(api.protection.saveProtectionSettings);
  const cache = useQuery(api.protection.listIndicatorCache, { type: "phone" });

  return useCallback(async () => {
    await save({ callerProtection: true });
    if (cache?.enabled) {
      await callerPlatform.syncWatchlist(cache.indicators);
    }
    return await callerPlatform.requestRole();
  }, [save, cache]);
}

export function useDisableCallerProtection() {
  const save = useMutation(api.protection.saveProtectionSettings);
  return useCallback(async () => {
    await save({ callerProtection: false });
    await callerPlatform.syncWatchlist([]);
    return true;
  }, [save]);
}

/** Push the screening policy (auto-reject / warnings / log) to native. */
export function useSaveScreeningPolicy() {
  return useCallback(async (policy: ScreeningPolicy) => {
    return await callerPlatform.setPolicy(policy);
  }, []);
}

// ---------------------------------------------------------------------------
// The shared check itself
// ---------------------------------------------------------------------------

export type { CallerIntelligence };

/**
 * Check a number through the shared service. This is the ONE entry point
 * both platforms use, so the intelligence behind it is identical even though
 * the native mechanics are not.
 */
export async function checkCaller(
  number: string,
  lookup: LookupFn,
): Promise<CallerIntelligence> {
  return await checkCallerIntelligence({ number, lookup });
}

export type { CapabilityState, LookupFn };
