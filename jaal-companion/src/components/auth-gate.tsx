import { Redirect } from "expo-router";
import { FullScreenLoading } from "./FullScreenLoading";
import { useAuth } from "../hooks/use-auth";

/**
 * Protects authenticated routes. While the session restores it shows a
 * loader; once resolved, signed-out users are redirected to the welcome
 * screen. The intended destination is preserved by expo-router's href, and
 * sign-in navigates back to it.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading) return <FullScreenLoading message="Restoring your session…" />;
  if (!isAuthenticated) return <Redirect href="/(auth)/welcome" />;
  return <>{children}</>;
}

/**
 * Keeps already-signed-in users out of the auth screens (welcome / sign-in /
 * sign-up) and sends them to the dashboard instead.
 */
export function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading) return <FullScreenLoading />;
  if (isAuthenticated) return <Redirect href="/(tabs)/home" />;
  return <>{children}</>;
}
