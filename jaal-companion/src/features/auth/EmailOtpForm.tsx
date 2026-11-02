import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "../../components/ui/Button";
import { TextField } from "../../components/ui/TextField";
import { useAuth } from "../../hooks/use-auth";
import { colors, fontSize, spacing } from "../../theme";

/**
 * Email + one-time-code sign-in for the Convex Auth `email-otp` provider.
 *
 * Step 1 sends a 6-digit code to the address (`signIn("email-otp", { email })`).
 * Step 2 verifies it (`signIn("email-otp", { email, code })`). On success the
 * auth layout detects the authenticated state and routes to the dashboard.
 *
 * `mode` only changes the copy — the provider auto-provisions an account for a
 * first-time address, so sign-in and sign-up share this flow.
 */
export function EmailOtpForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const { signIn } = useAuth();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  async function sendCode() {
    setError(null);
    if (!emailValid) {
      setError("Enter a valid email address.");
      return;
    }
    setLoading(true);
    try {
      await signIn("email-otp", { email: email.trim() });
      setStep("code");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode() {
    setError(null);
    if (code.trim().length < 6) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    setLoading(true);
    try {
      await signIn("email-otp", { email: email.trim(), code: code.trim() });
      // Authenticated — the auth layout redirects to the dashboard.
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.wrap}>
      {step === "email" ? (
        <>
          <TextField
            label="Email address"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            error={error ?? undefined}
          />
          <Button
            label={mode === "sign-up" ? "Create account" : "Send code"}
            onPress={sendCode}
            loading={loading}
          />
          <Text style={styles.hint}>
            We’ll email you a 6-digit code. No password needed.
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.sent}>
            Enter the 6-digit code we sent to {email.trim()}.
          </Text>
          <TextField
            label="Verification code"
            value={code}
            onChangeText={(t) => setCode(t.replace(/[^0-9]/g, "").slice(0, 6))}
            placeholder="123456"
            keyboardType="number-pad"
            autoComplete="off"
            error={error ?? undefined}
          />
          <Button label="Verify & continue" onPress={verifyCode} loading={loading} />
          <Button
            label="Use a different email"
            variant="ghost"
            onPress={() => {
              setStep("email");
              setCode("");
              setError(null);
            }}
            disabled={loading}
          />
        </>
      )}
    </View>
  );
}

function errorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  // Surface a friendly message for the common failure modes.
  if (/rate|too many/i.test(msg)) return "Too many attempts. Please wait a moment and try again.";
  if (/code|invalid|expired|token/i.test(msg)) return "That code didn’t match or has expired. Try again.";
  return msg || "Something went wrong. Please try again.";
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.lg },
  hint: { fontSize: fontSize.sm, color: colors.muted, textAlign: "center" },
  sent: { fontSize: fontSize.base, color: colors.text, textAlign: "center" },
});
