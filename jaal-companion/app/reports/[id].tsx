import { router, useLocalSearchParams } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useQuery } from "convex/react";
import type { Id } from "@convex-dataModel";
import { Screen } from "../../src/components/ui/Screen";
import { Card } from "../../src/components/ui/Card";
import { Badge } from "../../src/components/ui/Badge";
import { Button } from "../../src/components/ui/Button";
import { FullScreenLoading } from "../../src/components/FullScreenLoading";
import { api } from "../../src/services/api";
import { colors, fontSize, spacing } from "../../src/theme";
import { formatDate, relativeTime } from "../../src/utils/format";
import type { ConsumerEvidence, ConsumerReport } from "../../src/types/consumer";

const STATUS_TONE: Record<string, "info" | "good" | "warn"> = {
  completed: "good",
  active: "info",
};

/** One submitted report: reference ID, status, details and its evidence. */
export default function ReportDetail() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = (Array.isArray(params.id) ? params.id[0] : params.id) ?? "";

  const reports = useQuery(api.consumer.consumerReports);
  const evidence = useQuery(api.consumer.getConsumerEvidence, {
    investigationId: id as Id<"investigations">,
  });

  if (reports === undefined) return <FullScreenLoading />;

  const report = (reports as ConsumerReport[]).find((r) => r._id === id);

  if (!report) {
    return (
      <Screen>
        <View style={styles.head}>
          <Button label="←" variant="ghost" onPress={() => router.back()} />
          <Text style={styles.title}>Report</Text>
        </View>
        <Card>
          <Text style={styles.stateTitle}>Report not found</Text>
          <Text style={styles.muted}>
            This report doesn’t exist or belongs to another account.
          </Text>
        </Card>
      </Screen>
    );
  }

  const items = (evidence ?? []) as ConsumerEvidence[];

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.head}>
          <Button label="←" variant="ghost" onPress={() => router.back()} />
          <Text style={styles.title}>Report</Text>
        </View>

        {/* Reference ID + status — what the user quotes to an investigator. */}
        <Card>
          <Text style={styles.label}>Reference ID</Text>
          <Text style={styles.caseId}>{report.caseId}</Text>
          <View style={styles.badges}>
            <Badge label={report.category} tone="info" />
            <Badge
              label={report.status}
              tone={STATUS_TONE[report.status] ?? "info"}
            />
          </View>
          <Text style={styles.muted}>Submitted {relativeTime(report.createdAt)}</Text>
        </Card>

        <Card>
          <Text style={styles.section}>What you reported</Text>
          <Text style={styles.reportTitle}>{report.title}</Text>
          {report.description ? (
            <Text style={styles.body}>{report.description}</Text>
          ) : null}
          <Text style={styles.muted}>Last activity {formatDate(report.lastActivityAt ?? report.createdAt)}</Text>
        </Card>

        <Card>
          <View style={styles.rowBetween}>
            <Text style={styles.section}>Evidence</Text>
            <Badge label={`${items.length} item${items.length === 1 ? "" : "s"}`} tone="neutral" />
          </View>
          {evidence === undefined ? (
            <Text style={styles.muted}>Loading evidence…</Text>
          ) : items.length === 0 ? (
            <Text style={styles.muted}>
              No separate evidence items were attached to this report.
            </Text>
          ) : (
            items.map((e) => (
              <View key={e._id} style={styles.evidence}>
                <View style={styles.rowBetween}>
                  <Text style={styles.evidenceLabel} numberOfLines={2}>
                    {e.label ?? e.evidenceType ?? "Evidence"}
                  </Text>
                  {e.integrityStatus ? (
                    <Badge label={e.integrityStatus} tone="neutral" />
                  ) : null}
                </View>
                {e.content || e.sourceMessageText || e.extractedValue ? (
                  <Text style={styles.evidenceBody} numberOfLines={6}>
                    {e.extractedValue ?? e.sourceMessageText ?? e.content}
                  </Text>
                ) : null}
                {e.notes ? <Text style={styles.muted}>{e.notes}</Text> : null}
                <Text style={styles.muted}>{relativeTime(e.createdAt)}</Text>
              </View>
            ))
          )}
        </Card>

        <Text style={styles.disclaimer}>
          This report has been stored for the JAAL investigator team. It has not
          been filed with the police, and JAAL cannot guarantee recovery of money.
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
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { fontSize: fontSize.xxl, fontWeight: "800", color: colors.deep },
  label: { fontSize: fontSize.xs, fontWeight: "700", color: colors.muted },
  caseId: { fontSize: fontSize.lg, fontWeight: "800", color: colors.deep, letterSpacing: 0.5 },
  badges: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  section: { fontSize: fontSize.base, fontWeight: "800", color: colors.deep, marginBottom: spacing.xs },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  reportTitle: { fontSize: fontSize.base, fontWeight: "700", color: colors.text, lineHeight: 24 },
  body: { fontSize: fontSize.base, color: colors.text, lineHeight: 24, marginTop: spacing.xs },
  muted: { fontSize: fontSize.sm, color: colors.muted, lineHeight: 21 },
  evidence: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  evidenceLabel: { flex: 1, fontSize: fontSize.sm, fontWeight: "700", color: colors.deep },
  evidenceBody: { fontSize: fontSize.sm, color: colors.text, lineHeight: 21 },
  stateTitle: { fontSize: fontSize.lg, fontWeight: "800", color: colors.deep },
  disclaimer: { fontSize: fontSize.xs, color: colors.muted, textAlign: "center", lineHeight: 18 },
});
