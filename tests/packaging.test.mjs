import assert from "node:assert/strict";
import test from "node:test";
import { File } from "node:buffer";
import { setImmediate } from "node:timers/promises";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { harness, response, token } from "./harness.mjs";
const id = "1123456789abcdef01234567";
const original = "보습 크림\nСостав: Aqua\nHajmi: 50 ml";
const file = () => new File(["fixture"], "package.png", { type: "image/png" });
const saved = language => ({ productId: id, language, extractedText: original, description: "Generated", packageImage: "uploads/packages/final/fixture.png" });
const rest = body => ({ ok: true, status: 201, json: async () => body });
async function setup(respond) {
  const h = harness(request => request.query?.includes("Refresh") ? response({ refresh: { accessToken: token() } }) : respond(request));
  await h.session.initializeSession();
  return { ...h, api: h.load("packaging") };
}
test("anonymous, missing product and missing/unsupported language never upload", async () => {
  const anon = harness(() => { throw Error("unexpected"); });
  await assert.rejects(anon.load("packaging").generatePackagingDescription(id, file(), "en"), error => error.kind === "sessionExpired");
  assert.equal(anon.calls.length, 0);
  const h = await setup(() => { throw Error("unexpected"); });
  await assert.rejects(h.api.generatePackagingDescription("", file(), "en"), error => error.kind === "chooseProduct");
  for (const language of ["", "all", "fr", "en,ko", "toString"]) await assert.rejects(h.api.generatePackagingDescription(id, file(), language), error => error.kind === "chooseLanguage");
  assert.equal(h.calls.length, 1);
});
test("one explicit language goes to the existing OCR endpoint with JWT and cookies", async () => {
  for (const language of ["uz", "en", "ko", "ru"]) {
    const h = await setup(() => rest(saved(language)));
    const result = await h.api.generatePackagingDescription(id, file(), language);
    assert.equal(result.extractedText, original);
    assert.equal(result.language, language);
    assert.equal(h.calls.length, 2);
    const call = h.calls[1];
    assert.equal(call.url, "http://localhost:3000/ocr/upload");
    assert.equal(call.options.credentials, "include");
    assert.match(call.options.headers.Authorization, /^Bearer /);
    assert.equal(call.options.headers["Content-Type"], undefined);
    assert.deepEqual([...call.options.body.keys()], ["image", "productId", "language"]);
    assert.equal(call.options.body.get("language"), language);
    assert.equal(call.options.body.get("productId"), id);
  }
});
test("safe OCR, AI, ownership and malformed-response errors", async () => {
  for (const [status, code, expected] of [[400,"OCR_NO_TEXT","noText"],[503,"OCR_UNAVAILABLE","ocrFailed"],[503,"DESCRIPTION_UNAVAILABLE","aiFailed"],[403,"","noAccess"],[404,"","noAccess"],[413,"","invalid"],[500,"","failed"]]) {
    const h = await setup(() => ({ ok: false, status, json: async () => ({ code, message: "private-server-fixture" }) }));
    await assert.rejects(h.api.generatePackagingDescription(id, file(), "ko"), error => error.kind === expected && !error.message.includes("private-server-fixture"));
    assert.equal(h.calls.length, 2);
  }
  for (const bad of [{ ...saved("ko"), language: "en" }, { ...saved("ko"), productId: "other" }, { ...saved("ko"), description: "" }]) {
    const h = await setup(() => rest(bad));
    await assert.rejects(h.api.generatePackagingDescription(id, file(), "ko"), error => error.kind === "failed");
  }
});
test("network failure is never automatically replayed and duplicate in-flight submits are blocked", async () => {
  const failed = await setup(() => { throw Error("network"); });
  await assert.rejects(failed.api.generatePackagingDescription(id, file(), "en"), error => error.kind === "failed");
  assert.equal(failed.calls.length, 2);
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const h = await setup(() => pending);
  const first = h.api.generatePackagingDescription(id, file(), "ko");
  await assert.rejects(h.api.generatePackagingDescription(id, file(), "ru"), error => error.kind === "failed");
  finish(rest(saved("ko"))); await first;
  assert.equal(h.calls.length, 2);
});
test("pre-handler 401 renews once, while logout rejects late OCR responses", async () => {
  let uploads = 0;
  const h = await setup(() => ++uploads === 1 ? { ok: false, status: 401 } : rest(saved("uz")));
  await h.api.generatePackagingDescription(id, file(), "uz");
  assert.equal(uploads, 2);
  let finish;
  const late = await setup(request => request.query?.includes("Logout") ? response({ logout: { success: true } }) : new Promise(resolve => { finish = resolve; }));
  const pending = late.api.generatePackagingDescription(id, file(), "en");
  await setImmediate();
  await late.session.logout(); finish(rest(saved("en")));
  await assert.rejects(pending, error => error.kind === "sessionExpired");
});
test("local product update preserves other languages and stale history cannot overwrite it", async () => {
  let finish;
  let lists = 0;
  const product = { _id: id, name: "Product", createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z", descriptions: { en: "English", ru: "Russian" } };
  const h = await setup(() => ++lists === 1 ? response({ myProducts: [product] }) : new Promise(resolve => { finish = resolve; }));
  const workspace = h.load("product-workspace").createProductWorkspace();
  await workspace.load();
  const older = workspace.load(); await setImmediate();
  workspace.updatePackaging(saved("ko")); finish(response({ myProducts: [product] })); await older;
  assert.equal(workspace.getSnapshot().products[0].descriptions.en, "English");
  assert.equal(workspace.getSnapshot().products[0].descriptions.ru, "Russian");
  assert.equal(workspace.getSnapshot().products[0].descriptions.ko, "Generated");
});
test("Packaging UI requires a deliberate language choice independent of all four UI languages", () => {
  const h = harness(() => { throw Error("render must not make requests"); });
  const source = readFileSync(new URL("../src/components/packaging-studio.tsx", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  for (const locale of ["en", "uz", "ko", "ru"]) for (const language of ["", "ko"]) for (const authenticated of [false, true]) {
    const loaded = { exports: {} }; let state = 0;
    const snapshot = { products: [{ _id: id, name: "Existing product" }], selectedId: id, status: "ready" };
    vm.runInNewContext(`(function(require,module,exports){${output}\n})`, {})(name => {
      if (name === "react") return { ...React, useState: initial => React.useState(++state === 2 ? language : initial) };
      if (name === "react/jsx-runtime") return jsxRuntime;
      if (name === "./product-description") return { ProductDescription: ({ text }) => React.createElement("p", null, text) };
      if (name === "next/link") return { default: props => React.createElement("a", props) };
      if (name === "./site-provider") return { useSite: () => ({ locale, auth: { status: authenticated ? "authenticated" : "anonymous" }, t: h.load("messages").messages[locale] }) };
      if (name === "./product-provider") return { useProductWorkspace: () => ({ subscribe: () => () => {}, getSnapshot: () => snapshot, getServerSnapshot: () => snapshot }) };
      if (name.startsWith("@/lib/")) return h.load(name.slice(6));
      throw Error(name);
    }, loaded, loaded.exports);
    const html = renderToStaticMarkup(React.createElement(loaded.exports.PackagingStudio));
    const p = h.load("packaging-messages").packagingMessages[locale];
    assert.ok(html.includes(p.language));
    assert.ok(html.includes(p.languageNote));
    if (language) assert.match(html, /value="ko"[^>]*selected/);
    else assert.match(html, /value=""[^>]*selected/);
    if (!authenticated) assert.match(html, /href="\/login"/);
    assert.doesNotMatch(html, /<script|contenteditable/);
  }
  assert.equal(h.calls.length, 0);
});

test("unverified responses get specific feedback without replaying the provider request", async () => {
  const h = await setup(() => ({ ok: false, status: 503, json: async () => ({ code: "DESCRIPTION_UNAVAILABLE", reason: "RESPONSE_NOT_VERIFIED" }) }));
  await assert.rejects(h.api.generatePackagingDescription(id, file(), "en"), error => error.kind === "unverified");
  assert.equal(h.calls.length, 2);
});

test("all four languages keep retry wording in the action, with separate verification feedback", () => {
  const h = harness(() => { throw Error("No requests expected"); });
  const { packagingMessages } = h.load("packaging-messages");
  for (const locale of ["en", "uz", "ko", "ru"]) {
    assert.ok(packagingMessages[locale].unverified.trim());
    assert.ok(packagingMessages[locale].insufficient.trim());
    assert.doesNotMatch(packagingMessages[locale].aiFailed, /try again|qayta urining|다시 시도|Повторите/i);
  }
});

test("insufficient packaging information is actionable and never automatically replayed", async () => {
  const h = await setup(() => ({ ok: false, status: 422, json: async () => ({ code: "PACKAGING_INFORMATION_INSUFFICIENT" }) }));
  await assert.rejects(h.api.generatePackagingDescription(id, file(), "uz"), error => error.kind === "insufficient");
  assert.equal(h.calls.length, 2);
  const source = readFileSync(new URL("../src/components/packaging-studio.tsx", import.meta.url), "utf8");
  assert.match(source, /if \(error === "insufficient"\) input\.current\?\.click\(\)/);
});
