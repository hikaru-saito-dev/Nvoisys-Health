/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Dynamic Expo config — composes the static `app.json` and injects runtime
 * env values (AI api key) and any required native plugins.
 *
 * Expo's config loader calls this module with `({ config })`, where `config`
 * is the already-parsed `app.json`. Returning an object that spreads `config`
 * is what tells Expo (and `expo-doctor`) that the dynamic config is properly
 * extending the static one — without that hint the doctor warns that the
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
  // dotenv is optional — ignore resolution failures (e.g. EAS cloud build).
}

const aiApiKeyFromEnv = String(
  process.env.EXPO_PUBLIC_GROQ_API_KEY ||
    process.env.EXPO_PUBLIC_AI_API_KEY ||
    "",
).trim();

module.exports = ({ config }) => {
  // `config` is the parsed `app.json` (everything inside the `expo` key).
  // We spread it and override only the fields we need to compute at runtime.
  const baseExtra = (config && config.extra) || {};

  return {
    ...config,
    extra: {
      ...baseExtra,
      aiApiKey:
        aiApiKeyFromEnv ||
        String(baseExtra.aiApiKey || "").trim(),
    },
  };
};
