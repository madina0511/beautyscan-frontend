"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { languages, messages, type Locale } from "@/lib/messages";
import { getAuthSnapshot, getServerAuthSnapshot, initializeSession, loadProfile, observeLogout, restoreSession, subscribeAuth } from "@/lib/auth-session";
import { getCurrency, getServerCurrency, setCurrency, subscribeCurrency } from "@/lib/currency-preference";
import type { Currency, PackageId } from "@/lib/pricing";
import { ProductProvider } from "./product-provider";

let fallbackLocale: Locale = "en";
function getLocale(): Locale {
  try {
    const saved = localStorage.getItem("beautyscan-language");
    if (saved && Object.hasOwn(languages, saved)) return saved as Locale;
  } catch { /* Storage is optional. */ }
  return fallbackLocale;
}
function subscribeLocale(callback: () => void) {
  window.addEventListener("beautyscan-language", callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("beautyscan-language", callback);
    window.removeEventListener("storage", callback);
  };
}
const SiteContext = createContext<{
  locale: Locale; setLocale: (locale: Locale) => void;
  auth: ReturnType<typeof getAuthSnapshot>;
  currency: Currency; setCurrency: (currency: Currency) => void;
  selectedPackage: PackageId | null; selectPackage: (id: PackageId | null) => void;
} | null>(null);

export function SiteProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(subscribeLocale, getLocale, () => "en" as Locale);
  const auth = useSyncExternalStore(subscribeAuth, getAuthSnapshot, getServerAuthSnapshot);
  const currency = useSyncExternalStore(subscribeCurrency, getCurrency, getServerCurrency);
  const [selectedPackage, selectPackage] = useState<PackageId | null>(null);
  useEffect(() => {
    void initializeSession();
    return observeLogout();
  }, []);
  useEffect(() => {
    if (auth.status === "authenticated" && auth.session?.profileStatus === "idle") void loadProfile();
  }, [auth.status, auth.session?.memberId, auth.session?.profileStatus]);
  useEffect(() => {
    if (auth.status !== "authenticated" || !auth.session) return;
    const expiresAt = auth.session.expiresAt;
    const refresh = () => { void restoreSession(); };
    const wake = () => {
      if (document.visibilityState === "visible" && Date.now() >= expiresAt - 30_000) refresh();
    };
    const timer = window.setTimeout(refresh, Math.max(1000, expiresAt - Date.now() - 30_000));
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [auth]);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  function setLocale(next: Locale) {
    fallbackLocale = next;
    try { localStorage.setItem("beautyscan-language", next); } catch { /* Continue without persistence. */ }
    window.dispatchEvent(new Event("beautyscan-language"));
  }
  return <SiteContext.Provider value={{ locale, setLocale, auth, currency, setCurrency, selectedPackage, selectPackage }}><ProductProvider key={auth.status === "authenticated" ? auth.session?.memberId : "anonymous"} authenticated={auth.status === "authenticated"}>{children}</ProductProvider></SiteContext.Provider>;
}

export function useSite() {
  const context = useContext(SiteContext);
  if (!context) throw new Error("SiteProvider is required");
  return { ...context, t: messages[context.locale] };
}
