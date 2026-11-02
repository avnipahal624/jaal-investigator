/**
 * MESSAGE PROTECTION.
 *
 * Wraps the official Android notification-access integration. Nothing is read
 * until the user turns the feature on AND grants notification access in
 * system settings; the feature only ever sees a short snippet of allow-listed
 * packages, and only local rule matches are retained. On iOS this reports
 * itself unsupported — Apple gives third-party apps no access to WhatsApp,
 * Instagram or other private app conversations, and we do not pretend
 * otherwise.
 */

import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import { useMutation } from "convex/react";
import { api } from "../services/api";
import {
  getNotificationAccessStatus,
  nativeModule,
  NATIVE,
  osNotificationAccess,
  openNotificationAccessSettings,
} from "./capabilities";
import { composeCapability } from "./capabilities";
import type { ProtectionCapability } from "./types";
import { useProtectionSettings } from "./threatIntel";

/** Packages the user explicitly chose to protect. Empty = nothing read. */
export const DEFAULT_PROTECTED_PACKAGES = [
  "com.android.mms",
  "com.whatsapp",
  "org.telegram.messenger",
  "com.instagram.android",
];

export const MESSAGE_MAX_CHARS = 300;

export interface MessageHit {
  packageName: string;
  title: string;
  snippet: string;
  rule: string;
  at: number;
}

/** Human-readable label for a local rule match. */
export const RULE_LABELS: Record<string, string> = {
  payment_with_otp: "Payment request that also asks for a code",
  otp_request: "Asks for a one-time code",
  payment_request: "Payment or money-transfer language",
  urgency_language: "Pressure or urgency language",
  impersonation: "Claims to be a bank, police or government office",
};

async function writePolicy(enabled: boolean, packages: string[]) {
  const mod = nativeModule(NATIVE.notificationReader);
  if (!mod || typeof mod.setPolicy !== "function") return false;
  try {
    mod.setPolicy(
      JSON.stringify({ enabled, packages, maxChars: MESSAGE_MAX_CHARS }),
    );
    return true;
  } catch {
    return false;
  }
}

/** Real message-protection status for the Protection Centre. */
export function useMessageCapability(): ProtectionCapability | null {
  const settings = useProtectionSettings();
  const [granted, setGranted] = useState(false);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    getNotificationAccessStatus()
      .then((s) => {
        if (!cancelled) setGranted(s.granted);
      })
      .catch(() => {
        if (!cancelled) setGranted(false);
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

  if (!settings) return null;

  return composeCapability({
    feature: "messages",
    os: osNotificationAccess(),
    userEnabled: settings.messageProtection,
    permissionGranted: granted,
    setupAction: "Choose messages to protect",
    enabledExplanation:
      "JAAL reads a short snippet of notifications from the apps you chose and flags suspicious wording. Nothing is sent to JAAL unless you turn on AI processing.",
    disabledExplanation:
      "Turn on message protection to spot suspicious payment requests and code asks as they arrive. You pick which apps JAAL may look at.",
    permissionExplanation:
      "Android needs notification access before JAAL can see any notifications. Grant it in system settings — you can revoke it there at any time.",
  });
}

/** Turn message protection on (user has already picked their apps). */
export function useEnableMessageProtection() {
  const save = useMutation(api.protection.saveProtectionSettings);
  return useCallback(
    async (packages: string[] = DEFAULT_PROTECTED_PACKAGES) => {
      await save({ messageProtection: true });
      return await writePolicy(true, packages);
    },
    [save],
  );
}

/** Turn message protection off and stop the listener reading anything. */
export function useDisableMessageProtection() {
  const save = useMutation(api.protection.saveProtectionSettings);
  return useCallback(async () => {
    await save({ messageProtection: false });
    return await writePolicy(false, []);
  }, [save]);
}

export function useOpenNotificationSettings() {
  return useCallback(async () => await openNotificationAccessSettings(), []);
}

/**
 * Local rule matches sitting on the device. Read only while message
 * protection is on; the caller decides whether anything is submitted to the
 * AI backend (which additionally requires the user's AI consent).
 */
export function useMessageHits(enabled: boolean): MessageHit[] {
  const [hits, setHits] = useState<MessageHit[]>([]);

  useEffect(() => {
    if (!enabled) {
      setHits([]);
      return;
    }
    let cancelled = false;
    const read = () => {
      const mod = nativeModule(NATIVE.notificationReader);
      if (!mod || typeof mod.getHits !== "function") return;
      try {
        const raw = mod.getHits();
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (!cancelled && Array.isArray(parsed)) {
          setHits(parsed as MessageHit[]);
        }
      } catch {
        if (!cancelled) setHits([]);
      }
    };
    read();
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") read();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [enabled]);

  return hits;
}

export function useClearMessageHits() {
  return useCallback(async () => {
    const mod = nativeModule(NATIVE.notificationReader);
    if (!mod || typeof mod.clearHits !== "function") return false;
    try {
      return (await mod.clearHits()) === true;
    } catch {
      return false;
    }
  }, []);
}
