import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useAction, useMutation } from "convex/react";
import { AnalysisResult } from "../../src/components/AnalysisResult";
import { Badge } from "../../src/components/ui/Badge";
import { Button } from "../../src/components/ui/Button";
import { Card } from "../../src/components/ui/Card";
import { Screen } from "../../src/components/ui/Screen";
import { TextField } from "../../src/components/ui/TextField";
import { api } from "../../src/services/api";
import {
  checkLinkIntelligence,
  useProtectionSettings,
  useReportIndicator,
  useSaveProtectionSettings,
} from "../../src/protection/threatIntel";
import type { LinkIntelligence } from "../../src/protection/types";
import { colors, fontSize, spacing } from "../../src/theme";
import type { ConsumerAnalysisResult } from "../../src/types/analysis";
import { checkLink, type LinkCheck } from "../../src/utils/linkCheck";

/**
 * Check a link. The URL is NEVER opened, fetched, or resolved — we only read
 * the pasted string locally and (optionally) ask the AI to reason about it.
 */
export default function AnalyseLink() {
  const analyse = useAction(api.assistantActions.analyseConsumerContent);
  const createReport = useMutation(api.consumer.createConsumerReport);
  const lookup = useMutation(api.protection.lookupIndicator);
  const reportIndicator = useMutation(api.protection.reportIndicator);
  const settings = useProtectionSettings();
  const saveSettings = useSaveProtectionSettings();

  // Pre-filled when arriving from the share sheet (review-before-analysis).
  const params = useLocalSearchParams<{ url?: string }>();
  const [url, setUrl] = useState(
    typeof params.url === "string" ? params.url : "",
  );
  const [localCheck, setLocalCheck] = useState<LinkCheck | null>(null);
  const [intel, setIntel] = useState<LinkIntelligence | null>(null);
  const [checking, setChecking] = useState(false);
  const [reported, setReported] = useState(false);
  const [result, setResult] = useState<ConsumerAnalysisResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Local string analysis + JAAL threat-intelligence lookup. Neither step
   * opens, fetches or resolves the URL — only the pasted text is read.
   */
  async function runLocal() {
    setError(null);
    if (!url.trim()) {
      setError("Paste a link to check.");
      return;
    }
    setLocalCheck(checkLink(url));
    setResult(null);
    setIntel(null);
    setReported(false);
    setChecking(true);
    try {
      const res = await checkLinkIntelligence({
        raw: url.trim(),
        lookup,
        aiConsent: false,
      });
      setIntel(res);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "JAAL could not check this link right now.",
      );
    } finally {
      setChecking(false);
    }
  }

  async function submitIndicator() {
    if (!url.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await reportIndicator({
        type: "url",
        value: url.trim(),
        reason: "Flagged as suspicious during a link check.",
      });
      setReported(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit the indicator.");
    } finally {
      setSubmitting(false);
    }
  }

  async function runAi() {
    setError(null);
    if (!url.trim()) {
      setError("Paste a link to check.");
      return;
    }
    // Explicit consent before any content leaves for an external AI provider.
    if (!settings?.aiProcessing) {
      setError(
        "AI processing is off. Turn on the AI processing switch below to analyse this link with AI.",
      );
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const res = await analyse({ content: url.trim(), kind: "link" });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function submitReport() {
    setSubmitting(true);
    setError(null);
    try {
      const created = await createReport({
        category: "link",
        url: url.trim(),
        description: "Link submitted for review from the mobile app.",
      });
      const id = created?.report?._id;
      if (id) router.replace(`/reports/${id}`);
      else router.replace("/(tabs)/activity");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit the report.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Check a link</Text>
        <Text style={styles.subtitle}>
          We only read the address you paste — we never open or visit it for you.
        </Text>

        <TextField
          label="Link"
          value={url}
          onChangeText={setUrl}
          placeholder="https://example.com/…"
          keyboardType="url"
          autoCapitalize="none"
          autoComplete="off"
          error={error ?? undefined}
        />

        <View style={styles.row}>
          <Button
            label="Check link"
            variant="secondary"
            onPress={() => void runLocal()}
            loading={checking}
            style={styles.flex}
          />
          <Button label="Analyse with AI" onPress={() => void runAi()} loading={busy} style={styles.flex} />
        </View>

        <View style={styles.consentRow}>
          <View style={styles.consentText}>
            <Text style={styles.consentTitle}>Allow AI processing</Text>
            <Text style={styles.muted}>
              When off, only local checks and JAAL's own threat-intelligence
              lookup run. When on, the link text is sent to JAAL's AI provider
              for analysis.
            </Text>
          </View>
          <Switch
            value={settings?.aiProcessing ?? false}
            onValueChange={(v) => void saveSettings({ aiProcessing: v })}
            trackColor={{ true: colors.primary, false: colors.border }}
            thumbColor={colors.white}
          />
        </View>

        {intel ? (
          <Card>
            <Text style={styles.section}>JAAL threat intelligence</Text>
            <View style={styles.flagRow}>
              <Text style={styles.host}>{intel.host}</Text>
              <Badge
                label={
                  intel.verdict === "KNOWN_INDICATOR"
                    ? "KNOWN INDICATOR"
                    : intel.verdict === "SUSPICIOUS"
                      ? "SUSPICIOUS"
                      : intel.verdict === "UNAVAILABLE"
                        ? "UNAVAILABLE"
                        : intel.verdict === "INVALID"
                          ? "INVALID"
                          : "NO RECORD"
                }
                tone={
                  intel.verdict === "KNOWN_INDICATOR"
                    ? "danger"
                    : intel.verdict === "SUSPICIOUS"
                      ? "warn"
                      : "neutral"
                }
              />
            </View>

            {intel.matchedThreatIntel ? (
              <View style={styles.provBox}>
                <Text style={styles.provLabel}>
                  {intel.provenance === "VERIFIED"
                    ? "Confirmed by a JAAL investigator"
                    : "Reported by JAAL users (unverified)"}
                </Text>
                {intel.reason ? (
                  <Text style={styles.muted}>{intel.reason}</Text>
                ) : null}
              </View>
            ) : null}

            <Text style={styles.muted}>{intel.notice}</Text>

            <Text style={styles.section}>Safe next step</Text>
            <Text style={styles.muted}>
              {intel.matchedThreatIntel || intel.verdict === "SUSPICIOUS"
                ? "Don't enter passwords, OTPs or payment details on this page. Go to the service directly using an app or address you already trust."
                : "No warning signs found so far. Still never enter a password or OTP on a page you reached from an unexpected message."}
            </Text>

            {!intel.matchedThreatIntel ? (
              <Button
                label={reported ? "Thanks — indicator submitted" : "Report this link"}
                variant="secondary"
                loading={submitting}
                disabled={reported}
                onPress={() => void submitIndicator()}
                style={styles.reportBtn}
              />
            ) : null}
          </Card>
        ) : null}

        {localCheck ? (
          <Card>
            <Text style={styles.section}>Local check (URL never opened)</Text>
            {localCheck.valid ? (
              <Text style={styles.host}>{localCheck.host}</Text>
            ) : (
              <Text style={styles.muted}>The address doesn’t look like a complete URL.</Text>
            )}
            {localCheck.flags.length === 0 ? (
              <Text style={styles.okText}>
                No obvious red flags from the address alone.
              </Text>
            ) : (
              localCheck.flags.map((f, i) => (
                <View key={i} style={styles.flagRow}>
                  <Text style={styles.flagLabel}>{f.label}</Text>
                  <Badge
                    label={f.level}
                    tone={f.level === "HIGH" ? "danger" : f.level === "MEDIUM" ? "warn" : "neutral"}
                  />
                </View>
              ))
            )}
          </Card>
        ) : null}

        {result ? (
          <AnalysisResult result={result}>
            {result.status === "COMPLETED" ? (
              <Button
                label="Submit as a report"
                variant="secondary"
                onPress={submitReport}
                loading={submitting}
              />
            ) : null}
          </AnalysisResult>
        ) : null}

        <Text style={styles.disclaimer}>
          Never enter passwords or OTPs on a page reached from a link you didn’t
          verify. JAAL gives safety information, not legal advice.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.sm, gap: spacing.lg, paddingBottom: spacing.xxl },
  title: { fontSize: fontSize.xxl, fontWeight: "800", color: colors.deep },
  subtitle: { fontSize: fontSize.base, color: colors.muted, lineHeight: 24 },
  row: { flexDirection: "row", gap: spacing.sm },
  flex: { flex: 1 },
  section: { fontSize: fontSize.base, fontWeight: "800", color: colors.deep },
  host: { fontSize: fontSize.base, color: colors.text, fontWeight: "600" },
  muted: { fontSize: fontSize.sm, color: colors.muted },
  okText: { fontSize: fontSize.sm, color: colors.teal, fontWeight: "600" },
  flagRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  flagLabel: { fontSize: fontSize.sm, color: colors.text, flex: 1 },
  consentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.glass,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: spacing.md,
  },
  consentText: { flex: 1, gap: 2 },
  consentTitle: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: colors.text,
  },
  provBox: {
    backgroundColor: colors.glass,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: spacing.sm,
    gap: 2,
  },
  provLabel: {
    fontSize: fontSize.xs,
    fontWeight: "800",
    color: colors.deep,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  reportBtn: { marginTop: spacing.sm },
  disclaimer: { fontSize: fontSize.xs, color: colors.muted, textAlign: "center", lineHeight: 18 },
});
