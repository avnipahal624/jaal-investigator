import { Stack } from "expo-router";
import { RequireAuth } from "../../src/components/auth-gate";
import { colors } from "../../src/theme";

/** Analysis results contain the user's own submitted content — signed-in only. */
export default function AnalysisLayout() {
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
