import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { Card } from "../../src/components/ui/Card";
import { Screen } from "../../src/components/ui/Screen";
import { Button } from "../../src/components/ui/Button";
import {
  callerPlatform,
  useCallerCapability,
  useDisableCallerProtection,
  useEnableCallerProtection,
  useSaveScreeningPolicy,
} from "../../src/protection/caller";
import {
  useDisableMessageProtection,
  useEnableMessageProtection,
  useMessageCapability,
  useOpenNotificationSettings,
} from "../../src/protection/messages";
import {
  osShareToJaal,
  osVoiceRecording,
} from "../../src/protection/capabilities";
import {
  useProtectionSettings,
  useSaveProtectionSettings,
  useUnreadAlertCount,
} from "../../src/protection/threatIntel";
import type { CapabilityState, ProtectionCapability } from "../../src/protection/types";
import { colors, fontSize, radius, spacing } from "../../src/theme";

const STATUS_META: Record<
  CapabilityState,
  { label: string; fg: string; bg: string }
> = {
  ENABLED: { label: "Active", fg: colors.teal, bg: colors.mint },
  DISABLED: { label: "Off", fg: colors.muted, bg: colors.backgroundAlt },
  REQUIRES_SETUP: { label: "Setup needed", fg: colors.white, bg: colors.primary },
  REQUIRES_PERMISSION: {
    label: "Needs permission",
    fg: colors.white,
    bg: colors.warning,
  },
  UNSUPPORTED: { label: "Not available", fg: colors.muted, bg: colors.backgroundAlt },
  UNKNOWN: { label: "Checking…", fg: colors.muted, bg: colors.backgroundAlt },
};

function StatusChip({ state }: { state: CapabilityState }) {
  const meta = STATUS_META[state];
  return (
    <View style={[styles.chip, { backgroundColor: meta.bg }]}>
      <Text style={[styles.chipText, { color: meta.fg }]}>{meta.label}</Text>
    </View>
  );
}

/**
 * One protection feature: its REAL status, an honest explanation of what that
 * means on this device, and a single action that either configures it or
 * turns it off. Permissions are only ever requested from this action — never
 * on app launch.
 */
function FeatureCard({
  icon,
  title,
  capability,
  actionLabel,
  onAction,
  children,
}: {
  icon: string;
  title: string;
  capability: ProtectionCapability | null;
  actionLabel?: string;
  onAction?: () => void;
  children?: React.ReactNode;
}) {
  const state: CapabilityState = capability?.state ?? "UNKNOWN";
  return (
    <Card style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.icon}>{icon}</Text>
        <View style={styles.cardHeadText}>
          <Text style={styles.cardTitle}>{title}</Text>
          <StatusChip state={state} />
        </View>
      </View>

      <Text style={styles.explanation}>
        {capability?.explanation ?? "Checking this device…"}
      </Text>

      {children}

      {capability?.setupAction && actionLabel && onAction ? (
        <Button
          label={actionLabel}
          variant={state === "ENABLED" ? "secondary" : "primary"}
          onPress={onAction}
        />
      ) : null}
    </Card>
  );
}

/** Unified Protection Centre — the single place to see what is really on. */
export default function Protection() {
  const router = useRouter();
  const settings = useProtectionSettings();
  const saveSettings = useSaveProtectionSettings();
  const unread = useUnreadAlertCount();

  const caller = useCallerCapability();
  const messages = useMessageCapability();
  const enableCaller = useEnableCallerProtection();
  const disableCaller = useDisableCallerProtection();
  const enableMessages = useEnableMessageProtection();
  const disableMessages = useDisableMessageProtection();
  const openNotificationSettings = useOpenNotificationSettings();
  const savePolicy = useSaveScreeningPolicy();

  const [busy, setBusy] = useState(false);
  const [policy, setPolicy] = useState({
    autoRejectVerified: false,
    warnNotifications: true,
    screeningLog: false,
  });

  const share = osShareToJaal();
  const voice = osVoiceRecording();

  const linkCapability: ProtectionCapability | null = settings
    ? {
        feature: "links",
        state: settings.linkProtection ? "ENABLED" : "REQUIRES_SETUP",
        supportedByOs: true,
        permissionGranted: true,
        userEnabled: settings.linkProtection,
        explanation:
          "Check a link with JAAL before you open it. JAAL reads the address as text — it never opens, fetches or resolves the URL — and compares it against threat intelligence. Covered: links you share into JAAL or paste in Analyse. JAAL does not inspect links inside other apps or browsers.",
        setupAction: settings.linkProtection ? null : "Turn on link checks",
      }
    : null;

  const shareCapability: ProtectionCapability = {
    feature: "shareToJaal",
    state: share.supported ? "ENABLED" : "UNSUPPORTED",
    supportedByOs: share.supported,
    permissionGranted: share.supported,
    userEnabled: share.supported,
    explanation: share.reason,
    setupAction: null,
  };

  const voiceCapability: ProtectionCapability = {
    feature: "voice",
    state: voice.supported ? "ENABLED" : "UNSUPPORTED",
    supportedByOs: voice.supported,
    permissionGranted: voice.supported,
    userEnabled: voice.supported,
    explanation: voice.reason,
    setupAction: null,
  };

  const caps = [caller.capability, messages, linkCapability];
  const supported = caps.filter((c) => c?.supportedByOs);
  const active = supported.filter((c) => c?.state === "ENABLED");

  const toggleCaller = async () => {
    setBusy(true);
    try {
      if (caller.capability?.userEnabled) await disableCaller();
      else await enableCaller();
      caller.refresh();
    } finally {
      setBusy(false);
    }
  };

  const toggleMessages = async () => {
    setBusy(true);
    try {
      if (messages?.userEnabled) await disableMessages();
      else {
        await enableMessages();
        // Only now do we ask the OS for notification access.
        await openNotificationSettings();
      }
    } finally {
      setBusy(false);
    }
  };

  const updatePolicy = async (next: Partial<typeof policy>) => {
    const merged = { ...policy, ...next };
    setPolicy(merged);
    await savePolicy(merged);
  };

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Protection Centre</Text>
          <Pressable
            onPress={() => router.push("/protection/alerts")}
            style={styles.alertBtn}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Alerts, ${unread ?? 0} unread`}
          >
            <Text style={styles.alertBtnText}>
              🔔{unread ? ` ${unread}` : ""}
            </Text>
          </Pressable>
        </View>
        <Text style={styles.subtitle}>
          {supported.length > 0
            ? `${active.length} of ${supported.length} available protections are active on this device.`
            : "Check which protections this device supports."}
        </Text>
        <Pressable onPress={() => router.push("/protection/alerts")} hitSlop={6}>
          <Text style={styles.alertLink}>
            {unread ? `${unread} unread alert${unread > 1 ? "s" : ""}` : "View alert history"}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      >
        {/* ---------------------------------------------------------- Caller */}
        <FeatureCard
          icon="📞"
          title="Caller Protection"
          capability={caller.capability}
          actionLabel={
            caller.capability?.state === "ENABLED"
              ? "Turn off"
              : caller.capability?.state === "REQUIRES_PERMISSION"
                ? "Grant call-screening role"
                : "Turn on caller protection"
          }
          onAction={() => void toggleCaller()}
        >
          {caller.capability?.state === "ENABLED" ? (
            <View style={styles.policyBox}>
              <Text style={styles.policyHead}>How JAAL handles a match</Text>

              <View style={styles.switchRow}>
                <View style={styles.switchText}>
                  <Text style={styles.switchTitle}>Warn me about reported numbers</Text>
                  <Text style={styles.switchHint}>
                    Shows a notification. The call still rings.
                  </Text>
                </View>
                <Switch
                  value={policy.warnNotifications}
                  onValueChange={(v) => void updatePolicy({ warnNotifications: v })}
                  trackColor={{ true: colors.primary, false: colors.border }}
                  thumbColor={colors.white}
                />
              </View>

              <View style={styles.switchRow}>
                <View style={styles.switchText}>
                  <Text style={styles.switchTitle}>
                    Automatically reject verified numbers
                  </Text>
                  <Text style={styles.switchHint}>
                    Off by default. Only investigator-verified numbers are ever
                    rejected, and you can turn this off any time.
                  </Text>
                </View>
                <Switch
                  value={policy.autoRejectVerified}
                  onValueChange={(v) => void updatePolicy({ autoRejectVerified: v })}
                  trackColor={{ true: colors.primary, false: colors.border }}
                  thumbColor={colors.white}
                />
              </View>

              <View style={styles.switchRow}>
                <View style={styles.switchText}>
                  <Text style={styles.switchTitle}>Keep a local screening log</Text>
                  <Text style={styles.switchHint}>
                    Stores matched numbers on this device only, so you can
                    report them afterwards. Off by default.
                  </Text>
                </View>
                <Switch
                  value={policy.screeningLog}
                  onValueChange={(v) => void updatePolicy({ screeningLog: v })}
                  trackColor={{ true: colors.primary, false: colors.border }}
                  thumbColor={colors.white}
                />
              </View>
            </View>
          ) : null}

          {caller.status.roleGranted ? (
            <Text style={styles.fineprint}>
              Android's call-screening role is granted. JAAL never answers,
              records or listens to your calls.
            </Text>
          ) : null}
        </FeatureCard>

        {/* ------------------------------------------------------- Messages */}
        <FeatureCard
          icon="💬"
          title="Message Protection"
          capability={messages}
          actionLabel={
            messages?.state === "ENABLED"
              ? "Turn off"
              : messages?.state === "REQUIRES_PERMISSION"
                ? "Grant notification access"
                : "Choose messages to protect"
          }
          onAction={() => void toggleMessages()}
        >
          <Text style={styles.fineprint}>
            Available on Android only. iOS does not allow third-party apps to
            read WhatsApp, Instagram or other private app notifications. JAAL
            never collects passwords or payment credentials, and nothing is
            uploaded unless you turn on AI processing below.
          </Text>
        </FeatureCard>

        {/* ----------------------------------------------------------- Link */}
        <FeatureCard
          icon="🔗"
          title="Link Protection"
          capability={linkCapability}
          actionLabel={settings?.linkProtection ? "Turn off" : "Turn on link checks"}
          onAction={() =>
            void saveSettings({ linkProtection: !settings?.linkProtection })
          }
        >
          <Text style={styles.fineprint}>
            JAAL never opens a suspicious link. It reads the address as text
            and tells you what it finds.
          </Text>
        </FeatureCard>

        {/* --------------------------------------------------- Share to JAAL */}
        <FeatureCard
          icon="📤"
          title="Share to JAAL"
          capability={shareCapability}
        >
          <Text style={styles.fineprint}>
            In another app, open the share sheet and pick JAAL to check a
            message or link before you act on it.
          </Text>
        </FeatureCard>

        {/* ----------------------------------------------------------- Voice */}
        <FeatureCard icon="🎙️" title="Voice Safety" capability={voiceCapability}>
          <Button
            label="Record and analyse a call"
            variant="secondary"
            onPress={() => router.push("/analyse/recording")}
          />
          <Text style={styles.fineprint}>
            JAAL cannot listen to live calls — no supported API on Android or
            iOS allows that. You record the call yourself, then JAAL analyses
            what was said.
          </Text>
        </FeatureCard>

        {/* -------------------------------------------------------- Privacy */}
        <Card style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.icon}>🔐</Text>
            <View style={styles.cardHeadText}>
              <Text style={styles.cardTitle}>Privacy & AI processing</Text>
            </View>
          </View>

          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={styles.switchTitle}>Send content to JAAL's AI</Text>
              <Text style={styles.switchHint}>
                When off, only local checks and threat-intelligence lookups run
                — no message, link or recording text is sent to an external AI
                provider. Lookups are always sent to JAAL's own backend.
              </Text>
            </View>
            <Switch
              value={settings?.aiProcessing ?? false}
              onValueChange={(v) => void saveSettings({ aiProcessing: v })}
              trackColor={{ true: colors.primary, false: colors.border }}
              thumbColor={colors.white}
            />
          </View>

          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={styles.switchTitle}>Security notifications</Text>
              <Text style={styles.switchHint}>
                Local notifications when JAAL raises a meaningful alert.
              </Text>
            </View>
            <Switch
              value={settings?.alertNotifications ?? false}
              onValueChange={(v) =>
                void saveSettings({ alertNotifications: v })
              }
              trackColor={{ true: colors.primary, false: colors.border }}
              thumbColor={colors.white}
            />
          </View>

          <Text style={styles.fineprint}>
            You can turn any protection off at any time. JAAL does not use
            Accessibility Services, does not secretly monitor calls or
            messages, and never stores more than a feature needs. Turning a
            feature off here also stops the matching background access.
          </Text>
        </Card>

        <Pressable onPress={() => router.push("/protection/alerts")} style={styles.alertsCta}>
          <Text style={styles.alertsCtaText}>
            {unread ? `View ${unread} unread alert${unread > 1 ? "s" : ""}` : "View alert history"}
          </Text>
        </Pressable>

        <Text style={styles.disclaimer}>
          JAAL helps you decide; it does not guarantee recovery, block every
          scam, or provide legal advice. Reporting through JAAL does not file a
          police complaint.
        </Text>

        {callerPlatform.id === "ios" ? (
          <Text style={styles.disclaimer}>
            Caller identification is not available in this iOS build.
          </Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    gap: 4,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontSize: fontSize.xxl, fontWeight: "800", color: colors.deep },
  subtitle: { fontSize: fontSize.sm, color: colors.muted, lineHeight: 20 },
  alertBtn: {
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  alertBtnText: { fontSize: fontSize.sm, fontWeight: "700", color: colors.deep },
  alertLink: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: "700",
    textDecorationLine: "underline",
    marginTop: 2,
    alignSelf: "flex-start",
  },
  list: {
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  card: { gap: spacing.sm },
  cardHead: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
  cardHeadText: { flex: 1, gap: 6, flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  icon: { fontSize: 26 },
  cardTitle: {
    fontSize: fontSize.base,
    fontWeight: "700",
    color: colors.text,
    flexShrink: 1,
  },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  chipText: { fontSize: 11, fontWeight: "800" },
  explanation: { fontSize: fontSize.sm, color: colors.muted, lineHeight: 21 },
  fineprint: {
    fontSize: fontSize.xs,
    color: colors.muted,
    lineHeight: 18,
  },
  policyBox: {
    backgroundColor: colors.glass,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  policyHead: {
    fontSize: fontSize.xs,
    fontWeight: "800",
    color: colors.deep,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: 4,
  },
  switchText: { flex: 1, gap: 2 },
  switchTitle: { fontSize: fontSize.sm, fontWeight: "600", color: colors.text },
  switchHint: { fontSize: fontSize.xs, color: colors.muted, lineHeight: 17 },
  alertsCta: {
    alignItems: "center",
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  alertsCtaText: { fontSize: fontSize.sm, fontWeight: "700", color: colors.primary },
  disclaimer: {
    fontSize: fontSize.xs,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 18,
    marginTop: spacing.sm,
  },
});
