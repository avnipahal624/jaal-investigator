import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fontSize, radius, spacing } from "../../../theme";

/**
 * Step 2 — explicit consent.
 *
 * Nothing is uploaded until this is ticked. The copy states plainly that the
 * audio leaves the device, that a speech-to-text service and an AI model may
 * process it, and that the user can cancel or delete later.
 */
export function RecordingConsent({
  consent,
  onChange,
  disabled = false,
}: {
  consent: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.step}>Step 2 · Your consent</Text>

      <View style={styles.panel}>
        <Text style={styles.body}>
          This recording will be <Text style={styles.strong}>uploaded to JAAL</Text>{" "}
          and stored securely so you and JAAL investigators can review it.
        </Text>
        <Text style={styles.body}>
          To read the call, the audio is sent to a{" "}
          <Text style={styles.strong}>speech-to-text service</Text>. The resulting
          transcript is then sent to an{" "}
          <Text style={styles.strong}>external AI provider</Text> to look for scam
          tactics.
        </Text>
        <Text style={styles.body}>
          What is sent: the audio file, the transcript, and any details you add
          below. Do not upload recordings containing passwords, OTPs, PINs or
          banking credentials.
        </Text>
        <Text style={styles.body}>
          You can delete the recording and its audio from JAAL at any time. JAAL
          does not record calls for you and does not listen to your calls.
        </Text>
      </View>

      <Pressable
        onPress={() => onChange(!consent)}
        disabled={disabled}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: consent, disabled }}
        accessibilityLabel="Consent to upload and analyse this recording"
        style={styles.checkRow}
      >
        <View style={[styles.checkbox, consent && styles.checkboxOn]}>
          {consent ? <Text style={styles.check}>✓</Text> : null}
        </View>
        <Text style={styles.checkText}>
          I consent to uploading this recording for transcription and AI
          analysis, and I confirm I have the right to share it.
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  step: { fontSize: fontSize.lg, fontWeight: "800", color: colors.deep },
  panel: {
    backgroundColor: colors.glass,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  body: { fontSize: fontSize.base, color: colors.text, lineHeight: 24 },
  strong: { fontWeight: "800", color: colors.deep },
  checkRow: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "flex-start",
    minHeight: 48,
    paddingVertical: spacing.sm,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  checkboxOn: { backgroundColor: colors.primary },
  check: { color: colors.white, fontSize: 16, fontWeight: "800" },
  checkText: { flex: 1, fontSize: fontSize.base, color: colors.text, lineHeight: 23 },
});
