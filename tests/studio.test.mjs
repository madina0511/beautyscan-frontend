import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import assert from "node:assert/strict";
import test from "node:test";
import { File } from "node:buffer";
import { harness, response, token } from "./harness.mjs";
const preview = { previewId: "12345678-1234-4123-8123-123456789abc", expiresAt: new Date(Date.now() + 60000).toISOString() };
const id = "1123456789abcdef01234567";
const file = () => new File(["image"], "photo.png", { type: "image/png" });
const rest = value => ({ ok: true, status: 200, json: async () => value });
test("guest enhancement sends only image and cookie, without JWT", async () => {
  const h = harness(() => rest(preview));
  assert.equal((await h.load("product-image").enhanceStudioImage(file(), false)).previewId, preview.previewId);
  const call = h.calls[0];
  assert.equal(call.url, "http://localhost:3000/product-image/guest/enhance");
  assert.equal(call.options.credentials, "include");
  assert.equal(call.options.headers, undefined);
  assert.deepEqual([...call.options.body.keys()], ["image"]);
});
test("claim uses JWT plus cookie and never calls enhancement", async () => {
  const h = harness(request => request.query ? response({ refresh: { accessToken: token() } }) : rest({ productId: id, originalMediaUrl: `/product-image/${id}/media/original`, processedMediaUrl: `/product-image/${id}/media/processed` }));
  await h.session.initializeSession();
  assert.equal((await h.load("product-image").claimGuestPreview(preview)).productId, id);
  const call = h.calls[1];
  assert.equal(call.url, `http://localhost:3000/product-image/guest/${preview.previewId}/claim`);
  assert.equal(call.options.credentials, "include");
  assert.match(call.options.headers.Authorization, /^Bearer /);
  assert.equal(call.options.body, undefined);
  assert.equal(h.calls.length, 2);
});
test("expired preview rejects before fetching and used trial/budget are actionable", async () => {
  const h = harness(() => { throw Error("unexpected"); });
  await assert.rejects(h.load("product-image").fetchGuestPreview({ ...preview, expiresAt: new Date(0).toISOString() }), error => error.kind === "expiredPreview");
  assert.equal(h.calls.length, 0);
  for (const [code, kind] of [["GUEST_SESSION_USED", "trialUsed"], ["DEMO_LIMIT_REACHED", "budgetExceeded"], ["GUEST_BUSY", "guestBusy"]]) {
    const failed = harness(() => ({ ok: false, status: 429, json: async () => ({ code }) }));
    await assert.rejects(failed.load("product-image").enhanceStudioImage(file(), false), error => error.kind === kind);
    assert.equal(failed.calls.length, 1);
  }
});
test("authenticated enhancement does not require a product ID", async () => {
  const saved = { productId: id, originalImage: "original.png", finalEditedImage: "final.png" };
  const h = harness(request => request.query ? response({ refresh: { accessToken: token() } }) : rest(saved));
  await h.session.initializeSession();
  assert.equal((await h.load("product-image").enhanceStudioImage(file(), true)).productId, id);
  assert.equal(h.calls[1].url, "http://localhost:3000/product-image/enhance");
  assert.deepEqual([...h.calls[1].options.body.keys()], ["image"]);
});

test("continuation storage validates IDs and keeps expiry for an actionable error", () => {
  let stored = JSON.stringify(preview);
  const h = harness(() => { throw Error("unexpected"); }, { sessionStorage: { getItem: () => stored } });
  assert.equal(h.load("product-image").readPendingPreview().previewId, preview.previewId);
  stored = JSON.stringify({ ...preview, previewId: "../../private" });
  assert.equal(h.load("product-image").readPendingPreview(), null);
  stored = JSON.stringify({ ...preview, expiresAt: "invalid" });
  assert.equal(h.load("product-image").readPendingPreview(), null);
});
test("claim refreshes JWT once on 401 and does not replay network failures", async () => {
  let claims = 0;
  const h = harness(request => request.query ? response({ refresh: { accessToken: token() } }) : ++claims === 1 ? { ok: false, status: 401 } : rest({ productId: id, originalMediaUrl: `/product-image/${id}/media/original`, processedMediaUrl: `/product-image/${id}/media/processed` }));
  await h.session.initializeSession();
  await h.load("product-image").claimGuestPreview(preview);
  assert.equal(claims, 2);
  const failed = harness(request => { if (request.query) return response({ refresh: { accessToken: token() } }); throw Error("network"); });
  await failed.session.initializeSession();
  await assert.rejects(failed.load("product-image").claimGuestPreview(preview), error => error.kind === "uncertain");
  assert.equal(failed.calls.length, 2);
});

test("guest Studio renders the whole preview with login/signup actions in every language", () => {
  const h = harness(() => { throw Error("unexpected"); });
  const source = readFileSync(new URL("../src/components/product-image-studio.tsx", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  for (const locale of ["en", "uz", "ko", "ru"]) {
    let stateIndex = 0;
    const loaded = { exports: {} };
    const labels = h.load("product-image-messages").imageMessages[locale];
    vm.runInNewContext(`(function(require, module, exports) { ${output}\n})`, {})(name => {
      if (name === "react") return { ...React, useState: initial => React.useState(stateIndex++ === 0 ? preview : stateIndex === 2 ? "blob:guest-preview" : initial) };
      if (name === "react/jsx-runtime") return jsxRuntime;
      if (name === "next/link") return { default: props => React.createElement("a", props) };
      if (name === "./site-provider") return { useSite: () => ({ locale, auth: { status: "anonymous" }, t: h.load("messages").messages[locale] }) };
      if (name === "./product-provider") return { useProductWorkspace: () => ({}) };
      if (name === "./saved-product-media") return { SavedProductMedia: () => { throw Error("Guest must not request protected media"); } };
      if (name === "@/lib/product-image-messages") return h.load("product-image-messages");
      if (name === "@/lib/product-image") return h.load("product-image");
      if (name === "@/lib/auth") return h.load("auth");
      throw Error(name);
    }, loaded, loaded.exports);
    const html = renderToStaticMarkup(React.createElement(loaded.exports.ProductImageStudio));
    assert.match(html, /object-fit:contain/);
    assert.match(html, /src="blob:guest-preview"/);
    assert.match(html, /href="\/login\?studio=1"/);
    assert.match(html, /href="\/signup\?studio=1"/);
    assert.doesNotMatch(html, /<select|download=|watermark/);
    assert.ok(html.includes(labels.enhance));
    for (const key of ["guestNote", "claimAction", "expiredPreview", "trialUsed", "budgetExceeded", "guestBusy", "enhance"]) assert.ok(!/\?{2}/.test(labels[key]));
  }
});
