import type { Locale } from "./messages";

export const currencies = ["USD", "UZS", "KRW"] as const;
export type Currency = typeof currencies[number];
export const packages = [
  { id: "STARTER", images: 1, usdCents: 50 },
  { id: "STANDARD", images: 10, usdCents: 400 },
  { id: "BUSINESS", images: 50, usdCents: 1500 },
] as const;
export type PackageId = typeof packages[number]["id"];
export type ExchangeRates = { USD: 1; UZS: number | null; KRW: number | null };

export function isCurrency(value: unknown): value is Currency {
  return typeof value === "string" && currencies.some(currency => currency === value);
}
export function parseExchangeRate(value: string | undefined): number | null {
  const text = value?.trim();
  if (!text || !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return null;
  const rate = Number(text);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}
// Explicit public build-time configuration, with no live feed or sample fallback.
export const exchangeRates: ExchangeRates = {
  USD: 1,
  UZS: parseExchangeRate(process.env.NEXT_PUBLIC_USD_TO_UZS),
  KRW: parseExchangeRate(process.env.NEXT_PUBLIC_USD_TO_KRW),
};
export function convertUsd(usdCents: number, currency: Currency, rates: ExchangeRates = exchangeRates): number | null {
  const rate = rates[currency];
  if (rate === null || !Number.isFinite(rate) || rate <= 0 || !Number.isSafeInteger(usdCents) || usdCents < 0) return null;
  const amount = usdCents / 100 * rate;
  return Number.isFinite(amount) && amount <= Number.MAX_SAFE_INTEGER ? amount : null;
}
export function formatMoney(amount: number, currency: Currency, locale: Locale): string {
  return new Intl.NumberFormat(locale, {
    style: "currency", currency, currencyDisplay: "symbol",
    minimumFractionDigits: currency === "USD" ? 2 : 0,
    maximumFractionDigits: currency === "USD" ? 2 : 0,
  }).format(amount);
}
