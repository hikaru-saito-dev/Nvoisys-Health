/**
 * AI assistant settings — API key and endpoints come from `.env` via app.config.js
 * (dotenv → expo.extra) and EXPO_PUBLIC_* vars at Metro bundle time.
 *
 * In `.env` set:
 *   EXPO_PUBLIC_AI_API_KEY=sk-...
 *   EXPO_PUBLIC_AI_BASE_URL=https://api.openai.com/v1/chat/completions
 *   EXPO_PUBLIC_AI_MODEL=gpt-4o-mini
 */
import Constants from "expo-constants";

export const AI_CONFIG_DEFAULTS = {
  baseUrl: "https://api.openai.com/v1/chat/completions",
  predictUrl: "https://ai.nvoisyshealth.com/predict",
  model: "gpt-4o-mini",
  apiKey: "",
};

export const AI_CHAT_MAX_TOKENS = 768;
export const AI_CHAT_TEMPERATURE = 0.4;
export const AI_OLLAMA_NUM_CTX = 2048;
export const AI_OLLAMA_NUM_BATCH = 512;
export const AI_CHAT_TIMEOUT_MS = 45000;
export const AI_PREDICT_TIMEOUT_MS = 30000;

const getExpoExtra = () =>
  Constants?.expoConfig?.extra ||
  Constants?.manifest?.extra ||
  Constants?.manifest2?.extra?.expoClient?.extra ||
  Constants?.manifest2?.extra ||
  {};

/** Read OpenAI key from .env (injected into expo.extra by app.config.js). */
export const getAiApiKey = () => {
  const fromExtra = String(getExpoExtra()?.aiApiKey || "").trim();
  const fromEnv = String(
    process.env.EXPO_PUBLIC_AI_API_KEY ||
      process.env.EXPO_PUBLIC_GROQ_API_KEY ||
      process.env.OPENAI_API_KEY ||
      "",
  ).trim();
  return fromExtra || fromEnv || AI_CONFIG_DEFAULTS.apiKey;
};

export const getAiRuntimeConfig = () => {
  const extra = getExpoExtra();
  const baseUrl =
    String(
      extra?.aiBaseUrl ||
        process.env.EXPO_PUBLIC_AI_BASE_URL ||
        AI_CONFIG_DEFAULTS.baseUrl,
    ).trim() || AI_CONFIG_DEFAULTS.baseUrl;
  const predictUrl =
    String(
      extra?.aiPredictUrl ||
        process.env.EXPO_PUBLIC_AI_PREDICT_URL ||
        AI_CONFIG_DEFAULTS.predictUrl,
    ).trim() || AI_CONFIG_DEFAULTS.predictUrl;
  const model =
    String(
      extra?.aiModel ||
        process.env.EXPO_PUBLIC_AI_MODEL ||
        process.env.EXPO_PUBLIC_GROQ_MODEL ||
        AI_CONFIG_DEFAULTS.model,
    ).trim() || AI_CONFIG_DEFAULTS.model;
  let apiKey = getAiApiKey();
  if (baseUrl.includes("ais.nvoisyshealth.com") && /^gsk_/i.test(apiKey)) {
    apiKey = AI_CONFIG_DEFAULTS.apiKey;
  }
  const useMlPredict = extra?.aiUseMlPredict === true;
  return { baseUrl, predictUrl, model, apiKey, useMlPredict };
};
