"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { AuthError } from "@/lib/auth";
import { ImageProcessingError, enhanceStudioImage, claimGuestPreview, fetchGuestPreview, readPendingPreview, pendingPreviewKey, type GuestPreview, validateImage, validateImageDimensions, type ImageErrorKey, type ImageResult } from "@/lib/product-image";
import { imageMessages } from "@/lib/product-image-messages";
import { useProductWorkspace } from "./product-provider";
import { useSite } from "./site-provider";
import { SavedProductMedia } from "./saved-product-media";

export function ProductImageStudio() {
  const { t, locale, auth } = useSite();
  const p = imageMessages[locale];
  const workspace = useProductWorkspace();
  const authenticated = auth.status === "authenticated";
  const [guest, setGuest] = useState<GuestPreview | null>(null);
  const [guestUrl, setGuestUrl] = useState<string | null>(null);
  const [guestRetry, setGuestRetry] = useState(0);
  const [claimRetry, setClaimRetry] = useState(0);
  const claimAttempt = useRef<string | null>(null);
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const preview = useRef<string | null>(null);
  const revision = useRef(0);
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const [selection, setSelection] = useState<{ file: File; url: string } | null>(null);
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ImageErrorKey | "unreadable" | "sessionExpired" | null>(null);
  const [diagnostic, setDiagnostic] = useState<{ status?: number; requestId?: string } | null>(null);
  const [result, setResult] = useState<ImageResult | null>(null);
  useEffect(() => {
    mounted.current = true;
    void Promise.resolve().then(() => { if (mounted.current) setGuest(readPendingPreview()); });
    return () => { mounted.current = false; if (preview.current) URL.revokeObjectURL(preview.current); };
  }, []);
  useEffect(() => {
    if (!guest || result || authenticated) return;
    let active = true;
    let url: string | null = null;
    void fetchGuestPreview(guest).then(blob => {
      if (!active) return;
      if (Date.parse(guest.expiresAt) <= Date.now()) { setError("expiredPreview"); return; }
      url = URL.createObjectURL(blob); setGuestUrl(url);
    }).catch(error => { if (active) setError(error instanceof ImageProcessingError ? error.kind : "mediaFailed"); });
    const timer = window.setTimeout(() => { if (active) { setGuestUrl(null); setError("expiredPreview"); } }, Math.max(0, Date.parse(guest.expiresAt) - Date.now()));
    return () => { active = false; window.clearTimeout(timer); if (url) URL.revokeObjectURL(url); };
  }, [guest, guestRetry, result, authenticated]);
  useEffect(() => {
    if (!authenticated || !guest || result || inFlight.current) return;
    const attempt = `${guest.previewId}:${claimRetry}`;
    if (claimAttempt.current === attempt) return;
    claimAttempt.current = attempt;
    inFlight.current = true; setBusy(true); setError(null);
    void claimGuestPreview(guest).then(async saved => {
      try { sessionStorage.removeItem(pendingPreviewKey); } catch { /* Optional storage. */ }
      if (mounted.current) { setResult(saved); setGuest(null); }
      await workspace.reload();
    }).catch(error => { if (mounted.current) setError(error instanceof AuthError ? "sessionExpired" : error instanceof ImageProcessingError ? error.kind : "uploadFailed"); })
      .finally(() => { inFlight.current = false; if (mounted.current) setBusy(false); });
  }, [authenticated, guest, result, workspace, claimRetry]);
  function clear() {
    if (inFlight.current) return;
    setGuest(null); setGuestUrl(null);
    try { sessionStorage.removeItem(pendingPreviewKey); } catch { /* Optional storage. */ }
    revision.current++; if (preview.current) URL.revokeObjectURL(preview.current);
    preview.current = null; setSelection(null); setError(null); setDiagnostic(null); setReading(false); setResult(null);
  }
  async function select(file?: File) {
    if (!file || inFlight.current) return;
    const request = ++revision.current;
    setError(null); setDiagnostic(null); setResult(null);
    try { validateImage(file); } catch { setError("invalid"); setReading(false); return; }
    setReading(true);
    const url = URL.createObjectURL(file);
    const image = new window.Image(); image.src = url;
    try {
      await image.decode();
      validateImageDimensions(image.naturalWidth, image.naturalHeight);
      if (request !== revision.current || !mounted.current) { URL.revokeObjectURL(url); return; }
      if (preview.current) URL.revokeObjectURL(preview.current);
      preview.current = url; setSelection({ file, url });
    } catch (error) { URL.revokeObjectURL(url); if (request === revision.current && mounted.current) setError(error instanceof ImageProcessingError ? error.kind : "unreadable"); }
    finally { if (request === revision.current && mounted.current) setReading(false); }
  }
  async function process() {
    if (inFlight.current || !selection || guest) return;
    inFlight.current = true; setBusy(true); setError(null); setDiagnostic(null); setResult(null);
    try {
      const saved = await enhanceStudioImage(selection.file, authenticated);
      if ("previewId" in saved) {
        try { sessionStorage.setItem(pendingPreviewKey, JSON.stringify(saved)); } catch { /* Optional storage. */ }
        if (mounted.current) setGuest(saved);
      } else {
        if (mounted.current) setResult(saved);
        await workspace.reload();
      }
    } catch (error) {
      if (mounted.current) {
        setError(error instanceof AuthError ? "sessionExpired" : error instanceof ImageProcessingError ? error.kind : "uploadFailed");
        setDiagnostic(error instanceof ImageProcessingError ? { status: error.status, requestId: error.requestId } : null);
      }
    } finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  return <article className="upload-card product-card image-studio" aria-labelledby={`${id}-heading`}><span className="eyebrow">{t.productTag}</span><h3 id={`${id}-heading`}>{t.product}</h3><p className="card-description">{p.description}</p>
    {!authenticated && <p className="processing-notice">{p.guestNote}</p>}
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" tabIndex={-1} disabled={busy} onChange={event => { void select(event.target.files?.[0]); event.target.value = ""; }} />
    <button type="button" className={`drop-zone ${dragging ? "dragging" : ""}`} disabled={busy} aria-label={selection ? t.replace : t.choose} aria-busy={reading} onClick={() => input.current?.click()} onDragOver={event => { event.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); void select(event.dataTransfer.files[0]); }}>
      {reading ? <span className="upload-loading" role="status"><span className="spinner" />{t.reading}</span> : selection ? <>
        {/* Temporary local preview; no network request occurs on image selection. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={selection.url} alt={t.preview} /><span className="replace-label">{t.replace}</span>
      </> : <><span className="upload-icon" aria-hidden="true">↥</span><strong>{t.choose}</strong><span>{t.drop}</span></>}
    </button><p className="formats">{t.formats}</p>{selection && <div className="file-row"><span>{selection.file.name}</span><button type="button" disabled={busy} onClick={clear}>{t.remove}</button></div>}<p className="local-note">{p.uploadNote}</p>
    <button type="button" className="button studio-process" disabled={auth.status === "restoring" || auth.status === "loggingOut" || !!guest || !selection || reading || busy} onClick={() => { void process(); }}>{busy ? <><span className="spinner" />{p.processing}</> : p.enhance}<span aria-hidden="true">↗</span></button><p className="pending-note">{p.serviceNote}</p>
    {error && <p className="error" role="alert">{error === "invalid" || error === "unreadable" || error === "sessionExpired" ? t[error] : p[error]}{diagnostic?.status && <span> (HTTP {diagnostic.status})</span>}{diagnostic?.requestId && <small className="diagnostic-reference">{p.diagnosticReference}: {diagnostic.requestId}</small>} <button type="button" disabled={busy} onClick={() => { setError(null); if (authenticated && guest) setClaimRetry(value => value + 1); else if (guest) { setGuestUrl(null); setGuestRetry(value => value + 1); } else void process(); }}>{t.retry}</button>{(error === "trialUsed" || error === "expiredPreview") && !authenticated && <Link href="/login">{t.login}</Link>}</p>}
    {guest && !result && <div className="processing-results"><button type="button" disabled={busy} onClick={clear}>{t.remove}</button>
      {guestUrl && <figure className="saved-image processed-result-media"><figcaption>{p.processed}</figcaption><div className="saved-image-preview">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={guestUrl} alt={p.processed} style={{ objectFit: "contain" }} onError={() => setError("mediaFailed")} />
      </div></figure>}
      {!guestUrl && !error && <p role="status">{p.mediaLoading}</p>}
      {!authenticated && <><Link className="button" href="/login?studio=1">{p.claimAction}</Link><Link className="text-link" href="/signup?studio=1">{t.signup}</Link></>}
    </div>}
    {result ? <div className="processing-results"><p className="created-message" role="status">✓ {p.saved}</p><SavedProductMedia key={`${result.productId}-${result.finalEditedImage}`} productId={result.productId} kind="processed" reference={result.finalEditedImage} label={p.processed} presentation="result" /><Link href="/mypage" className="text-link">{p.myPage} ↗</Link></div> : !guest && <div className="result-empty"><span aria-hidden="true">✧</span><p>{p.empty}</p></div>}
  </article>;
}
