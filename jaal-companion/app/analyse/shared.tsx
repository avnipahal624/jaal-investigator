import { useEffect, useState } from "react";
import { router } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useIncomingShare } from "expo-sharing";
import { Screen } from "../../src/components/ui/Screen";
import { Card } from "../../src/components/ui/Card";
import { Badge } from "../../src/components/ui/Badge";
import { Button } from "../../src/components/ui/Button";
import { TextField } from "../../src/components/ui/TextField";
import { colors, fontSize, spacing } from "../../src/theme";

const URL_LIKE = /^https?:\/\/\S+$/i;

/**
 * Content shared into JAAL from another app (share sheet).
 *
 * Nothing is analysed on arrival: the shared text is shown for review and can
 * be edited first — the user explicitly chooses what to analyse. This is the
 * only screen that reads an inbound share payload.
 */
export default function SharedContent() {
  const { sharedPayloads, isResolving, error, clearSharedPayloads } =
    useIncomingShare();

  const [text, setText] = useState("");
  const [taken, setTaken] = useState(false);

  // Seed the editor once from the first text/url payload.
  useEffect(() => {
    if (taken) return;
    const payload =
      sharedPayloads.find(
        (p) => p.shareType === "text" || p.shareType === "url",
      ) ?? sharedPayloads[0];
    if (payload?.value) {
      setText(payload.value);
      setTaken(true);
    }
  }, [sharedPayloads, taken]);

  const value = text.trim();
  const isUrl = URL_LIKE.test(value);

  function go(pathname: "/analyse/text" | "/analyse/link") {
    const params = pathname === "/analyse/link" ? { url: value } : { content: value };
    clearSharedPayloads();
    router.replace({ pathname, params });
  }

  function discard() {
    clearSharedPayloads();
    router.replace("/(tabs)/home");
  }

  if (!isResolving && !error && taken === false && sharedPayloads.length === 0) {
    return (
      <Screen>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Nothing was shared</Text>
          <Card>
            <Text style={styles.muted}>
              Select some text or a link in another app, tap Share, then choose
              JAAL Companion. You’ll be able to review it here before anything
              is analysed.
            </Text>
          </Card>
          <Button label="Back to home" onPress={() => router.replace("/(tabs)/home")} />
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.head}>
          <Text style={styles.title}>Review before analysing</Text>
          <Badge
            label={isUrl ? "Link detected" : "Message detected"}
            tone="info"
          />
        </View>
        <Text style={styles.subtitle}>
          This came from another app. Check it’s what you expect — you can edit
          it — and nothing is analysed until you choose to.
        </Text>

        {isResolving ? (
          <Text style={styles.muted}>Preparing the shared content…</Text>
        ) : null}
        {error ? (
          <Card>
            <Text style={styles.muted}>
              The shared content couldn’t be read fully. You can still paste it
              below.
            </Text>
          </Card>
        ) : null}

        <TextField
          label="Shared content"
          value={text}
          onChangeText={setText}
          placeholder="Shared text appears here…"
          multiline
          numberOfLines={8}
        />

        <Button
          label={isUrl ? "Check this link" : "Analyse this message"}
          onPress={() => go(isUrl ? "/analyse/link" : "/analyse/text")}
          disabled={!value}
        />
        <Button label="Analyse it as a message instead" variant="secondary" onPress={() => go("/analyse/text")} disabled={!value || !isUrl} />
        <Button label="Discard" variant="ghost" onPress={discard} />

        <Text style={styles.disclaimer}>
          JAAL never opens a link you share — it is only read as text. Safety
          information, not legal advice.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.sm, gap: spacing.lg, paddingBottom: spacing.xxl },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  title: { fontSize: fontSize.xxl, fontWeight: "800", color: colors.deep },
  subtitle: { fontSize: fontSize.base, color: colors.muted, lineHeight: 24 },
  muted: { fontSize: fontSize.sm, color: colors.muted, lineHeight: 21 },
  disclaimer: { fontSize: fontSize.xs, color: colors.muted, textAlign: "center", lineHeight: 18 },
});
