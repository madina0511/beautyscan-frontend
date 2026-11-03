"use client";

import Link from "next/link";
import { useEffect, useRef, useSyncExternalStore, type FormEvent } from "react";
import { loadProfile, restoreSession, type Session } from "@/lib/auth-session";
import { useProductWorkspace } from "./product-provider";
import { myPageMessages } from "@/lib/mypage-messages";
import { ProductDetails } from "./product-details";
import { useSite } from "./site-provider";
import { PackagePreference } from "./pricing";

function Profile({ session }: { session: Session }) {
  const { t, locale } = useSite();
  const p = myPageMessages[locale];
  const loading = session.profileStatus === "idle" || session.profileStatus === "loading";
  const fields = [{ label: t.name, value: session.name }, { label: t.email, value: session.profile?.email, verified: session.profile?.isEmailVerified },
    { label: p.phone, value: session.profile?.phone, verified: session.profile?.isPhoneVerified }, { label: p.memberId, value: session.memberId }];
  return <section className="profile-panel" aria-labelledby="profile-heading" aria-busy={loading}><div className="profile-title"><span className="profile-avatar" aria-hidden="true">{session.name ? Array.from(session.name)[0].toLocaleUpperCase(locale) : "✳"}</span><div><p className="eyebrow">BeautyScan AI</p><h2 id="profile-heading">{p.profile}</h2></div></div><dl className="profile-fields">{fields.map(field => <div key={field.label}><dt>{field.label}</dt><dd>{field.value || <span className="muted">{loading ? t.submitting : session.profileStatus === "ready" ? p.notProvided : p.unavailable}</span>}{field.value && typeof field.verified === "boolean" && <span className="verification">{field.verified ? p.verified : p.unverified}</span>}</dd></div>)}</dl>{loading && <p className="profile-limit" role="status">{p.profileLoading}</p>}{session.profileStatus === "error" && <div className="profile-limit"><p role="alert">{session.profileError === "connectionError" ? t.connectionError : p.profileError}</p><button type="button" className="text-link profile-retry" onClick={() => { void loadProfile(); }}>{t.retry}</button></div>}</section>;
}

function ProductWorkspace() {
  const { t, locale } = useSite();
  const p = myPageMessages[locale];
  const workspace = useProductWorkspace();
  const state = useSyncExternalStore(workspace.subscribe, workspace.getSnapshot, workspace.getServerSnapshot);
  const detailsRef = useRef<HTMLDivElement>(null);
  useEffect(() => { void workspace.load(); }, [workspace]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get("productName") ?? "");
    if (await workspace.create(name)) form.reset();
  }
  const selected = state.products.find(product => product._id === state.selectedId);
  const errorText = (key: NonNullable<typeof state.error>) => key === "connectionError" || key === "sessionExpired" ? t[key] : p[key];
  return <section className="products-section" aria-labelledby="products-heading"><div className="collection-heading"><div><p className="eyebrow">BeautyScan AI / {p.products}</p><h2 id="products-heading">{p.products}</h2><p>{p.productsIntro}</p></div><button className="text-link collection-reload" disabled={state.status === "loading" || state.creating} onClick={() => { void workspace.load(); }}>{p.reload}<span aria-hidden="true">↻</span></button></div>
    <form className="create-product" onSubmit={create} aria-busy={state.creating}><div><h3>{p.create}</h3><p>{p.createIntro}</p></div><fieldset disabled={state.creating}><label htmlFor="product-name">{p.productName}</label><div className="create-input-row"><input id="product-name" name="productName" type="text" required maxLength={150} pattern=".*\S.*" aria-describedby="product-name-hint" /><button type="submit" className="button">{state.creating ? <><span className="spinner" />{t.submitting}</> : p.create}<span aria-hidden="true">↗</span></button></div><p id="product-name-hint" className="field-hint">{p.nameHint}</p></fieldset>
      {state.createError && <p className="error" role="alert">{state.createError === "nameError" ? p.nameError : state.createError === "sessionExpired" ? t.sessionExpired : p.createError}</p>}{state.created && <p className="created-message" role="status">✓ {p.created}</p>}
    </form>
    {(state.status === "loading" || state.status === "idle") && <p className="collection-status" role="status"><span className="spinner" />{p.loadingProducts}</p>}
    {state.error && <p className="error" role="alert">{errorText(state.error)}</p>}
    {state.status === "ready" && state.products.length === 0 && <div className="collection-empty"><span aria-hidden="true">✧</span><h3>{p.emptyTitle}</h3><p>{p.emptyText}</p></div>}
    {state.products.length > 0 && <div className="product-browser"><ul className="product-list" aria-label={p.products}>{state.products.map((product, index) => <li key={product._id}><button type="button" aria-pressed={state.selectedId === product._id} onClick={() => { workspace.select(product._id); detailsRef.current?.focus(); }}><span className="product-list-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><span><strong>{product.name}</strong><small>{state.selectedId === product._id ? p.selected : p.select}</small></span><span aria-hidden="true">{state.selectedId === product._id ? "✓" : "↗"}</span></button></li>)}</ul>
      <div className="details-region" ref={detailsRef} tabIndex={-1} aria-label={p.details}>{selected ? <ProductDetails key={selected._id} product={selected} /> : <div className="details-empty"><span aria-hidden="true">✧</span><h3>{p.selectTitle}</h3><p>{p.selectText}</p></div>}</div></div>}
  </section>;
}

export function MyPage() {
  const { t, locale, auth } = useSite();
  const p = myPageMessages[locale];
  if (auth.status === "restoring" || auth.status === "loggingOut") return <main id="main" className="account-gate"><p role="status"><span className="spinner" />{t.restoring}</p></main>;
  if (auth.status !== "authenticated" || !auth.session) return <main id="main" className="account-gate"><p className="eyebrow">BeautyScan AI</p><h1>{p.myPage}</h1><p role={auth.error ? "alert" : undefined}>{auth.error ? t[auth.error] : p.loginRequired}</p><div className="hero-actions"><Link href="/login" className="button">{t.login}<span aria-hidden="true">↗</span></Link>{auth.status === "error" && auth.error !== "logoutError" && <button className="text-link" onClick={() => { void restoreSession(); }}>{t.retry}</button>}</div></main>;
  return <main id="main" className="my-page section-wrap"><header className="my-page-heading"><p className="eyebrow">{p.eyebrow}</p><h1>{p.title}</h1><p>{p.intro}</p></header><Profile session={auth.session} /><PackagePreference myPage /><ProductWorkspace key={auth.session.memberId} /></main>;
}
