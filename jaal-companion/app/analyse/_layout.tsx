import { Stack } from "expo-router";
import { RequireAuth } from "../../src/components/auth-gate";
import { colors } from "../../src/theme";

/** The whole analyse flow requires a signed-in session. */
export default function AnalyseLayout() {
  return (
    <RequireAuth>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      />
    </RequireAuth>
  );
}
