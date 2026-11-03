"use client";

import Link from "next/link";
import { languages, type Locale } from "@/lib/messages";
import { myPageMessages } from "@/lib/mypage-messages";
import { currencies, type Currency } from "@/lib/pricing";
import { pricingMessages } from "@/lib/pricing-messages";
import { logout, restoreSession } from "@/lib/auth-session";
import { useSite } from "./site-provider";

export function Brand() {
  return <Link href="/" className="brand" aria-label="BeautyScan AI"><span className="brand-mark" aria-hidden="true">✳</span> BeautyScan<span className="brand-ai">AI</span></Link>;
}

export function Header() {
  const { t, locale, setLocale, auth, currency, setCurrency } = useSite();
  const p = pricingMessages[locale];
  async function handleLogout() {
    try {
      await logout();
    } catch { /* The shared auth state exposes the translated logout error. */ }
  }
  return <><a href="#main" className="skip-link">{t.skip}</a><header className="site-header"><div className="nav-wrap">
    <Brand /><nav className="main-nav" aria-label={t.studio}><Link href="/#workspace">{t.studio}</Link><Link href="/#how-it-works">{t.how}</Link><Link href="/pricing">{p.pricing}</Link>{auth.status === "authenticated" && <Link href="/mypage">{myPageMessages[locale].myPage}</Link>}</nav>
    <div className="nav-actions"><label className="language-select"><span aria-hidden="true">◎</span><span className="sr-only">{t.language}</span><select value={locale} onChange={e => setLocale(e.target.value as Locale)}>{Object.entries(languages).map(([key, label]) => <option key={key} value={key} lang={key}>{label}</option>)}</select></label>
      <label className="currency-select"><span className="sr-only">{p.currency}</span><select value={currency} onChange={e => setCurrency(e.target.value as Currency)}>{currencies.map(code => <option key={code} value={code}>{p[code.toLowerCase() as "usd" | "uzs" | "krw"]}</option>)}</select></label>
      {auth.status === "restoring" || auth.status === "loggingOut" ? <span className="nav-session-loading" role="status"><span className="spinner" />{auth.status === "loggingOut" ? t.submitting : t.restoring}</span> : auth.session ? <><span className="account-state" title={auth.session.name || t.signedIn}><span className="account-dot" aria-hidden="true" /><span>{auth.session.name || t.signedIn}</span></span><button className="button small" onClick={handleLogout}>{t.logout}</button></> : <Link className="login-link" href="/login">{t.login}<span aria-hidden="true"> ↗</span></Link>}
    </div></div>{auth.error && <div className="header-error" role="alert"><span>{t[auth.error]}</span>{auth.status === "error" && <button className="text-link" onClick={() => { if (auth.error === "logoutError") { void handleLogout(); } else { void restoreSession(); } }}>{t.retry}</button>}</div>}</header></>;
}

export function Footer() {
  const { t } = useSite();
  return <footer className="site-footer"><div><Brand /><p>{t.footer}</p></div><div className="footer-right"><p>{t.footerNote}</p><span>© {new Date().getFullYear()} BeautyScan AI</span></div></footer>;
}
