import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ConvexClientProvider } from "../src/services/convex";
import { colors } from "../src/theme";

/**
 * App root. Wraps everything in the shared Convex client + auth provider
 * (session tokens persist in SecureStore) and declares the top-level stack.
 * Route-level protection lives in each group's layout via RequireAuth.
 */
export default function RootLayout() {
  return (
    <ConvexClientProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="analyse" />
        <Stack.Screen name="analysis" />
        <Stack.Screen name="reports" />
      </Stack>
    </ConvexClientProvider>
  );
}
