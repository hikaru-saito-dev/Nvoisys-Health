import * as Localization from "expo-localization";

export const BASE_CURRENCY = "INR";

const CURRENCY_BY_REGION = {
  AE: "AED",
  AU: "AUD",
  CA: "CAD",
  EU: "EUR",
  GB: "GBP",
  IN: "INR",
  JP: "JPY",
  NZ: "NZD",
  SG: "SGD",
  US: "USD",
};

// Static approximate rates from INR. Replace with a server-fed rate table when needed.
export const INR_FX_RATES = {
  INR: 1,
  AED: 0.044,
  AUD: 0.018,
  CAD: 0.017,
  EUR: 0.011,
  GBP: 0.0095,
  JPY: 1.8,
  NZD: 0.02,
  SGD: 0.016,
  USD: 0.012,
};

export const CURRENCY_SYMBOLS = {
  INR: "₹",
  AED: "د.إ",
  AUD: "A$",
  CAD: "C$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  NZD: "NZ$",
  SGD: "S$",
  USD: "$",
};

function normalizeRegion(value) {
  return String(value || "").trim().toUpperCase();
}

function localeHasIndiaRegion(locale) {
  const region = normalizeRegion(locale?.regionCode);
  if (region === "IN") return true;
  const tag = String(locale?.languageTag || locale?.languageCode || "")
    .trim()
    .toUpperCase();
  return tag === "IN" || tag.endsWith("-IN") || tag.endsWith("_IN");
}

function timezoneLooksIndian(value) {
  const tz = String(value || "").trim().toLowerCase();
  return tz === "asia/kolkata" || tz === "asia/calcutta";
}

export function getUserCurrencyInfo() {
  const locales = Localization.getLocales?.() || [];
  const calendars = Localization.getCalendars?.() || [];
  const primary = locales[0] || {};
  const region = normalizeRegion(primary.regionCode);
  const rawCurrency = String(primary.currencyCode || "").toUpperCase();
  const hasIndiaSignal =
    locales.some(
      (locale) =>
        localeHasIndiaRegion(locale) ||
        String(locale?.currencyCode || "").toUpperCase() === BASE_CURRENCY,
    ) ||
    calendars.some((calendar) => timezoneLooksIndian(calendar?.timeZone)) ||
    timezoneLooksIndian(Intl.DateTimeFormat?.().resolvedOptions?.().timeZone);
  const currency = hasIndiaSignal
    ? BASE_CURRENCY
    : INR_FX_RATES[rawCurrency]
      ? rawCurrency
      : CURRENCY_BY_REGION[region] || BASE_CURRENCY;
  return {
    currency,
    region: hasIndiaSignal ? "IN" : region,
    symbol: CURRENCY_SYMBOLS[currency] || currency,
    rateFromInr: INR_FX_RATES[currency] || 1,
  };
}

export function convertInrToCurrency(amountInr, currencyInfo = getUserCurrencyInfo()) {
  const amount = Number(amountInr) || 0;
  const rate = Number(currencyInfo?.rateFromInr) || 1;
  return Math.max(0, Math.round(amount * rate));
}

export function formatCurrencyFromInr(amountInr, currencyInfo = getUserCurrencyInfo()) {
  const currency = currencyInfo?.currency || BASE_CURRENCY;
  const symbol = currencyInfo?.symbol || CURRENCY_SYMBOLS[currency] || currency;
  const converted = convertInrToCurrency(amountInr, currencyInfo);
  return `${symbol}${converted.toLocaleString()}`;
}

export function cashfreeAmountForInr(amountInr, currencyInfo = getUserCurrencyInfo()) {
  const currency = currencyInfo?.currency || BASE_CURRENCY;
  const amount = convertInrToCurrency(amountInr, currencyInfo);
  return {
    currency,
    amount,
    amountMinor: Math.max(100, Math.round(amount * 100)),
    baseCurrency: BASE_CURRENCY,
    baseAmountInr: Math.max(0, Math.round(Number(amountInr) || 0)),
    fxRateFromInr: Number(currencyInfo?.rateFromInr) || 1,
    approximate: currency !== BASE_CURRENCY,
  };
}
