"use client";
import Link from "next/link";
import { ProductDescription } from "./product-description";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { AuthError } from "@/lib/auth";
import { languages, type Locale } from "@/lib/messages";
import { validateImage, validateImageDimensions } from "@/lib/product-image";
import { generatePackagingDescription, isDescriptionLanguage, PackagingError, type PackagingErrorKey, type PackagingResult } from "@/lib/packaging";
import { packagingMessages } from "@/lib/packaging-messages";
import { useProductWorkspace } from "./product-provider";
import { useSite } from "./site-provider";

export function PackagingStudio() {
  const { t, locale, auth } = useSite();
  const p = packagingMessages[locale];
  const workspace = useProductWorkspace();
  const products = useSyncExternalStore(workspace.subscribe, workspace.getSnapshot, workspace.getServerSnapshot);
  const authenticated = auth.status === "authenticated";
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const revision = useRef(0);
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const objectUrl = useRef<string | null>(null);
  const [selection, setSelection] = useState<{ file: File; url: string } | null>(null);
  // Generation language is explicitly chosen, never derived from UI locale.
  const [language, setLanguage] = useState<Locale | "">("");
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<PackagingErrorKey | "sessionExpired" | null>(null);
  const [result, setResult] = useState<PackagingResult | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); };
  }, []);
  function clear() {
    if (inFlight.current) return;
    revision.current++;
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null; setSelection(null); setReading(false); setError(null); setResult(null);
  }
  async function select(file?: File) {
    if (!file || inFlight.current) return;
    clear();
    const request = ++revision.current;
    try { validateImage(file); } catch { setError("invalid"); return; }
    setReading(true);
    const url = URL.createObjectURL(file);
    try {
      const image = new window.Image(); image.src = url; await image.decode();
      validateImageDimensions(image.naturalWidth, image.naturalHeight);
      if (!mounted.current || request !== revision.current) { URL.revokeObjectURL(url); return; }
      objectUrl.current = url; setSelection({ file, url });
    } catch {
      URL.revokeObjectURL(url);
      if (mounted.current && request === revision.current) setError("invalid");
    } finally { if (mounted.current && request === revision.current) setReading(false); }
  }
  async function generate() {
    if (inFlight.current || reading || !selection || !authenticated) return;
    if (!products.selectedId) { setError("chooseProduct"); return; }
    if (!language) { setError("chooseLanguage"); return; }
    inFlight.current = true; setBusy(true); setError(null); setResult(null);
    try {
      const saved = await generatePackagingDescription(products.selectedId, selection.file, language);
      workspace.updatePackaging(saved);
      if (mounted.current) setResult(saved);
      await workspace.reload();
    } catch (failure) {
      if (mounted.current) setError(failure instanceof AuthError ? "sessionExpired" : failure instanceof PackagingError ? failure.kind : "failed");
    } finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  return <article className="upload-card packaging-card packaging-studio" aria-labelledby={`${id}-heading`}>
    <span className="eyebrow">{t.packagingTag}</span><h3 id={`${id}-heading`}>{t.packaging}</h3><p className="card-description">{p.intro}</p>
    {!authenticated && <p className="processing-notice">{p.login} <Link href="/login">{t.login}</Link></p>}
    {authenticated && <div className="processing-product-picker">
      <label htmlFor={`${id}-product`}>{p.product}</label><select id={`${id}-product`} value={products.selectedId || ""} disabled={busy || products.status === "loading"} onChange={event => { workspace.select(event.target.value); setError(null); setResult(null); }}>
        <option value="" disabled>{p.chooseProduct}</option>{products.products.map(product => <option key={product._id} value={product._id}>{product.name}</option>)}
      </select>
      {products.status === "loading" && <p role="status">{p.loading}</p>}
      {products.status === "ready" && products.products.length === 0 && <p>{p.noProducts} <Link href="/mypage">{p.history}</Link></p>}
      {products.error && <p className="error" role="alert">{p.loadFailed} <button type="button" onClick={() => { void workspace.reload(); }}>{t.retry}</button></p>}
    </div>}
    <div className="processing-product-picker"><label htmlFor={`${id}-language`}>{p.language}</label>
      <select id={`${id}-language`} value={language} disabled={busy} onChange={event => { const value = event.target.value; if (isDescriptionLanguage(value)) { setLanguage(value); setError(null); setResult(null); } }}>
        <option value="" disabled>{p.chooseLanguage}</option>{(Object.entries(languages) as [Locale, string][]).map(([code, label]) => <option value={code} lang={code} key={code}>{label}</option>)}
      </select><p>{p.languageNote}</p>
    </div>
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" tabIndex={-1} disabled={busy} onChange={event => { void select(event.target.files?.[0]); event.target.value = ""; }} />
    <button type="button" className={`drop-zone ${dragging ? "dragging" : ""}`} disabled={busy} aria-label={selection ? t.replace : t.choose} aria-busy={reading} onClick={() => input.current?.click()} onDragOver={event => { event.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); void select(event.dataTransfer.files[0]); }}>
      {reading ? <span className="upload-loading" role="status"><span className="spinner" />{t.reading}</span> : selection ? <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={selection.url} alt={t.preview} style={{ objectFit: "contain" }} /><span className="replace-label">{t.replace}</span>
      </> : <><span className="upload-icon" aria-hidden="true">&#x25a4;</span><strong>{t.choose}</strong><span>{t.drop}</span></>}
    </button><p className="formats">{t.formats}</p>
    {selection && <div className="file-row"><span>{selection.file.name}</span><button type="button" disabled={busy} onClick={clear}>{t.remove}</button></div>}
    <p className="local-note">{p.uploadNote}</p>
    <button type="button" className="button studio-process" disabled={!authenticated || !products.selectedId || !language || !selection || reading || busy} onClick={() => { void generate(); }}>{busy ? <><span className="spinner" />{p.processing}</> : p.generate}</button>
    {error && <p className="error" role="alert">{error === "sessionExpired" ? t.sessionExpired : p[error]} <button type="button" disabled={busy} onClick={() => { if (error === "insufficient") input.current?.click(); else void generate(); }}>{error === "insufficient" ? t.replace : t.retry}</button>{error === "sessionExpired" && <Link href="/login">{t.login}</Link>}</p>}
    {result ? <div className="packaging-results"><p className="created-message" role="status">{p.saved}</p><h4>{p.original}</h4><pre className="packaging-original" dir="auto">{result.extractedText}</pre><h4>{p.description} · {languages[result.language]}</h4><div className="description-text" lang={result.language} dir="auto"><ProductDescription text={result.description} copyLocale={locale} /></div><p className="local-note">{p.review}</p><Link className="text-link" href="/mypage" onClick={() => workspace.select(result.productId)}>{p.history}</Link></div> : <div className="result-empty"><span aria-hidden="true">&#x2727;</span><p>{p.empty}</p></div>}
  </article>;
}
