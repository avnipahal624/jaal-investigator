/**
 * Convex deployment for JAAL Companion.
 *
 * This is the PUBLIC client endpoint of the existing JAAL backend (not a
 * secret). Metro inlines EXPO_PUBLIC_* variables at build time. Override with
 * EXPO_PUBLIC_CONVEX_URL to point at a different deployment (e.g. prod).
 *
 *   dev  (default): https://third-hare-597.convex.cloud
 *   prod           : https://avid-vulture-295.convex.cloud
 */
export const CONVEX_URL =
  process.env.EXPO_PUBLIC_CONVEX_URL ?? "https://third-hare-597.convex.cloud";
