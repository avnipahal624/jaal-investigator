import { router } from "expo-router";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { useQuery } from "convex/react";
import { ReportRow } from "../../src/components/ReportRow";
import { Card } from "../../src/components/ui/Card";
import { Screen } from "../../src/components/ui/Screen";
import { api } from "../../src/services/api";
import { colors, fontSize, spacing } from "../../src/theme";
import type { ConsumerReport } from "../../src/types/consumer";

/** Full list of the signed-in consumer's reports, newest first. */
export default function Activity() {
  const reports = useQuery(api.consumer.consumerReports) as
    | ConsumerReport[]
    | undefined;

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <Text style={styles.title}>Your activity</Text>
        <Text style={styles.subtitle}>Every report you’ve submitted to JAAL.</Text>
      </View>

      {reports === undefined ? (
        <View style={styles.pad}>
          <Card>
            <Text style={styles.muted}>Loading…</Text>
          </Card>
        </View>
      ) : reports.length === 0 ? (
        <View style={styles.pad}>
          <Card>
            <Text style={styles.emptyTitle}>Nothing here yet</Text>
            <Text style={styles.muted}>
              Analyse or report something and it will appear in this list.
            </Text>
          </Card>
        </View>
      ) : (
        <FlatList
          data={reports}
          keyExtractor={(r) => r._id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <ReportRow
              report={item}
              onPress={() => router.push(`/reports/${item._id}`)}
            />
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: spacing.sm, paddingBottom: spacing.md, gap: 2 },
  title: { fontSize: fontSize.xxl, fontWeight: "800", color: colors.deep },
  subtitle: { fontSize: fontSize.sm, color: colors.muted },
  pad: { paddingHorizontal: spacing.xl },
  list: { paddingHorizontal: spacing.xl, gap: spacing.sm, paddingBottom: spacing.xxl },
  muted: { fontSize: fontSize.sm, color: colors.muted, lineHeight: 20 },
  emptyTitle: { fontSize: fontSize.base, fontWeight: "700", color: colors.text },
});
