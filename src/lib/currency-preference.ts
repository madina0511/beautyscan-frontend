import { isCurrency, type Currency } from "./pricing";

const storageKey = "beautyscan-currency";
const eventName = "beautyscan-currency-change";
let fallback: Currency = "USD";
let memoryOnly = false;
export function getCurrency(): Currency {
  if (memoryOnly) return fallback;
  try {
    const saved = localStorage.getItem(storageKey);
    return isCurrency(saved) ? saved : "USD";
  } catch { /* Preferences still work when browser storage is unavailable. */ }
  return fallback;
}
export const getServerCurrency = (): Currency => "USD";
export function setCurrency(currency: Currency) {
  if (!isCurrency(currency)) return;
  fallback = currency;
  try { localStorage.setItem(storageKey, currency); memoryOnly = false; } catch { memoryOnly = true; }
  window.dispatchEvent(new Event(eventName));
}
export function subscribeCurrency(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === storageKey || event.key === null) { memoryOnly = false; listener(); }
  };
  window.addEventListener(eventName, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(eventName, listener);
    window.removeEventListener("storage", onStorage);
  };
}
