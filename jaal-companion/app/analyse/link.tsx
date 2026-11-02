import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useAction, useMutation } from "convex/react";
import { AnalysisResult } from "../../src/components/AnalysisResult";
import { Badge } from "../../src/components/ui/Badge";
import { Button } from "../../src/components/ui/Button";
import { Card } from "../../src/components/ui/Card";
import { Screen } from "../../src/components/ui/Screen";
import { TextField } from "../../src/components/ui/TextField";
import { api } from "../../src/services/api";
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

  // Pre-filled when arriving from the share sheet (review-before-analysis).
  const params = useLocalSearchParams<{ url?: string }>();
  const [url, setUrl] = useState(
    typeof params.url === "string" ? params.url : "",
  );
  const [localCheck, setLocalCheck] = useState<LinkCheck | null>(null);
  const [result, setResult] = useState<ConsumerAnalysisResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function runLocal() {
    setError(null);
    if (!url.trim()) {
      setError("Paste a link to check.");
      return;
    }
    setLocalCheck(checkLink(url));
    setResult(null);
  }

  async function runAi() {
    setError(null);
    if (!url.trim()) {
      setError("Paste a link to check.");
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
          <Button label="Check address" variant="secondary" onPress={runLocal} style={styles.flex} />
          <Button label="Analyse with AI" onPress={runAi} loading={busy} style={styles.flex} />
        </View>

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
  disclaimer: { fontSize: fontSize.xs, color: colors.muted, textAlign: "center", lineHeight: 18 },
});
