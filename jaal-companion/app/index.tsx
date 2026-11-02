import { Redirect } from "expo-router";
import { FullScreenLoading } from "../src/components/FullScreenLoading";
import { useAuth } from "../src/hooks/use-auth";

/**
 * Entry route. Sends signed-in users straight to the dashboard and everyone
 * else to the welcome screen. The (auth) and (tabs) layouts re-check auth as
 * a second line of defence.
 */
export default function Index() {
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading) return <FullScreenLoading />;
  return (
    <Redirect href={isAuthenticated ? "/(tabs)/home" : "/(auth)/welcome"} />
  );
}
