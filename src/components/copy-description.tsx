"use client";

import { useEffect, useRef, useState } from "react";
import { copyDescription } from "@/lib/description-clipboard";
import { descriptionCopyMessages } from "@/lib/description-copy-messages";
import type { Locale } from "@/lib/messages";

export function CopyDescription({ text, locale }: { text: string; locale: Locale }) {
  const labels = descriptionCopyMessages[locale];
  const [status, setStatus] = useState<"idle" | "copying" | "copied" | "failed">("idle");
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function copy() {
    if (inFlight.current) return;
    inFlight.current = true; setStatus("copying");
    try { await copyDescription(text); if (mounted.current) setStatus("copied"); }
    catch { if (mounted.current) setStatus("failed"); }
    finally { inFlight.current = false; }
  }
  return <div className="description-copy"><button type="button" className="text-link" disabled={!text.trim() || status === "copying"} aria-busy={status === "copying"} onClick={() => { void copy(); }}>{labels.copy}</button><span role="status" aria-live="polite">{status === "copied" ? labels.copied : status === "failed" ? labels.failed : ""}</span></div>;
}
