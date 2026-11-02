import { Stack } from "expo-router";
import { RequireAuth } from "../../src/components/auth-gate";
import { colors } from "../../src/theme";

/** Reports show the user's own submissions — signed-in only. */
export default function ReportsLayout() {
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
