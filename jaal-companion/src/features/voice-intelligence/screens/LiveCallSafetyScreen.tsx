import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Screen } from "../../../components/ui/Screen";
import { colors, fontSize, radius, spacing } from "../../../theme";
import { platformId } from "../../../protection/capabilities";
import { callerPlatform, useCallerCapability, type ScreenedCall } from "../../../protection/caller";
import { useProtectionSettings } from "../../../protection/threatIntel";
import { formatTimestamp } from "../../../services/voice-intelligence";
import { CallSafetyPanel } from "../components/CallSafetyPanel";

/**
 * Live Call Safety.
 *
 * Uses the Phase 2 caller-screening capability — nothing here claims access to
 * cellular call audio. On a platform without screening support the screen still
 * works as safety guidance plus a path into post-call analysis, and says so.
 */
export function LiveCallSafetyScreen() {
  const { status } = useCallerCapability();
  const settings = useProtectionSettings();
  const [flagged, setFlagged] = useState(false);
  const [screened, setScreened] = useState<ScreenedCall[]>([]);

  const active = status.available && status.roleGranted && settings?.callerProtection === true;

  useEffect(() => {
    let cancelled = false;
    if (!active) {
      setScreened([]);
      return;
    }
    callerPlatform
      .getScreenedLog()
      .then((log) => {
        if (!cancelled) setScreened(log.slice(0, 5));
      })
      .catch(() => {
        if (!cancelled) setScreened([]);
      });
    return () => {
      cancelled = true;
    };
  }, [active]);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Live Call Safety</Text>
          <Text style={styles.title}>If a call feels wrong</Text>
          <Text style={styles.subtitle}>
            What JAAL can actually do depends on your phone. The safety guidance
            below works everywhere.
          </Text>
        </View>

        <CallSafetyPanel
          platform={platformId}
          screeningAvailable={status.available}
          roleGranted={status.roleGranted}
          userEnabled={settings?.callerProtection === true}
          flagged={flagged}
          onToggleFlag={() => setFlagged((v) => !v)}
          onPostCall={() => router.push("/voice/record?flagged=1")}
        />

        {active ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recently screened calls</Text>
            <Text style={styles.muted}>
              Numbers JAAL flagged on this device. These stay on your phone.
            </Text>
            {screened.length === 0 ? (
              <Text style={styles.muted}>No flagged calls yet.</Text>
            ) : (
              screened.map((call, index) => (
                <View key={`${call.normalized}-${index}`} style={styles.logRow}>
                  <View style={styles.logBody}>
                    <Text style={styles.logNumber}>{call.number}</Text>
                    <Text style={styles.muted}>
                      {call.provenance === "VERIFIED"
                        ? "Verified by JAAL investigators"
                        : "Reported by JAAL users — not verified"}
                    </Text>
                  </View>
                  <Text style={styles.muted}>
                    {formatTimestamp(call.at) ?? ""}
                  </Text>
                </View>
              ))
            )}
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What JAAL does not do</Text>
          <Text style={styles.muted}>
            • It does not listen to, record or transcribe your calls.{"\n"}
            • It does not block calls unless you explicitly turn that on.{"\n"}
            • It does not see call audio on iPhone.{"\n"}
            • It does not decide for you whether to answer.
          </Text>
        </View>

        <View style={styles.afterBox}>
          <Text style={styles.sectionTitle}>After the call</Text>
          <Text style={styles.muted}>
            If you have a recording of the call, analyse it to see what tactics were
            used and keep it as evidence. If you don’t, you can still create a report
            from what you remember.
          </Text>
          <Text style={styles.link} onPress={() => router.push("/voice/record")}>
            Analyse a recording →
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.sm, gap: spacing.lg, paddingBottom: spacing.xxl },
  header: { gap: spacing.xs },
  eyebrow: {
    fontSize: fontSize.sm,
    fontWeight: "800",
    color: colors.primary,
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  title: { fontSize: fontSize.xxl, fontWeight: "800", color: colors.deep },
  subtitle: { fontSize: fontSize.base, color: colors.muted, lineHeight: 24 },
  section: { gap: spacing.xs },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: "800", color: colors.deep },
  muted: { fontSize: fontSize.sm, color: colors.muted, lineHeight: 21 },
  logRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.glass,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  logBody: { flex: 1, gap: 2 },
  logNumber: { fontSize: fontSize.base, fontWeight: "700", color: colors.deep },
  afterBox: {
    backgroundColor: colors.mint,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  link: { fontSize: fontSize.base, fontWeight: "800", color: colors.teal, marginTop: spacing.xs },
});
