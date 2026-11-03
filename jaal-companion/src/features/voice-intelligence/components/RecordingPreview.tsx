import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { colors, fontSize, radius, spacing } from "../../../theme";
import { formatTimestamp } from "../../../services/voice-intelligence";

/**
 * Playback for the ORIGINAL recording.
 *
 * Used both for the local file before upload and for the stored recording after
 * upload (via a short-lived signed URL). Seeking is driven by real timestamps
 * from the transcript/findings — nothing here fabricates a position.
 */
export function RecordingPreview({
  uri,
  seekToMs,
  label = "Recording",
}: {
  uri: string;
  /** Jump to this real audio position (ms) when it changes. */
  seekToMs?: number | null;
  label?: string;
}) {
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    if (typeof seekToMs !== "number") return;
    // seekTo takes seconds; the timeline is in milliseconds.
    void player.seekTo(Math.max(0, seekToMs / 1000));
    player.play();
  }, [seekToMs, player]);

  const duration = status.duration ?? 0;
  const position = status.currentTime ?? 0;
  const progress = duration > 0 ? Math.min(1, position / duration) : 0;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Pressable
          onPress={() => (status.playing ? player.pause() : player.play())}
          accessibilityRole="button"
          accessibilityLabel={status.playing ? "Pause recording" : "Play recording"}
          style={({ pressed }) => [styles.playButton, pressed && styles.pressed]}
        >
          <Text style={styles.playIcon}>{status.playing ? "❚❚" : "▶"}</Text>
        </Pressable>

        <View style={styles.trackArea}>
          <View
            style={styles.track}
            accessibilityRole="progressbar"
            accessibilityLabel={`${label} playback progress`}
          >
            <View style={[styles.fill, { width: `${progress * 100}%` }]} />
          </View>
          <View style={styles.timeRow}>
            <Text style={styles.time}>{formatTimestamp(position * 1000) ?? "0:00"}</Text>
            <Text style={styles.time}>
              {duration > 0 ? formatTimestamp(duration * 1000) : "—"}
            </Text>
          </View>
        </View>
      </View>

      {!status.isLoaded ? (
        <Text style={styles.muted}>Loading audio…</Text>
      ) : null}
      <Text style={styles.caption}>
        This is the original recording, unchanged. JAAL does not alter it.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  playButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.85 },
  playIcon: { color: colors.white, fontSize: 18, fontWeight: "800" },
  trackArea: { flex: 1, gap: 4 },
  track: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.backgroundAlt,
    overflow: "hidden",
  },
  fill: { height: "100%", backgroundColor: colors.teal },
  timeRow: { flexDirection: "row", justifyContent: "space-between" },
  time: { fontSize: fontSize.sm, color: colors.muted, fontVariant: ["tabular-nums"] },
  muted: { fontSize: fontSize.sm, color: colors.muted },
  caption: { fontSize: fontSize.xs, color: colors.muted, lineHeight: 18 },
});
