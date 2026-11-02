import { useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ScrollViewInstance,
} from "react-native";
import { router } from "expo-router";
import { useAction } from "convex/react";
import { Button } from "../src/components/ui/Button";
import { RequireAuth } from "../src/components/auth-gate";
import { Screen } from "../src/components/ui/Screen";
import { api } from "../src/services/api";
import { colors, fontSize, radius, spacing } from "../src/theme";

type Msg = { role: "user" | "assistant"; text: string };

const SUGGESTIONS = [
  "Is this message a scam? “Your bank account is blocked, verify now.”",
  "Someone asked for my OTP — what should I do?",
  "A link says I won a prize. Should I open it?",
];

/**
 * JAAL Safety Assistant — real AI (the `safetyChatAction` Anthropic action).
 * The conversation history is sent with each turn so replies stay in context.
 * Honest UNAVAILABLE / failure states are surfaced, never faked.
 */
export default function Assistant() {
  const sendAction = useAction(api.assistantActions.safetyChatAction);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollViewInstance>(null);

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    setError(null);
    setInput("");
    const history = messages;
    setMessages((m) => [...m, { role: "user", text: question }]);
    setBusy(true);
    try {
      const res = await sendAction({ question, history });
      if (res.status === "COMPLETED") {
        setMessages((m) => [...m, { role: "assistant", text: res.reply }]);
      } else {
        setError(res.error ?? "The assistant could not respond right now.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
      requestAnimationFrame(() =>
        scrollRef.current?.scrollToEnd({ animated: true }),
      );
    }
  }

  return (
    <RequireAuth>
    <Screen padded={false}>
      <View style={styles.header}>
        <Button label="←" variant="ghost" onPress={() => router.back()} />
        <View style={styles.headerText}>
          <Text style={styles.title}>Safety Assistant</Text>
          <Text style={styles.subtitle}>Real answers about your situation</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={90}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.messages}
          onContentSizeChange={() =>
            scrollRef.current?.scrollToEnd({ animated: true })
          }
        >
          {messages.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>💬</Text>
              <Text style={styles.emptyTitle}>Ask me anything</Text>
              <Text style={styles.emptyBody}>
                Paste a suspicious message or describe what happened. I analyse
                the actual content you share.
              </Text>
              {SUGGESTIONS.map((s) => (
                <Button
                  key={s}
                  label={s}
                  variant="secondary"
                  style={styles.suggestion}
                  onPress={() => send(s)}
                />
              ))}
            </View>
          ) : (
            messages.map((m, i) => (
              <View
                key={i}
                style={[
                  styles.bubble,
                  m.role === "user" ? styles.userBubble : styles.aiBubble,
                ]}
              >
                <Text
                  style={[
                    styles.bubbleText,
                    m.role === "user" ? styles.userText : styles.aiText,
                  ]}
                >
                  {m.text}
                </Text>
              </View>
            ))
          )}

          {busy ? (
            <View style={[styles.bubble, styles.aiBubble]}>
              <Text style={[styles.bubbleText, styles.aiText]}>Thinking…</Text>
            </View>
          ) : null}

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Ask about a message, call, or link…"
            placeholderTextColor={colors.muted}
            multiline
            editable={!busy}
          />
          <Button
            label="Send"
            onPress={() => send(input)}
            loading={busy}
            disabled={!input.trim()}
            style={styles.sendBtn}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.glass,
  },
  headerText: { flex: 1 },
  title: { fontSize: fontSize.lg, fontWeight: "800", color: colors.deep },
  subtitle: { fontSize: fontSize.xs, color: colors.muted },
  messages: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xl },
  empty: { alignItems: "center", gap: spacing.sm, paddingTop: spacing.xl },
  emptyEmoji: { fontSize: 44 },
  emptyTitle: { fontSize: fontSize.xl, fontWeight: "800", color: colors.deep },
  emptyBody: {
    fontSize: fontSize.sm,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 21,
    marginBottom: spacing.sm,
  },
  suggestion: { width: "100%" },
  bubble: {
    maxWidth: "88%",
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  userBubble: { alignSelf: "flex-end", backgroundColor: colors.primary },
  aiBubble: { alignSelf: "flex-start", backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  bubbleText: { fontSize: fontSize.base, lineHeight: 22 },
  userText: { color: colors.white },
  aiText: { color: colors.text },
  errorBox: {
    backgroundColor: "#FADBD8",
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  errorText: { fontSize: fontSize.sm, color: colors.danger },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.white,
  },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 120,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: fontSize.base,
    color: colors.text,
  },
  sendBtn: { paddingHorizontal: spacing.lg },
});
