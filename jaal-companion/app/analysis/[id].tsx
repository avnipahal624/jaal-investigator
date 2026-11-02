import { StyleSheet, ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "convex/react";
import type { Id } from "@convex-dataModel";
import { Screen } from "../../src/components/ui/Screen";
import { Card } from "../../src/components/ui/Card";
import { Badge } from "../../src/components/ui/Badge";
import { Button } from "../../src/components/ui/Button";
import { FullScreenLoading } from "../../src/components/FullScreenLoading";
import { api } from "../../src/services/api";
import { colors, fontSize, radius, spacing } from "../../src/theme";
import { formatDate, formatBytes } from "../../src/utils/format";

type Status = "NOT_STARTED" | "PROCESSING" | "COMPLETED" | "FAILED" | "UNAVAILABLE";

const ASSESSMENT: Record<string, { label: string; tone: "danger" | "warn" | "good" | "neutral" }> = {
  HIGH_CONCERN: { label: "High concern", tone: "danger" },
  WARNING_SIGNS_FOUND: { label: "Warning signs found", tone: "warn" },
  NO_OBVIOUS_WARNING_SIGNS: { label: "No obvious warning signs", tone: "good" },
  UNABLE_TO_ASSESS: { label: "Couldn’t assess", tone: "neutral" },
};

const STATUS_TEXT: Record<Status, string> = {
  NOT_STARTED: "Waiting to be analysed",
  PROCESSING: "Transcribing and analysing…",
  COMPLETED: "Analysis complete",
  FAILED: "Analysis couldn’t finish",
  UNAVAILABLE: "Analysis unavailable",
};

/**
 * Live view of one voice recording: transcription + analysis status, then the
 * assessment, findings and next steps once available. Never shows a numeric
 * risk score and never claims the report was filed with police.
 */
export default function RecordingAnalysis() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = (Array.isArray(params.id) ? params.id[0] : params.id) ?? "";
  const rec = useQuery(api.voice.getVoiceRecording, {
    recordingId: id as Id<"voice_recordings">,
  });

  if (!id || rec === undefined) return <FullScreenLoading />;
  if (rec === null) {
    return (
      <Screen>
        <Card>
          <Text style={styles.stateTitle}>Recording not found</Text>
          <Text style={styles.muted}>
            This recording doesn’t exist or belongs to another account.
          </Text>
        </Card>
      </Screen>
    );
  }

  const aStatus = rec.analysis.status as Status;
  const tStatus = rec.transcription.status as Status;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headRow}>
          <Text style={styles.title} numberOfLines={1}>
            {rec.fileName}
          </Text>
          <Badge label={STATUS_TEXT[aStatus]} tone={aStatus === "COMPLETED" ? "good" : "info"} />
        </View>
        <Text style={styles.meta}>
          {formatBytes(rec.sizeBytes)} · {formatDate(rec.createdAt)}
        </Text>

        {/* Consent is surfaced so the submitter can see what was recorded. */}
        <Card>
          <Text style={styles.section}>Consent</Text>
          <Text style={styles.muted}>
            You consented to upload this recording (version {rec.consentVersion}).
          </Text>
        </Card>

        {/* Transcription */}
        <Card>
          <View style={styles.rowBetween}>
            <Text style={styles.section}>Transcript</Text>
            <Badge label={STATUS_TEXT[tStatus]} tone={tStatus === "COMPLETED" ? "good" : "neutral"} />
          </View>
          {tStatus === "COMPLETED" && rec.transcript ? (
            <Text style={styles.transcript}>{rec.transcript}</Text>
          ) : tStatus === "UNAVAILABLE" || tStatus === "FAILED" ? (
            <Text style={styles.muted}>
              Transcription is {tStatus === "UNAVAILABLE" ? "not available" : "unavailable"} for this
              recording. You can still read what you told us below.
            </Text>
          ) : (
            <Text style={styles.muted}>Transcribing… this can take up to a minute.</Text>
          )}
          {rec.whatHappened ? (
            <View style={styles.note}>
              <Text style={styles.noteLabel}>What you told us</Text>
              <Text style={styles.muted}>{rec.whatHappened}</Text>
            </View>
          ) : null}
        </Card>

        {/* Analysis */}
        {aStatus === "COMPLETED" ? (
          <>
            <Card>
              <Text style={styles.section}>Assessment</Text>
              {rec.analysis.assessment ? (
                <View style={styles.assessRow}>
                  <Badge
                    label={ASSESSMENT[rec.analysis.assessment]?.label ?? rec.analysis.assessment}
                    tone={ASSESSMENT[rec.analysis.assessment]?.tone ?? "neutral"}
                  />
                </View>
              ) : null}
              {rec.analysis.summary ? (
                <Text style={styles.explanation}>{rec.analysis.summary}</Text>
              ) : null}
              {rec.analysis.limitations && rec.analysis.limitations.length > 0 ? (
                <View style={styles.limits}>
                  {rec.analysis.limitations.map((l, i) => (
                    <Text key={i} style={styles.limitText}>
                      • {l}
                    </Text>
                  ))}
                </View>
              ) : null}
            </Card>

            {rec.analysis.findings && rec.analysis.findings.length > 0 ? (
              <Card>
                <Text style={styles.section}>What we noticed</Text>
                {rec.analysis.findings.map((f, i) => (
                  <View key={f.id ?? i} style={styles.finding}>
                    <View style={styles.findingHead}>
                      <Text style={styles.findingTactic}>{f.tactic}</Text>
                      <Badge
                        label={f.severity}
                        tone={
                          f.severity === "high"
                            ? "danger"
                            : f.severity === "medium"
                              ? "warn"
                              : "neutral"
                        }
                      />
                    </View>
                    {f.excerpt ? <Text style={styles.excerpt}>“{f.excerpt}”</Text> : null}
                    <Text style={styles.muted}>{f.explanation}</Text>
                    <Text style={styles.action}>→ {f.recommendedAction}</Text>
                    <Text style={styles.source}>
                      {f.observed ? "Observed in your transcript" : "AI interpretation"}
                    </Text>
                  </View>
                ))}
              </Card>
            ) : null}

            {rec.analysis.recommendedSteps && rec.analysis.recommendedSteps.length > 0 ? (
              <Card>
                <Text style={styles.section}>What you can do</Text>
                {rec.analysis.recommendedSteps.map((s, i) => (
                  <View key={i} style={styles.stepRow}>
                    <Text style={styles.bullet}>•</Text>
                    <Text style={styles.stepText}>{s}</Text>
                  </View>
                ))}
              </Card>
            ) : null}
          </>
        ) : aStatus === "UNAVAILABLE" || aStatus === "FAILED" ? (
          <Card style={styles.stateCard}>
            <Text style={styles.stateEmoji}>{aStatus === "UNAVAILABLE" ? "⚠️" : "ℹ️"}</Text>
            <Text style={styles.stateTitle}>
              {aStatus === "UNAVAILABLE" ? "Analysis unavailable" : "Analysis couldn’t finish"}
            </Text>
            <Text style={styles.muted}>
              {rec.analysis.error ??
                (aStatus === "UNAVAILABLE"
                  ? "The analysis service isn’t configured right now. Your recording is saved and an investigator can still review it."
                  : "Something went wrong while analysing. Your recording is saved and an investigator can still review it.")}
            </Text>
          </Card>
        ) : (
          <Card style={styles.stateCard}>
            <Text style={styles.stateEmoji}>⏳</Text>
            <Text style={styles.stateTitle}>{STATUS_TEXT[aStatus]}</Text>
            <Text style={styles.muted}>
              We’ll show the assessment here as soon as it’s ready. This usually takes under a minute.
            </Text>
          </Card>
        )}

        <Text style={styles.disclaimer}>
          This is safety information, not legal advice. JAAL has not filed a police report and cannot
          guarantee recovery of money.
        </Text>

        <Button
          label="Analyse something else"
          variant="secondary"
          onPress={() => router.replace("/analyse")}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.sm, gap: spacing.md, paddingBottom: spacing.xxl },
  headRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { flex: 1, fontSize: fontSize.xl, fontWeight: "800", color: colors.deep },
  meta: { fontSize: fontSize.xs, color: colors.muted },
  section: { fontSize: fontSize.base, fontWeight: "800", color: colors.deep, marginBottom: spacing.xs },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  muted: { fontSize: fontSize.sm, color: colors.muted, lineHeight: 21 },
  transcript: { fontSize: fontSize.base, color: colors.text, lineHeight: 25 },
  note: { marginTop: spacing.md, gap: 4 },
  noteLabel: { fontSize: fontSize.xs, fontWeight: "700", color: colors.deep },
  assessRow: { flexDirection: "row", marginBottom: spacing.sm },
  explanation: { fontSize: fontSize.base, color: colors.text, lineHeight: 24 },
  limits: { marginTop: spacing.md, gap: 2 },
  limitText: { fontSize: fontSize.xs, color: colors.muted, lineHeight: 18 },
  finding: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  findingHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  findingTactic: { flex: 1, fontSize: fontSize.sm, fontWeight: "800", color: colors.deep },
  excerpt: {
    backgroundColor: colors.backgroundAlt,
    borderRadius: 10,
    padding: spacing.md,
    fontSize: fontSize.sm,
    color: colors.deep,
    fontStyle: "italic",
    lineHeight: 21,
  },
  action: { fontSize: fontSize.sm, color: colors.teal, fontWeight: "700", lineHeight: 21 },
  source: { fontSize: fontSize.xs, color: colors.muted },
  stepRow: { flexDirection: "row", gap: spacing.sm, paddingVertical: 3 },
  bullet: { fontSize: fontSize.base, color: colors.teal, fontWeight: "800" },
  stepText: { flex: 1, fontSize: fontSize.sm, color: colors.text, lineHeight: 21 },
  stateCard: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xl },
  stateEmoji: { fontSize: 36 },
  stateTitle: { fontSize: fontSize.lg, fontWeight: "800", color: colors.deep, textAlign: "center" },
  disclaimer: {
    fontSize: fontSize.xs,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 18,
    marginTop: spacing.sm,
  },
});
