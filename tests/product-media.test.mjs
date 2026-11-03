import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { harness } from "./harness.mjs";

const h = harness(() => { throw new Error("Display tests must not make network requests"); });
const messages = h.load("product-image-messages").imageMessages;
const source = readFileSync(new URL("../src/components/saved-product-media.tsx", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } });
const loaded = { exports: {} };
vm.runInNewContext(`(function(require, module, exports) { ${outputText}\n})`, {})(id => {
  if (id === "react") return React;
  if (id === "react/jsx-runtime") return jsxRuntime;
  if (id === "@/lib/product-image-messages") return { imageMessages: messages };
  if (id === "@/lib/product-image") return { fetchProductMedia: () => { throw new Error("Unexpected network request"); } };
  if (id === "./site-provider") return { useSite: () => { throw new Error("Presentation must not require an authenticated product workflow"); } };
  throw new Error(`Unexpected import: ${id}`);
}, loaded, loaded.exports);
const { ProductMediaView } = loaded.exports;
const defaults = {
  url: "blob:processed-result", status: "ready", displayed: true, label: messages.en.processed, labels: messages.en,
  downloadFilename: "beautyscan.png", presentation: "result", onLoad: () => {}, onError: () => {}, onRetry: () => {},
};
const render = props => renderToStaticMarkup(React.createElement(ProductMediaView, { ...defaults, ...props }));
function elements(node, type) {
  if (Array.isArray(node)) return node.flatMap(child => elements(child, type));
  if (!node || typeof node !== "object" || !node.props) return [];
  return [...(node.type === type ? [node] : []), ...elements(node.props.children, type)];
}

test("result shows one contained processed image with download directly below the frame", () => {
  const html = render();
  assert.equal((html.match(/<img\b/g) || []).length, 1);
  assert.match(html, /processed-result-media/);
  assert.match(html, /object-fit:contain/);
  assert.match(html, /src="blob:processed-result"/);
  assert.match(html, /<\/div><a class="media-download"/);
  assert.match(html, /download="beautyscan.png"/);
  assert.doesNotMatch(html, /Original photo|image-comparison/);
});

test("loading, undecoded images and failures do not offer a download", () => {
  for (const props of [{ status: "loading", url: null }, { displayed: false }, { status: "error", url: null }]) {
    assert.doesNotMatch(render(props), /download=/);
  }
  assert.match(render({ status: "loading", url: null }), /Loading saved image/);
});

test("media error keeps its safe message and working retry action", () => {
  let retried = false;
  const tree = ProductMediaView({ ...defaults, status: "error", url: null, onRetry: () => { retried = true; } });
  assert.match(render({ status: "error", url: null }), /The saved image is not accessible/);
  elements(tree, "button")[0].props.onClick();
  assert.equal(retried, true);
});

test("history previews retain their compact presentation and original images have no download action", () => {
  assert.doesNotMatch(render({ presentation: "history" }), /processed-result-media/);
  assert.doesNotMatch(render({ presentation: "history", downloadFilename: undefined }), /download=/);
});

test("result and download use the existing labels in all four languages without requiring product selection", () => {
  for (const labels of Object.values(messages)) {
    const html = render({ labels, label: labels.processed });
    assert.ok(html.includes(labels.processed));
    assert.ok(html.includes(labels.download));
  }
  assert.equal(h.calls.length, 0);
});

const profileLabels = h.load("mypage-messages").myPageMessages;
let detailsLocale = "en";
const mediaRequests = [];
const detailsModule = { exports: {} };
const detailsSource = readFileSync(new URL("../src/components/product-details.tsx", import.meta.url), "utf8");
const detailsOutput = ts.transpileModule(detailsSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
vm.runInNewContext(`(function(require, module, exports) { ${detailsOutput}\n})`, {})(id => {
  if (id === "react") return React;
  if (id === "react/jsx-runtime") return jsxRuntime;
  if (id === "next/link") return { default: props => React.createElement("a", props) };
  if (id === "@/lib/messages") return h.load("messages");
  if (id === "@/lib/mypage-messages") return { myPageMessages: profileLabels };
  if (id === "@/lib/product-image-messages") return { imageMessages: messages };
  if (id === "./product-description") return { ProductDescription: ({ text }) => React.createElement("p", null, text) };
  if (id === "./site-provider") return { useSite: () => ({ locale: detailsLocale }) };
  if (id === "./saved-product-media") return { SavedProductMedia: props => {
    mediaRequests.push(props);
    return React.createElement(ProductMediaView, { ...defaults, ...props, labels: messages[detailsLocale] });
  } };
  throw new Error(`Unexpected import: ${id}`);
}, detailsModule, detailsModule.exports);
const product = Object.freeze({
  _id: "0123456789abcdef01234567", name: "Saved product", originalImage: "private-original.jpg",
  finalEditedImage: "private-processed.png", packageImage: "private-packaging.jpg",
  descriptions: Object.freeze({ en: "English description", uz: "Uzbek description", ko: "Korean description", ru: "Russian description" }),
  createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z",
});
const renderDetails = value => renderToStaticMarkup(React.createElement(detailsModule.exports.ProductDetails, { product: value }));

test("My Page displays only the selected product's final result and preserves descriptions in all languages", () => {
  for (const locale of ["uz", "en", "ko", "ru"]) {
    detailsLocale = locale;
    mediaRequests.length = 0;
    const html = renderDetails(product);
    assert.equal(mediaRequests.length, 1);
    assert.equal(mediaRequests[0].productId, product._id);
    assert.equal(mediaRequests[0].kind, "processed");
    assert.equal(mediaRequests[0].reference, product.finalEditedImage);
    assert.equal(mediaRequests[0].presentation, "result");
    assert.equal((html.match(/<img\b/g) || []).length, 1);
    assert.match(html, /object-fit:contain/);
    assert.match(html, /<\/div><a class="media-download"/);
    assert.ok(html.includes(messages[locale].download));
    assert.ok(html.includes(product.descriptions[locale]));
    assert.doesNotMatch(html, /private-original|private-packaging|saved-images/);
    assert.ok(!html.includes(profileLabels[locale].originalImage));
    assert.ok(!html.includes(profileLabels[locale].packageImage));
  }
});

test("My Page without a processed result shows one localized empty state and no packaging placeholder or download", () => {
  for (const locale of ["uz", "en", "ko", "ru"]) {
    detailsLocale = locale;
    mediaRequests.length = 0;
    const html = renderDetails({ ...product, finalEditedImage: null, packageImage: null });
    assert.equal(mediaRequests.length, 0);
    assert.ok(html.includes(profileLabels[locale].noImage));
    assert.ok(html.includes(profileLabels[locale].editedImage));
    assert.ok(!html.includes(profileLabels[locale].packageImage));
    assert.doesNotMatch(html, /<img\b|download=/);
  }
  assert.equal(product.originalImage, "private-original.jpg");
  assert.equal(product.packageImage, "private-packaging.jpg");
  assert.equal(h.calls.length, 0);
});
