"use client";
import { useEffect, useState } from "react";
import { fetchProductMedia } from "@/lib/product-image";
import { imageMessages } from "@/lib/product-image-messages";
import { useSite } from "./site-provider";

type MediaViewProps = {
  url: string | null;
  status: "loading" | "ready" | "error";
  displayed: boolean;
  label: string;
  labels: Pick<typeof imageMessages.en, "mediaLoading" | "mediaFailed" | "download" | "refreshMedia">;
  downloadFilename?: string;
  presentation?: "history" | "result";
  onLoad: () => void;
  onError: () => void;
  onRetry: () => void;
};

// Presentation accepts any verified image URL, including future guest-preview
// blobs. Authentication and product selection stay with the calling workflow.
export function ProductMediaView({ url, status, displayed, label, labels, downloadFilename, presentation = "history", onLoad, onError, onRetry }: MediaViewProps) {
  return <figure className={`saved-image protected-media${presentation === "result" ? " processed-result-media" : ""}`}><figcaption>{label}</figcaption><div className="saved-image-preview">
    {url && status === "ready" ? <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={label} style={presentation === "result" ? { objectFit: "contain" } : undefined} onLoad={onLoad} onError={onError} />
    </> : <p role="status">{status === "loading" ? labels.mediaLoading : labels.mediaFailed}</p>}
  </div>{downloadFilename && url && status === "ready" && displayed && <a className="media-download" href={url} download={downloadFilename}>{labels.download} ↓</a>}
    {status === "error" && <button type="button" className="text-link media-retry" onClick={onRetry}>{labels.refreshMedia}</button>}
  </figure>;
}

export function SavedProductMedia({ productId, kind, reference, label, presentation = "history" }: { productId: string; kind: "original" | "processed"; reference: string; label: string; presentation?: "history" | "result" }) {
  const { locale } = useSite();
  const p = imageMessages[locale];
  const [state, setState] = useState<{ url: string | null; status: "loading" | "ready" | "error" }>({ url: null, status: "loading" });
  const [retry, setRetry] = useState(0);
  const [displayed, setDisplayed] = useState(false);
  useEffect(() => {
    let active = true;
    let url: string | null = null;
    void fetchProductMedia(productId, kind).then(blob => {
      if (!active) return;
      url = URL.createObjectURL(blob);
      setDisplayed(false);
      setState({ url, status: "ready" });
    }).catch(() => { if (active) setState({ url: null, status: "error" }); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [productId, kind, reference, retry]);
  return <ProductMediaView url={state.url} status={state.status} displayed={displayed} label={label} labels={p}
    presentation={presentation} downloadFilename={kind === "processed" ? `beautyscan-${productId}.png` : undefined}
    onLoad={() => setDisplayed(true)} onError={() => { setDisplayed(false); setState({ url: null, status: "error" }); }}
    onRetry={() => { setDisplayed(false); setState({ url: null, status: "loading" }); setRetry(value => value + 1); }} />;
}
