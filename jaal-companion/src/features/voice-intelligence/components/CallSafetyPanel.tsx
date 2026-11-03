import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { colors, fontSize, radius, spacing } from "../../../theme";
import { platformId as platformIdValue } from "../../../protection/capabilities";

/** The exact platform union the capability layer detects. */
type PlatformId = typeof platformIdValue;

const CHECKLIST = [
  "Is this really the organisation? Hang up and call back on a number you look up yourself.",
  "Are they asking for an OTP, PIN, password or card details? Never share them with a caller.",
  "Are they asking you to install an app or share your screen? Don’t — remote-access apps hand over your phone.",
  "Are they rushing you, or threatening arrest or account blocking? Slow down. Pressure is the tactic.",
  "Are they asking for money, gift cards, crypto or a UPI transfer? Stop and verify before paying anything.",
];

/**
 * Live-call safety.
 *
 * This panel is deliberately honest: it shows only capabilities the device
 * actually has, never implies JAAL can hear the call, and never renders a fake
 * live transcript. Its job is to help the user decide *during* the call and to
 * reach post-call analysis afterwards.
 */
export function CallSafetyPanel({
  platform,
  screeningAvailable,
  roleGranted,
  userEnabled,
  flagged,
  onToggleFlag,
  onPostCall,
}: {
  platform: PlatformId;
  /** OS-level: can this device run JAAL caller screening at all? */
  screeningAvailable: boolean;
  /** OS-level: has the user granted the call-screening role? */
  roleGranted: boolean;
  /** The user's own JAAL switch for caller protection. */
  userEnabled: boolean;
  flagged: boolean;
  onToggleFlag: () => void;
  onPostCall: () => void;
}) {
  const [checked, setChecked] = useState<number[]>([]);

  const active = screeningAvailable && roleGranted && userEnabled;

  const capabilityLine =
    platform === "android"
      ? active
        ? "Caller screening is active. JAAL checks incoming numbers against its on-device threat list before you answer — you still decide."
        : screeningAvailable
          ? roleGranted
            ? "Caller screening is set up on this device, but caller protection is switched off in JAAL."
            : "Android supports caller screening, but JAAL doesn’t have the call-screening role yet."
          : "Caller screening isn’t available on this device."
      : platform === "ios"
        ? "iOS doesn’t give apps access to live call audio, and JAAL has no call-directory extension in this build, so it can’t identify or listen to your calls."
        : "Live call protection isn’t available on this platform.";

  function toggle(index: number) {
    setChecked((current) =>
      current.includes(index) ? current.filter((i) => i !== index) : [...current, index],
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.heading}>During the call</Text>
        <Badge
          label={active ? "Screening active" : "Guidance only"}
          tone={active ? "good" : "neutral"}
        />
      </View>

      <View style={styles.statusBox}>
        <Text style={styles.statusText}>{capabilityLine}</Text>
        <Text style={styles.statusNote}>
          JAAL never listens to, records or transcribes your call audio. There is no
          live AI listening here.
        </Text>
      </View>

      <Text style={styles.checklistTitle}>Quick safety check</Text>
      {CHECKLIST.map((item, index) => {
        const isChecked = checked.includes(index);
        return (
          <Pressable
            key={index}
            onPress={() => toggle(index)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isChecked }}
            style={styles.checkRow}
          >
            <View style={[styles.box, isChecked && styles.boxOn]}>
              {isChecked ? <Text style={styles.check}>✓</Text> : null}
            </View>
            <Text style={styles.checkText}>{item}</Text>
          </Pressable>
        );
      })}

      <Pressable
        onPress={onToggleFlag}
        accessibilityRole="switch"
        accessibilityState={{ checked: flagged }}
        style={[styles.flag, flagged && styles.flagOn]}
      >
        <Text style={[styles.flagText, flagged && styles.flagTextOn]}>
          {flagged ? "✓ Marked as suspicious" : "Mark this call as suspicious"}
        </Text>
      </Pressable>
      <Text style={styles.statusNote}>
        This is your own note. It stays on this screen and can be added to the
        report you create after the call.
      </Text>

      <View style={styles.endBox}>
        <Text style={styles.endTitle}>If you feel unsafe</Text>
        <Text style={styles.endText}>
          Ending the call is always allowed. You don’t need to be polite to someone
          demanding money or information. Hang up, then verify using contact details
          you find yourself.
        </Text>
      </View>

      <Button label="Review this call afterwards" onPress={onPostCall} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  heading: { fontSize: fontSize.lg, fontWeight: "800", color: colors.deep },
  statusBox: {
    backgroundColor: colors.glass,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  statusText: { fontSize: fontSize.base, color: colors.text, lineHeight: 24 },
  statusNote: { fontSize: fontSize.xs, color: colors.muted, lineHeight: 18 },
  checklistTitle: {
    fontSize: fontSize.base,
    fontWeight: "800",
    color: colors.deep,
    marginTop: spacing.sm,
  },
  checkRow: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "flex-start",
    minHeight: 48,
    paddingVertical: spacing.xs,
  },
  box: {
    width: 26,
    height: 26,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  boxOn: { backgroundColor: colors.primary },
  check: { color: colors.white, fontSize: 15, fontWeight: "800" },
  checkText: { flex: 1, fontSize: fontSize.base, color: colors.text, lineHeight: 23 },
  flag: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.warning,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  flagOn: { backgroundColor: "#FCEFCB" },
  flagText: { fontSize: fontSize.base, fontWeight: "700", color: colors.warning },
  flagTextOn: { color: colors.deep },
  endBox: {
    backgroundColor: colors.mint,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: 2,
  },
  endTitle: { fontSize: fontSize.base, fontWeight: "800", color: colors.deep },
  endText: { fontSize: fontSize.base, color: colors.text, lineHeight: 24 },
});
