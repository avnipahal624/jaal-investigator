import { Stack } from "expo-router";
import { RequireAuth } from "../../src/components/auth-gate";
import { colors } from "../../src/theme";

/** Voice Intelligence requires a signed-in session, like every other flow. */
export default function VoiceLayout() {
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
