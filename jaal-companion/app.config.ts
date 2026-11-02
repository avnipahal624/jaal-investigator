import type { ExpoConfig, ConfigContext } from "expo/config";

/**
 * JAAL Companion — consumer-facing safety companion for Android + iOS.
 *
 * Connects to the EXISTING JAAL Convex backend (no second database). The
 * deployment URL is public (it is the client endpoint, not a secret); it can
 * be overridden per environment with EXPO_PUBLIC_CONVEX_URL. Defaults to the
 * JAAL dev deployment so local development talks to the same backend as the
 * investigator web app.
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "JAAL Companion",
  slug: "jaal-companion",
  version: "1.0.0",
  orientation: "portrait",
  scheme: "jaalcompanion",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.jaal.companion",
  },
  android: {
    package: "com.jaal.companion",
    adaptiveIcon: {
      backgroundColor: "#EAF3FF",
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    favicon: "./assets/favicon.png",
    bundler: "metro",
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-audio",
    "expo-splash-screen",
  ],
  extra: {
    convexUrl:
      process.env.EXPO_PUBLIC_CONVEX_URL ?? "https://third-hare-597.convex.cloud",
  },
});
