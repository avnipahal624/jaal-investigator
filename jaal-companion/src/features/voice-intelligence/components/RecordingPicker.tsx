import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { colors, fontSize, radius, spacing } from "../../../theme";
import type { VoiceFile } from "../../../types/voice";
import { formatBytes } from "../../../services/voice-intelligence";
import { pickRecording } from "../services/recording-service";

/**
 * Step 1 — choose a recording.
 *
 * Validation (type, size) happens before the file is accepted, so an
 * unsupported or oversized file is rejected with a reason instead of being
 * carried into the upload flow and failing later.
 */
export function RecordingPicker({
  file,
  onSelect,
  onRemove,
  disabled = false,
}: {
  file: VoiceFile | null;
  onSelect: (file: VoiceFile) => void;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  async function choose() {
    setError(null);
    setPicking(true);
    try {
      const result = await pickRecording();
      if (result.status === "cancelled") return;
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      onSelect(result.file);
    } finally {
      setPicking(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.step}>Step 1 · Choose a recording</Text>
      <Text style={styles.help}>
        Pick a call recording or voice note from this device. MP3, M4A, WAV, AAC,
        OGG, WebM and AMR up to 25 MB.
      </Text>

      {file ? (
        <Card>
          <View style={styles.fileRow}>
            <Text style={styles.fileIcon}>🎧</Text>
            <View style={styles.fileText}>
              <Text style={styles.fileName} numberOfLines={2}>
                {file.name}
              </Text>
              <Text style={styles.fileMeta}>
                {file.sizeBytes > 0 ? formatBytes(file.sizeBytes) : "Audio file"} ·{" "}
                {file.mimeType}
              </Text>
            </View>
          </View>
          <View style={styles.actions}>
            <Button
              label="Choose another"
              variant="secondary"
              onPress={choose}
              loading={picking}
              disabled={disabled}
              style={styles.action}
            />
            <Pressable
              onPress={onRemove}
              accessibilityRole="button"
              accessibilityLabel="Remove this recording"
              disabled={disabled}
              style={styles.remove}
            >
              <Text style={styles.removeText}>Remove</Text>
            </Pressable>
          </View>
        </Card>
      ) : (
        <Button
          label="Choose a recording"
          onPress={choose}
          loading={picking}
          disabled={disabled}
        />
      )}

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  step: { fontSize: fontSize.lg, fontWeight: "800", color: colors.deep },
  help: { fontSize: fontSize.base, color: colors.muted, lineHeight: 24 },
  fileRow: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
  fileIcon: { fontSize: 28 },
  fileText: { flex: 1, gap: 2 },
  fileName: { fontSize: fontSize.base, fontWeight: "700", color: colors.text },
  fileMeta: { fontSize: fontSize.sm, color: colors.muted },
  actions: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  action: { flex: 1 },
  remove: {
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  removeText: { fontSize: fontSize.base, fontWeight: "700", color: colors.danger },
  errorBox: {
    backgroundColor: "#FADBD8",
    borderRadius: radius.md,
    padding: spacing.md,
  },
  errorText: { fontSize: fontSize.sm, color: colors.danger, lineHeight: 20 },
});
