"use client";

import { useSite } from "@/components/site-provider";
import { UploadCard } from "@/components/upload-card";

export default function Home() {
  const { t } = useSite();
  return <main id="main"><section className="hero"><div className="hero-copy"><p className="eyebrow">{t.eyebrow}</p><h1>{t.title}<br /><em>{t.titleAccent}</em></h1><p className="hero-intro">{t.intro}</p><div className="hero-actions"><a href="#workspace" className="button">{t.start}<span aria-hidden="true">&#x2197;</span></a><a href="#how-it-works" className="text-link">{t.explore}<span aria-hidden="true">&#x2193;</span></a></div><p className="hero-note"><span aria-hidden="true">&#x2727;</span>{t.note}</p></div>
    <div className="hero-art" aria-hidden="true"><div className="art-orbit" /><span className="art-spark">&#x2727;</span><div className="pedestal" /><div className="bottle"><div className="bottle-cap" /><div className="bottle-body"><span className="bottle-brand">BeautyScan<br />AI</span><span className="bottle-line" /><span className="bottle-type">{t.product}</span><span className="bottle-volume">50 ml / 1.69 fl. oz.</span></div></div><div className="jar"><div className="jar-lid" /><div className="jar-body"><span>BeautyScan AI</span><small>{t.packaging}</small></div></div><div className="art-caption">BeautyScan <span>01</span></div></div>
    </section>
    <section className="workspace section-wrap" id="workspace"><div className="section-heading"><div><p className="eyebrow">{t.workspace}</p><h2>{t.workspaceTitle}</h2></div><p>{t.workspaceText}</p></div><div className="upload-grid"><UploadCard kind="product" /><UploadCard kind="packaging" /></div></section>
    <section className="how-section section-wrap" id="how-it-works"><p className="eyebrow">{t.stepsLabel}</p><h2>{t.stepsTitle}</h2><div className="steps">{([1, 2, 3] as const).map(n => <article key={n}><span className="step-number">0{n}</span><h3>{t[`step${n}`]}</h3><p>{t[`step${n}Text`]}</p></article>)}</div></section>
  </main>;
}

