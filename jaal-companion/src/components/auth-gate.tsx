import { Redirect, usePathname, type Href } from "expo-router";
import { FullScreenLoading } from "./FullScreenLoading";
import { useAuth } from "../hooks/use-auth";
import { useEnsureConsumerRole } from "../hooks/use-ensure-consumer-role";

/**
 * Where a signed-out user was headed before being sent to the welcome screen.
 * Module-scoped on purpose: it has to survive navigation between the welcome,
 * sign-in and sign-up screens (which carry no shared params).
 */
let pendingRoute: string | null = null;

/**
 * Protects authenticated routes. While the session restores it shows a
 * loader; once resolved, signed-out users are redirected to the welcome
 * screen with their intended destination remembered, so signing in returns
 * them there instead of dropping them on the dashboard.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useAuth();
  const pathname = usePathname();
  // Signed-in users need a consumer role before any consumer write works.
  useEnsureConsumerRole();

  if (isLoading) return <FullScreenLoading message="Restoring your session…" />;
  if (!isAuthenticated) {
    pendingRoute = pathname;
    return <Redirect href="/(auth)/welcome" />;
  }
  return <>{children}</>;
}

/**
 * Keeps already-signed-in users out of the auth screens (welcome / sign-in /
 * sign-up) and sends them to the destination they originally asked for, or the
 * dashboard when there isn't one.
 */
export function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading) return <FullScreenLoading />;
  if (isAuthenticated) {
    const target = (pendingRoute ?? "/(tabs)/home") as Href;
    pendingRoute = null;
    return <Redirect href={target} />;
  }
  return <>{children}</>;
}
