"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import { AuthError } from "@/lib/auth";
import { login, signup as createAccount } from "@/lib/auth-session";
import { useSite } from "./site-provider";

const subscribeLocation = (listener: () => void) => { window.addEventListener("popstate", listener); return () => window.removeEventListener("popstate", listener); };
const isStudioContinuation = () => new URLSearchParams(window.location.search).get("studio") === "1";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const { t, auth } = useSite();
  const router = useRouter();
  const continuing = useSyncExternalStore(subscribeLocation, isStudioContinuation, () => false);
  useEffect(() => { if (continuing && auth.status === "authenticated") router.replace("/#workspace"); }, [continuing, auth.status, router]);
  const signup = mode === "signup";
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"authError" | "connectionError" | "passwordError" | null>(null);
  const [success, setSuccess] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    setError(null);
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password"));
    if (password.length < 8 || password.length > 72 || new TextEncoder().encode(password).length > 72) { setError("passwordError"); return; }
    setBusy(true);
    try {
      if (signup) {
        await createAccount({ name: String(form.get("name")).trim(), email: String(form.get("identifier")).trim(), password });
      } else {
        await login({ member: String(form.get("identifier")).trim(), password });
      }
      setSuccess(true);
    } catch (error) { setError(error instanceof AuthError && error.kind === "connectionError" ? "connectionError" : "authError"); } finally { setBusy(false); }
  }
  return <main id="main" className="auth-layout"><aside className="auth-story"><span className="eyebrow">{t.authEyebrow}</span><h1>{t.authTitle}</h1><p>{t.authText}</p><span className="auth-flower" aria-hidden="true">✳</span><span className="auth-story-note">BeautyScan AI</span></aside><section className="auth-panel"><Link href="/" className="text-link back-link">← {t.back}</Link><span className="eyebrow">BeautyScan AI</span><h2>{signup ? t.join : t.welcome}</h2><p>{signup ? t.signupText : t.loginText}</p>
    {auth.status === "restoring" || auth.status === "loggingOut" ? <p className="auth-loading" role="status"><span className="spinner" />{t.restoring}</p> : auth.status === "authenticated" || (signup && success) ? <div className="success-message" role="status"><span aria-hidden="true">✓</span><h3>{auth.status === "authenticated" ? t.loginSuccess : t.signupSuccess}</h3><Link className="button" href={auth.status === "authenticated" ? "/#workspace" : continuing ? "/login?studio=1" : "/login"}>{auth.status === "authenticated" ? t.back : t.login}<span aria-hidden="true">↗</span></Link></div> : <form onSubmit={submit} aria-busy={busy}><fieldset disabled={busy}>
      {signup && <label>{t.name}<input name="name" autoComplete="name" required minLength={2} maxLength={50} pattern=".*\S.*" /></label>}
      <label>{signup ? t.email : t.identifier}<input name="identifier" type={signup ? "email" : "text"} autoComplete={signup ? "email" : "username"} required /></label>
      <label>{t.password}<span className="password-field"><input name="password" type={show ? "text" : "password"} autoComplete={signup ? "new-password" : "current-password"} minLength={8} maxLength={72} required aria-describedby="password-hint" /><button type="button" onClick={() => setShow(!show)} aria-label={show ? t.hide : t.show}>{show ? t.hide : t.show}</button></span></label><p className="field-hint" id="password-hint">{t.passwordHint}</p>
      {error && <p className="error" role="alert">{t[error]}</p>}<button className="button auth-submit" type="submit">{busy ? <><span className="spinner" />{t.submitting}</> : signup ? t.signup : t.login}<span aria-hidden="true">↗</span></button>
    </fieldset></form>}
    <p className="auth-alternate">{signup ? t.hasAccount : t.noAccount} <Link href={(signup ? "/login" : "/signup") + (continuing ? "?studio=1" : "")}>{signup ? t.login : t.signup}</Link></p>
  </section></main>;
}
