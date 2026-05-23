export const BASE_CURRENCY = "INR";

const CURRENCY_BY_COUNTRY = {
  AE: "AED",
  AU: "AUD",
  CA: "CAD",
  GB: "GBP",
  IN: "INR",
  JP: "JPY",
  NZ: "NZD",
  SG: "SGD",
  US: "USD",
  AD: "EUR",
  AT: "EUR",
  BE: "EUR",
  CY: "EUR",
  DE: "EUR",
  EE: "EUR",
  ES: "EUR",
  EU: "EUR",
  FI: "EUR",
  FR: "EUR",
  GR: "EUR",
  HR: "EUR",
  IE: "EUR",
  IT: "EUR",
  LT: "EUR",
  LU: "EUR",
  LV: "EUR",
  MC: "EUR",
  MT: "EUR",
  NL: "EUR",
  PT: "EUR",
  SI: "EUR",
  SK: "EUR",
  SM: "EUR",
  VA: "EUR",
};

const COUNTRY_ALIASES = {
  AMERICA: "US",
  AUSTRALIA: "AU",
  BHARAT: "IN",
  BRITAIN: "GB",
  CANADA: "CA",
  ENGLAND: "GB",
  INDIA: "IN",
  JAPAN: "JP",
  NEWZEALAND: "NZ",
  SINGAPORE: "SG",
  UK: "GB",
  UAE: "AE",
  UNITEDARABEMIRATES: "AE",
  UNITEDKINGDOM: "GB",
  UNITEDSTATES: "US",
  UNITEDSTATESOFAMERICA: "US",
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

let userCountry = "";

function normalizeCountryKey(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
}

function countryCodeFromInput(country) {
  const key = normalizeCountryKey(country);
  if (!key) return "";
  if (CURRENCY_BY_COUNTRY[key]) return key;
  return COUNTRY_ALIASES[key] || "";
}

export function setUserCurrencyCountry(country) {
  userCountry = String(country || "").trim();
}

export function getCurrencyInfoForCountry(country) {
  const region = countryCodeFromInput(country);
  const currency = CURRENCY_BY_COUNTRY[region] || BASE_CURRENCY;
  return {
    currency,
    country: String(country || "").trim(),
    region: region || "IN",
    symbol: CURRENCY_SYMBOLS[currency] || currency,
    rateFromInr: INR_FX_RATES[currency] || 1,
  };
}

export function getUserCurrencyInfo(countryOverride = null) {
  return getCurrencyInfoForCountry(countryOverride ?? userCountry);
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
