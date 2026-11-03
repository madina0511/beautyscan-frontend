"use client";

import { useState } from "react";
import Link from "next/link";
import { ProductDescription } from "./product-description";
import { SavedProductMedia } from "./saved-product-media";
import { imageMessages } from "@/lib/product-image-messages";
import { languages, type Locale } from "@/lib/messages";
import { myPageMessages } from "@/lib/mypage-messages";
import type { Product } from "@/lib/products";
import { useSite } from "./site-provider";

export function ProductDetails({ product }: { product: Product }) {
  const { locale } = useSite();
  const p = myPageMessages[locale];
  const [descriptionLocale, setDescriptionLocale] = useState<Locale | null>(null);
  const language = descriptionLocale ?? locale;
  const date = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "Asia/Seoul" }).format(new Date(value));
  return <section className="product-details" aria-labelledby="details-heading"><p className="eyebrow">{p.details}</p><h3 id="details-heading">{product.name}</h3><p className="selection-note"><span aria-hidden="true">&#x2713;</span> {p.selectedNote}</p><dl className="product-meta"><div><dt>{p.createdAt}</dt><dd>{date(product.createdAt)}</dd></div><div><dt>{p.updatedAt}</dt><dd>{date(product.updatedAt)}</dd></div><div className="product-id"><dt>{p.productId}</dt><dd>{product._id}</dd></div></dl>
    <Link href="/#workspace" className="text-link product-process-link">{imageMessages[locale].openStudio} ↗</Link>
    <div className="product-processed-image">{product.finalEditedImage ? <SavedProductMedia key={product.finalEditedImage} productId={product._id} kind="processed" reference={product.finalEditedImage} label={p.editedImage} presentation="result" /> : <figure className="saved-image processed-result-media"><figcaption>{p.editedImage}</figcaption><div className="saved-image-preview"><p>{p.noImage}</p></div></figure>}</div>
    <div className="saved-descriptions"><h4>{p.descriptions}</h4><div className="description-languages" role="group" aria-label={p.descriptionLanguage}>{(Object.entries(languages) as [Locale, string][]).map(([key, label]) => <button type="button" key={key} lang={key} aria-pressed={language === key} onClick={() => setDescriptionLocale(key)}>{label}{product.descriptions[key] && <span className="description-dot" aria-label={p.saved}> •</span>}</button>)}</div><div className="description-text" lang={language}>{product.descriptions[language] ? <ProductDescription text={product.descriptions[language]} copyLocale={locale} /> : <p className="muted">{p.noDescription}</p>}</div></div>
  </section>;
}
