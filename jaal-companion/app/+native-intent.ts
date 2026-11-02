/**
 * Expo Router native intent hook.
 *
 * The `expo-sharing` config plugin converts an inbound share (Android
 * ACTION_SEND or the iOS share extension) into a deep link whose authority is
 * `expo-sharing` — the shared text itself is NOT in this URL, it is read
 * separately with `useIncomingShare()` on the review screen.
 *
 * Without this redirect the synthesised link would land on an unmatched route,
 * so we send it to `/analyse/shared`, where the user reviews the content
 * before anything is analysed.
 */
export function redirectSystemPath(event: {
  path: string | null;
  initial: boolean;
}): string | null {
  const { path } = event;
  if (!path) return path;

  const authority = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/([^/?#]+)/.exec(path)?.[1];
  if (authority === "expo-sharing") return "/analyse/shared";

  return path;
}
