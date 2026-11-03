import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { harness } from "./harness.mjs";
const h = harness(() => { throw Error("Presentation must not contact providers"); });
const formatted = "# Example Cream\n\nA considered care choice.\n\n## Listed ingredients\n- **Glycerin**\n- Aqua\n\n### General cosmetic roles\nGlycerin is commonly used as a humectant; this is ingredient information, not a tested product effect.\n\n## Verified details\n1. Volume: 50 ml\n2. Read the label";
const product = { _id: "1123456789abcdef01234567", name: "Example Cream", originalImage: null, finalEditedImage: null, createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z", descriptions: { en: formatted, uz: formatted, ko: formatted, ru: formatted } };
function loadComponent(name, locale = "en", packagingResult = null) {
  const loaded = { exports: {} }; let stateIndex = 0;
  const source = readFileSync(new URL(`../src/components/${name}.tsx`, import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const snapshot = { products: [product], selectedId: product._id, status: "ready" };
  vm.runInNewContext(`(function(require,module,exports){${output}\n})`, {})(id => {
    if (id === "react") return name === "packaging-studio" ? { ...React, useState: initial => React.useState(++stateIndex === 7 ? packagingResult : initial) } : React;
    if (id === "react/jsx-runtime") return jsxRuntime;
    if (id === "next/link") return { default: props => React.createElement("a", props) };
    if (id === "./site-provider") return { useSite: () => ({ locale, auth: { status: "authenticated" }, t: h.load("messages").messages[locale] }) };
    if (id === "./product-provider") return { useProductWorkspace: () => ({ subscribe: () => () => {}, getSnapshot: () => snapshot, getServerSnapshot: () => snapshot }) };
    if (id === "./saved-product-media") return { SavedProductMedia: () => null };
    if (id === "./product-description") return loadComponent("product-description");
    if (id === "./copy-description") return loadComponent("copy-description");
    if (id.startsWith("@/lib/")) return h.load(id.slice(6));
    throw Error(id);
  }, loaded, loaded.exports);
  return loaded.exports;
}
const { ProductDescription } = loadComponent("product-description");
const render = text => renderToStaticMarkup(React.createElement(ProductDescription, { text }));
test("professional copy renders headings, paragraphs, emphasis and unordered/ordered lists", () => {
  const html = render(formatted);
  assert.match(html, /<h4>Example Cream<\/h4>/);
  assert.match(html, /<h5>Listed ingredients<\/h5>/);
  assert.match(html, /<h6>General cosmetic roles<\/h6>/);
  assert.match(html, /<p>A considered care choice.<\/p>/);
  assert.match(html, /<ul><li><strong>Glycerin<\/strong><\/li><li>Aqua<\/li><\/ul>/);
  assert.match(html, /<ol><li>Volume: 50 ml<\/li>/);
  assert.doesNotMatch(html, /\*\*|###|## /);
});
test("legacy plain text and Markdown fences render cleanly without changing stored copy", () => {
  assert.match(render("First paragraph.\nWrapped line.\n\nSecond paragraph."), /<p>First paragraph. Wrapped line.<\/p><p>Second paragraph.<\/p>/);
  const stored = "```markdown\n### **Benefits**\n- *Gentle copy*\n```";
  const html = render(stored);
  assert.match(html, /<h6><strong>Benefits<\/strong><\/h6>/);
  assert.match(html, /<em>Gentle copy<\/em>/);
  assert.doesNotMatch(html, /```|###|\*\*/);
  assert.equal(stored, "```markdown\n### **Benefits**\n- *Gentle copy*\n```");
});
test("stored HTML and links never execute or create media/network requests", () => {
  const html = render('# Title\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[Click](javascript:evil) and ![Image](https://example.invalid/tracker)');
  assert.doesNotMatch(html, /<script|<img|<a |href=|onerror="/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /Click/);
  assert.equal(h.calls.length, 0);
});
test("My Page and Packaging results both render stored descriptions through the shared formatter", () => {
  for (const locale of ["en", "uz", "ko", "ru"]) {
    const { ProductDetails } = loadComponent("product-details", locale);
    const details = renderToStaticMarkup(React.createElement(ProductDetails, { product }));
    assert.match(details, /<h4>Example Cream<\/h4>/);
    assert.match(details, /<strong>Glycerin<\/strong>/);
    assert.doesNotMatch(details, /\*\*|###/);
    const copyLabel = h.load("description-copy-messages").descriptionCopyMessages[locale].copy;
    assert.ok(details.includes(copyLabel));
    const { PackagingStudio } = loadComponent("packaging-studio", locale, { productId: product._id, language: "ko", extractedText: "Original **OCR** text", description: formatted, packageImage: "private.png" });
    const packaging = renderToStaticMarkup(React.createElement(PackagingStudio));
    assert.match(packaging, /<h4>Example Cream<\/h4>/);
    assert.match(packaging, /<strong>Glycerin<\/strong>/);
    // Original OCR is preserved verbatim, independently of description formatting.
    assert.match(packaging, /Original \*\*OCR\*\* text<\/pre>/);
    assert.match(packaging, /lang="ko"/);
    assert.ok(packaging.includes(copyLabel));
  }
  assert.equal(h.calls.length, 0);
});

test("Product Information fields and legacy bullet characters render and copy as separate readable lines", () => {
  const source = "## Product information\nBrand: ANUA\nVolume: 30 mL / 1.01 fl. oz.\nManufacturer: Cosmax Inc.\n\n• Niacinamide: 10%\n• Tranexamic Acid: 4%";
  const html = render(source);
  assert.match(html, /<p>Brand: ANUA<\/p><p>Volume: 30 mL \/ 1.01 fl. oz.<\/p><p>Manufacturer: Cosmax Inc.<\/p>/);
  assert.match(html, /<ul><li>Niacinamide: 10%<\/li><li>Tranexamic Acid: 4%<\/li><\/ul>/);
  const plain = h.load("description-format").descriptionPlainText(source);
  assert.match(plain, /Brand: ANUA\n\nVolume: 30 mL \/ 1.01 fl. oz.\n\nManufacturer: Cosmax Inc./);
  assert.doesNotMatch(plain, /##|\*\*/);
});
