import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import * as SecureStore from "expo-secure-store";
import { Platform, type ReactNode } from "react";
import { CONVEX_URL } from "../constants/convex";

/**
 * Shared Convex client for the whole app. One client, one deployment — the
 * existing JAAL backend. No second database, no client-side secrets.
 */
export const convex = new ConvexReactClient(CONVEX_URL);

/**
 * Secure token storage for React Native.
 *
 * Convex Auth recommends wrapping `expo-secure-store` for RN. SecureStore only
 * allows keys made of [A-Za-z0-9._-], so keys are sanitised on every read and
 * write (the same transformation is applied on both sides, so lookups always
 * match). On web we fall back to localStorage so the app still runs in a
 * browser during development.
 */
const KEY_SANITIZE_RE = /[^A-Za-z0-9._-]/g;

function safeKey(key: string): string {
  return key.replace(KEY_SANITIZE_RE, "_");
}

export const tokenStorage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === "web") {
      try {
        return globalThis.localStorage?.getItem(key) ?? null;
      } catch {
        return null;
      }
    }
    return await SecureStore.getItemAsync(safeKey(key));
  },
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === "web") {
      try {
        globalThis.localStorage?.setItem(key, value);
      } catch {
        /* ignore */
      }
      return;
    }
    await SecureStore.setItemAsync(safeKey(key), value);
  },
  async removeItem(key: string): Promise<void> {
    if (Platform.OS === "web") {
      try {
        globalThis.localStorage?.removeItem(key);
      } catch {
        /* ignore */
      }
      return;
    }
    await SecureStore.deleteItemAsync(safeKey(key));
  },
};

/**
 * Root provider that makes Convex hooks available and enables authentication
 * with secure local session storage. Session tokens persist in SecureStore, so
 * a signed-in user stays signed in when the app is reopened.
 */
export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexAuthProvider
      client={convex}
      storage={tokenStorage}
      storageNamespace="jaal-companion"
    >
      {children}
    </ConvexAuthProvider>
  );
}
