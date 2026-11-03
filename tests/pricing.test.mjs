import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import vm from "node:vm";
import ts from "typescript";
import { createElement } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { harness } from "./harness.mjs";

const noNetwork = () => { throw new Error("Pricing must not call a service"); };
function browser(storage = new Map()) {
  const window = new EventTarget();
  return { Event, window, localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } };
}

test("the catalogue has exactly the requested image counts and USD base prices", () => {
  const h = harness(noNetwork);
  const { packages } = h.load("pricing");
  assert.deepEqual(JSON.parse(JSON.stringify(packages)), [
    { id: "STARTER", images: 1, usdCents: 50 },
    { id: "STANDARD", images: 10, usdCents: 400 },
    { id: "BUSINESS", images: 50, usdCents: 1500 },
  ]);
  assert.equal(h.calls.length, 0);
});

test("local currency conversions stay unavailable without explicitly configured rates", () => {
  const { convertUsd, exchangeRates } = harness(noNetwork).load("pricing");
  assert.equal(exchangeRates.UZS, null);
  assert.equal(exchangeRates.KRW, null);
  for (const cents of [50, 400, 1500]) {
    assert.equal(convertUsd(cents, "USD"), cents / 100);
    assert.equal(convertUsd(cents, "UZS"), null);
    assert.equal(convertUsd(cents, "KRW"), null);
  }
});

test("only positive finite plain decimal rates are accepted", () => {
  const { parseExchangeRate } = harness(noNetwork).load("pricing");
  for (const value of [undefined, "", " ", "0", "-1", "NaN", "Infinity", "1e3", "1,000", "12x", "REPLACE_WITH_APPROVED_UZS_PER_USD", "REPLACE_WITH_APPROVED_KRW_PER_USD", "9".repeat(400)]) {
    assert.equal(parseExchangeRate(value), null);
  }
  assert.equal(parseExchangeRate(" 123.45 "), 123.45);
  assert.equal(parseExchangeRate(".5"), 0.5);
});

test("explicit test-only configuration converts from USD rather than chaining local currencies", () => {
  // Synthetic rates for arithmetic tests only; never shipped as application defaults.
  const h = harness(noNetwork, { process: { env: { NEXT_PUBLIC_USD_TO_UZS: "100", NEXT_PUBLIC_USD_TO_KRW: "20" } } });
  const { convertUsd } = h.load("pricing");
  assert.equal(convertUsd(50, "UZS"), 50);
  assert.equal(convertUsd(400, "UZS"), 400);
  assert.equal(convertUsd(1500, "KRW"), 300);
  assert.equal(convertUsd(1500, "USD"), 15);
  assert.equal(h.calls.length, 0);
});

test("invalid or overflowing amounts never produce a displayed conversion", () => {
  const { convertUsd } = harness(noNetwork).load("pricing");
  assert.equal(convertUsd(1500, "UZS", { USD: 1, UZS: Number.MAX_VALUE, KRW: null }), null);
  assert.equal(convertUsd(-50, "USD"), null);
  assert.equal(convertUsd(1.5, "USD"), null);
});

test("all interface locales format USD with cents and local currencies as grouped whole amounts", () => {
  const { formatMoney } = harness(noNetwork).load("pricing");
  for (const locale of ["en", "uz", "ko", "ru"]) {
    for (const currency of ["USD", "UZS", "KRW"]) {
      const digits = currency === "USD" ? 2 : 0;
      const expected = new Intl.NumberFormat(locale, { style: "currency", currency, currencyDisplay: "symbol", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(1234.5);
      assert.equal(formatMoney(1234.5, currency, locale), expected);
    }
  }
  assert.equal(formatMoney(0.5, "USD", "en"), "$0.50");
});

test("currency preference persists across module reloads and notifies the current page", () => {
  const storage = new Map();
  const globals = browser(storage);
  const first = harness(noNetwork, globals).load("currency-preference");
  let notifications = 0;
  const stop = first.subscribeCurrency(() => { notifications++; });
  assert.equal(first.getCurrency(), "USD");
  first.setCurrency("UZS");
  assert.equal(first.getCurrency(), "UZS");
  assert.equal(notifications, 1);
  const reloaded = harness(noNetwork, browser(storage)).load("currency-preference");
  assert.equal(reloaded.getCurrency(), "UZS");
  assert.equal(reloaded.getServerCurrency(), "USD");
  stop();
  first.setCurrency("KRW");
  assert.equal(notifications, 1);
  assert.equal(reloaded.getCurrency(), "KRW");
});

test("bad saved values fall back to USD and changes in another tab trigger a refresh", () => {
  const storage = new Map([["beautyscan-currency", "EUR"]]);
  const globals = browser(storage);
  const preferences = harness(noNetwork, globals).load("currency-preference");
  assert.equal(preferences.getCurrency(), "USD");
  preferences.setCurrency("INVALID");
  assert.equal(storage.get("beautyscan-currency"), "EUR");
  let notifications = 0;
  preferences.subscribeCurrency(() => { notifications++; });
  storage.set("beautyscan-currency", "KRW");
  const change = new Event("storage");
  Object.defineProperty(change, "key", { value: "beautyscan-currency" });
  globals.window.dispatchEvent(change);
  assert.equal(notifications, 1);
  assert.equal(preferences.getCurrency(), "KRW");
  storage.clear();
  globals.window.dispatchEvent(change);
  assert.equal(preferences.getCurrency(), "USD");
});

test("blocked browser storage still allows in-memory currency switching", () => {
  const globals = browser();
  globals.localStorage = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  const preferences = harness(noNetwork, globals).load("currency-preference");
  assert.equal(preferences.getCurrency(), "USD");
  preferences.setCurrency("KRW");
  assert.equal(preferences.getCurrency(), "KRW");
});

test("a failed storage write does not let an old readable preference override the new choice", () => {
  const globals = browser();
  globals.localStorage = { getItem: () => "UZS", setItem: () => { throw new Error("quota exceeded"); } };
  const preferences = harness(noNetwork, globals).load("currency-preference");
  assert.equal(preferences.getCurrency(), "UZS");
  preferences.setCurrency("KRW");
  assert.equal(preferences.getCurrency(), "KRW");
});

test("pricing and manual-payment messages are fully translated into four languages", () => {
  const { pricingMessages } = harness(noNetwork).load("pricing-messages");
  const expected = Object.keys(pricingMessages.en).sort();
  assert.equal(Object.keys(pricingMessages).length, 4);
  for (const messages of Object.values(pricingMessages)) {
    assert.deepEqual(Object.keys(messages).sort(), expected);
    for (const message of Object.values(messages)) assert.ok(message.trim());
    for (const key of ["preferenceNote", "manualIntro", "unavailable", "rateNote"]) assert.ok(messages[key]);
  }
});

function pricingUI(site, environment = {}) {
  const h = harness(noNetwork, { process: { env: environment } });
  const source = readFileSync(new URL("../src/components/pricing.tsx", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } });
  const loaded = { exports: {} };
  const run = vm.runInNewContext(`(function(require, module, exports) { ${outputText}\n})`, { Intl });
  run(id => {
    if (id === "react/jsx-runtime") return jsxRuntime;
    if (id === "next/link") return { default: props => createElement("a", props) };
    if (id === "./site-provider") return { useSite: () => site };
    if (id.startsWith("@/lib/")) return h.load(id.slice(6));
    throw new Error(`Unexpected import: ${id}`);
  }, loaded, loaded.exports);
  return { ...loaded.exports, calls: h.calls };
}
function buttons(element) {
  if (Array.isArray(element)) return element.flatMap(buttons);
  if (!element || typeof element !== "object" || !element.props) return [];
  return [...(element.type === "button" ? [element] : []), ...buttons(element.props.children)];
}

test("package buttons update the shared preference, My Page reflects it, and clearing works without payment calls", () => {
  const site = { locale: "en", currency: "USD", selectedPackage: null, selectPackage: id => { site.selectedPackage = id; } };
  const ui = pricingUI(site);
  const standard = buttons(ui.PricingPage()).find(button => button.props["aria-label"] === "Select package: STANDARD");
  standard.props.onClick();
  assert.equal(site.selectedPackage, "STANDARD");
  const selectedButton = buttons(ui.PricingPage()).find(button => button.props["aria-label"] === "Selected: STANDARD");
  assert.equal(selectedButton.props["aria-pressed"], true);
  const summary = renderToStaticMarkup(createElement(ui.PackagePreference, { myPage: true }));
  assert.match(summary, /STANDARD/);
  assert.match(summary, /\$4\.00/);
  assert.match(summary, /No order has been placed/);
  assert.match(summary, /no credits have been added/);
  assert.match(summary, /href="\/pricing"/);
  buttons(ui.PackagePreference({ myPage: true })).find(button => button.props.children === "Clear selection").props.onClick();
  assert.equal(site.selectedPackage, null);
  assert.equal(ui.calls.length, 0);
});

test("missing local rates show an unavailable state plus the actual USD base price on both pages", () => {
  const site = { locale: "en", currency: "KRW", selectedPackage: "STARTER", selectPackage: () => {} };
  const ui = pricingUI(site);
  const pricing = renderToStaticMarkup(createElement(ui.PricingPage));
  const account = renderToStaticMarkup(createElement(ui.PackagePreference, { myPage: true }));
  for (const html of [pricing, account]) {
    assert.match(html, /Conversion unavailable/);
    assert.match(html, /\$0\.50/);
    assert.match(html, /KRW/);
    assert.doesNotMatch(html, /₩0/);
  }
  assert.match(pricing, /Payments will later be made manually by bank transfer/);
  assert.match(pricing, /only after an administrator confirms the transfer/);
  assert.match(pricing, /Payments and package activation are not available yet/);
});

test("Next.js loads currency rates from .env.local in development", () => {
  // Isolated fixture only: never read, overwrite or log the app's real .env.local.
  const directory = mkdtempSync(join(tmpdir(), "beautyscan-currency-test-"));
  const file = join(directory, ".env.local");
  try {
    writeFileSync(file, "# Synthetic unit-test rates, not current market rates\nNEXT_PUBLIC_USD_TO_UZS=100\nNEXT_PUBLIC_USD_TO_KRW=20\n", "utf8");
    const require = createRequire(import.meta.url);
    const loader = require.resolve("@next/env");
    const script = `const { loadEnvConfig } = require(${JSON.stringify(loader)}); const result = loadEnvConfig(process.argv[1], true, {info() {}, error() {}}); process.stdout.write(JSON.stringify({uzs: result.parsedEnv?.NEXT_PUBLIC_USD_TO_UZS, krw: result.parsedEnv?.NEXT_PUBLIC_USD_TO_KRW, local: result.loadedEnvFiles.some(file => file.path === '.env.local')}));`;
    const environment = { ...process.env, NODE_ENV: "development" };
    delete environment.NEXT_PUBLIC_USD_TO_UZS;
    delete environment.NEXT_PUBLIC_USD_TO_KRW;
    delete environment.__NEXT_PROCESSED_ENV;
    const result = spawnSync(process.execPath, ["-e", script, directory], { env: environment, encoding: "utf8", timeout: 10_000 });
    assert.equal(result.status, 0, "The isolated Next.js environment loader must succeed");
    const loaded = JSON.parse(result.stdout);
    assert.deepEqual(loaded, { uzs: "100", krw: "20", local: true });
    const { convertUsd } = harness(noNetwork, { process: { env: { NEXT_PUBLIC_USD_TO_UZS: loaded.uzs, NEXT_PUBLIC_USD_TO_KRW: loaded.krw } } }).load("pricing");
    assert.equal(convertUsd(400, "USD"), 4);
    assert.equal(convertUsd(400, "UZS"), 400);
    assert.equal(convertUsd(400, "KRW"), 80);
  } finally {
    unlinkSync(file);
    rmdirSync(directory);
  }
});

test("configured rates update prices immediately on currency switches and in My Page", () => {
  const site = { locale: "en", currency: "USD", selectedPackage: "STANDARD", selectPackage: () => {} };
  // Synthetic test-only rates; no market rate or application default is implied.
  const environment = { NEXT_PUBLIC_USD_TO_UZS: "100", NEXT_PUBLIC_USD_TO_KRW: "20" };
  const ui = pricingUI(site, environment);
  const amounts = { USD: 4, UZS: 400, KRW: 80 };
  const { formatMoney } = harness(noNetwork).load("pricing");
  for (const currency of ["USD", "UZS", "KRW", "USD"]) {
    site.currency = currency;
    const price = renderToStaticMarkup(createElement(ui.PackagePrice, { usdCents: 400 }));
    const summary = renderToStaticMarkup(createElement(ui.PackagePreference, { myPage: true }));
    assert.ok(price.includes(formatMoney(amounts[currency], currency, "en")));
    assert.ok(summary.includes(formatMoney(amounts[currency], currency, "en")));
    assert.doesNotMatch(price, /Conversion unavailable/);
    assert.match(price, new RegExp(currency));
  }
  assert.equal(ui.calls.length, 0);
});

test("invalid environment rates keep both local currencies unavailable without affecting USD", () => {
  const site = { locale: "en", currency: "USD", selectedPackage: "STARTER", selectPackage: () => {} };
  const ui = pricingUI(site, { NEXT_PUBLIC_USD_TO_UZS: "REPLACE_WITH_APPROVED_UZS_PER_USD", NEXT_PUBLIC_USD_TO_KRW: "-20" });
  const usd = renderToStaticMarkup(createElement(ui.PackagePrice, { usdCents: 50 }));
  assert.match(usd, /\$0\.50/);
  assert.doesNotMatch(usd, /Conversion unavailable/);
  for (const currency of ["UZS", "KRW"]) {
    site.currency = currency;
    const html = renderToStaticMarkup(createElement(ui.PackagePrice, { usdCents: 50 }));
    assert.match(html, /Conversion unavailable/);
    assert.match(html, /USD base price:.*\$0\.50/);
  }
});
