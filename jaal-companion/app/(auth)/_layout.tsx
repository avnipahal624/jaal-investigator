import { Stack } from "expo-router";
import { RedirectIfAuthed } from "../../src/components/auth-gate";
import { colors } from "../../src/theme";

/** Guest-only auth stack. Signed-in users are bounced to the dashboard. */
export default function AuthLayout() {
  return (
    <RedirectIfAuthed>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      />
    </RedirectIfAuthed>
  );
}
