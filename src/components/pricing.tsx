"use client";

import Link from "next/link";
import { convertUsd, formatMoney, packages } from "@/lib/pricing";
import { pricingMessages } from "@/lib/pricing-messages";
import { useSite } from "./site-provider";

export function PackagePrice({ usdCents }: { usdCents: number }) {
  const { currency, locale } = useSite();
  const p = pricingMessages[locale];
  const amount = convertUsd(usdCents, currency);
  return <div className="package-price" aria-live="polite">{amount === null ? <><strong className="price-unavailable">{p.missingRate}</strong><span>{currency}</span><small>{p.basePrice}: {formatMoney(usdCents / 100, "USD", locale)} USD</small></> : <><strong>{formatMoney(amount, currency, locale)}</strong><span>{currency}</span>{currency !== "USD" && <small>{p.basePrice}: {formatMoney(usdCents / 100, "USD", locale)} USD</small>}</>}</div>;
}

export function PackagePreference({ myPage = false }: { myPage?: boolean }) {
  const { locale, currency, selectedPackage, selectPackage } = useSite();
  const p = pricingMessages[locale];
  const selected = packages.find(item => item.id === selectedPackage);
  const count = selected ? new Intl.NumberFormat(locale).format(selected.images) : null;
  return <section className="package-preference" aria-labelledby={myPage ? "account-package-heading" : "package-preference-heading"}>
    <div><p className="eyebrow">{p.package}</p><h2 id={myPage ? "account-package-heading" : "package-preference-heading"}>{p.selectionTitle}</h2><p className="preference-currency">{p.selectedCurrency}: <strong>{currency}</strong></p>
      {selected ? <p className="preference-name">{selected.id}<span> / {count} {selected.images === 1 ? p.image : p.images}</span></p> : <p className="muted preference-empty">{p.noSelection}</p>}
      <p className="preference-note">{p.preferenceNote}</p>{selected && currency !== "USD" && <p className="preference-note">{convertUsd(selected.usdCents, currency) === null ? p.missingNote : p.rateNote}</p>}<div className="preference-actions">{myPage && <Link className="text-link" href="/pricing">{p.change}<span aria-hidden="true">↗</span></Link>}{selected && <button type="button" className="text-link" onClick={() => selectPackage(null)}>{p.clear}</button>}</div>
    </div>{selected && <PackagePrice usdCents={selected.usdCents} />}
  </section>;
}

export function PricingPage() {
  const { locale, currency, selectedPackage, selectPackage } = useSite();
  const p = pricingMessages[locale];
  const hasRate = convertUsd(50, currency) !== null;
  return <main id="main" className="pricing-page section-wrap"><header className="pricing-heading"><p className="eyebrow">{p.eyebrow}</p><h1>{p.title}</h1><p>{p.intro}</p><span className="pricing-currency">{p.selectedCurrency} · {currency}</span></header>
    <div className="pricing-grid">{packages.map((item, index) => <article className={`package-card ${selectedPackage === item.id ? "is-selected" : ""}`} key={item.id} aria-labelledby={`package-${item.id}`}><p className="eyebrow">0{index + 1} / BeautyScan AI</p><h2 id={`package-${item.id}`}>{item.id}</h2><p className="package-caption">{[p.starter, p.standard, p.business][index]}</p><PackagePrice usdCents={item.usdCents} /><p className="package-image-count"><span aria-hidden="true">✧</span><strong>{new Intl.NumberFormat(locale).format(item.images)}</strong> {item.images === 1 ? p.image : p.images}</p><button type="button" className="button" aria-pressed={selectedPackage === item.id} aria-label={`${selectedPackage === item.id ? p.selected : p.select}: ${item.id}`} onClick={() => selectPackage(item.id)}>{selectedPackage === item.id ? p.selected : p.select}<span aria-hidden="true">{selectedPackage === item.id ? "✓" : "↗"}</span></button></article>)}</div>
    <p className={`conversion-note ${hasRate ? "" : "conversion-unavailable"}`} role="status">{!hasRate ? p.missingNote : currency !== "USD" ? p.rateNote : p.basePrice + " · USD"}</p>
    <PackagePreference />
    <section className="manual-payment" aria-labelledby="manual-payment-heading"><div className="manual-payment-heading"><p className="eyebrow">BeautyScan AI</p><h2 id="manual-payment-heading">{p.manualTitle}</h2><p>{p.manualIntro}</p></div><ol className="manual-payment-steps">{([1, 2, 3] as const).map(number => <li key={number}><span className="step-number">0{number}</span><h3>{p[`step${number}`]}</h3><p>{p[`step${number}Text`]}</p></li>)}</ol><p className="payment-unavailable">{p.unavailable}</p></section>
  </main>;
}
