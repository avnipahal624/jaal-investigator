import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { ScrollView, StyleSheet, Text } from "react-native";
import { useAction, useMutation } from "convex/react";
import { AnalysisResult } from "../../src/components/AnalysisResult";
import { Button } from "../../src/components/ui/Button";
import { Screen } from "../../src/components/ui/Screen";
import { TextField } from "../../src/components/ui/TextField";
import { api } from "../../src/services/api";
import { colors, fontSize, spacing } from "../../src/theme";
import type { ConsumerAnalysisResult } from "../../src/types/analysis";

/** Paste a suspicious message and get a real, content-grounded assessment. */
export default function AnalyseText() {
  const analyse = useAction(api.assistantActions.analyseConsumerContent);
  const createReport = useMutation(api.consumer.createConsumerReport);

  // Pre-filled when arriving from the share sheet (review-before-analysis).
  const params = useLocalSearchParams<{ content?: string }>();
  const [content, setContent] = useState(
    typeof params.content === "string" ? params.content : "",
  );
  const [result, setResult] = useState<ConsumerAnalysisResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setError(null);
    if (content.trim().length < 3) {
      setError("Paste the message you want to check.");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const res = await analyse({ content, kind: "text" });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function submitReport() {
    if (!content.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await createReport({
        category: result?.category ?? "message",
        messageText: content.trim(),
        description: "Message submitted for review from the mobile app.",
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
        <Text style={styles.title}>Check a message</Text>
        <Text style={styles.subtitle}>
          Paste the SMS, chat, or email. We analyse the actual text — nothing is
          sent anywhere else.
        </Text>

        <TextField
          label="Message content"
          value={content}
          onChangeText={setContent}
          placeholder="Paste the suspicious message here…"
          multiline
          numberOfLines={8}
          error={error ?? undefined}
        />

        <Button label="Analyse message" onPress={run} loading={busy} />

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
          JAAL gives safety information, not legal advice.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.sm, gap: spacing.lg, paddingBottom: spacing.xxl },
  title: { fontSize: fontSize.xxl, fontWeight: "800", color: colors.deep },
  subtitle: { fontSize: fontSize.base, color: colors.muted, lineHeight: 24 },
  disclaimer: { fontSize: fontSize.xs, color: colors.muted, textAlign: "center" },
});
