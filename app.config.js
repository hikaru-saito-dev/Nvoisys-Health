/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Dynamic Expo config - composes the static `app.json` and injects runtime
 * env values (AI api key) and any required native plugins.
 *
 * Expo's config loader calls this module with `({ config })`, where `config`
 * is the already-parsed `app.json`. Returning an object that spreads `config`
 * is what tells Expo (and `expo-doctor`) that the dynamic config is properly
 * extending the static one - without that hint the doctor warns that the
 * two files might be out of sync.
 *
 * Local dev / `eas build --local`:
 *   - Values come from `.env` (loaded here via dotenv).
 * EAS cloud builds:
 *   - `.env` is not in git. Set `EXPO_PUBLIC_GROQ_API_KEY` (or
 *     `EXPO_PUBLIC_AI_API_KEY`) on the project in Expo → Environment
 *     variables for the build profile, so it exists in `process.env` when
 *     this file runs and when Metro bundles the app.
 */
const path = require("path");

try {
  require("dotenv").config({ path: path.join(__dirname, ".env") });
} catch {
  // dotenv is optional - ignore resolution failures (e.g. EAS cloud build).
}

const aiBaseUrlFromEnv = String(
  process.env.EXPO_PUBLIC_AI_BASE_URL ||
    process.env.EXPO_PUBLIC_GROQ_URL ||
    process.env.GROQ_URL ||
    "",
).trim();

const aiModelFromEnv = String(
  process.env.EXPO_PUBLIC_AI_MODEL ||
    process.env.EXPO_PUBLIC_GROQ_MODEL ||
    process.env.GROQ_MODEL ||
    "",
).trim();

const aiApiKeyFromEnv = String(
  process.env.EXPO_PUBLIC_GROQ_API_KEY ||
    process.env.EXPO_PUBLIC_AI_API_KEY ||
    process.env.EXPO_PUBLIC_GROQ_KEY ||
    process.env.GROQ_KEY ||
    "",
).trim();

module.exports = ({ config }) => {
  // `config` is the parsed `app.json` (everything inside the `expo` key).
  // We spread it and override only the fields we need to compute at runtime.
  const baseExtra = (config && config.extra) || {};
  const basePlugins = Array.isArray(config.plugins) ? [...config.plugins] : [];
  // LDPlayer / most Android emulators are x86_64; default EAS APKs are often
  // ARM-only and will not install or run there.
  const androidAbiPlugin = [
    "expo-build-properties",
    {
      android: {
        usesCleartextTraffic: true,
        reactNativeArchitectures: [
          "armeabi-v7a",
          "arm64-v8a",
          "x86",
          "x86_64",
        ],
      },
    },
  ];

  return {
    ...config,
    plugins: [...basePlugins, "expo-sharing", "expo-localization", androidAbiPlugin],
    extra: {
      ...baseExtra,
      aiBaseUrl:
        aiBaseUrlFromEnv ||
        String(baseExtra.aiBaseUrl || "").trim(),
      aiModel:
        aiModelFromEnv ||
        String(baseExtra.aiModel || "").trim(),
      aiApiKey:
        aiApiKeyFromEnv ||
        String(baseExtra.aiApiKey || "").trim(),
    },
  };
};
