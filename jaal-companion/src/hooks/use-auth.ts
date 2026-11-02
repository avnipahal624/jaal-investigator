import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

/**
 * Auth state for the mobile app. Mirrors the investigator web `use-auth` so
 * both clients share the same Convex Auth session model.
 *
 * - `isLoading` is true while the session is restoring or the user record is
 *   still loading.
 * - `signIn` drives the configured providers (`email-otp`, `anonymous`).
 * - `user` is the signed-in user record (or null when signed out).
 */
export function useAuth() {
  const { isLoading: isAuthLoading, isAuthenticated } = useConvexAuth();
  const user = useQuery(api.users.currentUser);
  const { signIn, signOut } = useAuthActions();

  const isLoading = isAuthLoading || user === undefined;

  return {
    isLoading,
    isAuthenticated,
    user,
    signIn,
    signOut,
  };
}
