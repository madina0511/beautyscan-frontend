import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { setImmediate } from "node:timers/promises";
import vm from "node:vm";
import ts from "typescript";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { harness } from "./harness.mjs";

const descriptions = {
  uz: "# Namlantiruvchi krem\n\nTabiiy, ravon tavsif.\n\n## Mahsulot haqida\n- **Hajmi:** 50 ml",
  en: "# Example Cream\n\nClear customer-friendly copy.\n\n## Product information\n- **Volume:** 50 ml",
  ko: "# 보습 크림\n\n간결하고 자연스러운 설명입니다.\n\n## 제품 정보\n- **용량:** 50 ml",
  ru: "# Крем для ухода\n\nПонятное описание продукта.\n\n## Информация о продукте\n- **Объём:** 50 мл",
};
const h = harness(() => { throw Error("Copy must never contact providers"); });
const { descriptionPlainText } = h.load("description-format");

test("plain text removes Markdown while keeping readable headings, paragraphs and lists", () => {
  const text = "```markdown\r\n# **Title**\r\n\r\nA *gentle* description with `INCI`.\r\n\r\n## Details\r\n- **Volume:** 50 ml\r\n- [Label](https://example.invalid)\r\n\r\n1. Read label\r\n2. Follow directions\r\n```";
  assert.equal(descriptionPlainText(text), "Title\n\nA gentle description with INCI.\n\nDetails\n\n• Volume: 50 ml\n• Label\n\n1. Read label\n2. Follow directions");
});
test("clipboard receives exactly the selected language, without OCR or other descriptions", async () => {
  for (const [language, text] of Object.entries(descriptions)) {
    const writes = [];
    await h.load("description-clipboard").copyDescription(text, { writeText: async value => { writes.push(value); } });
    assert.deepEqual(writes, [descriptionPlainText(descriptions[language])]);
    assert.doesNotMatch(writes[0], /\*\*|^#/m);
    for (const [other, value] of Object.entries(descriptions)) if (other !== language) assert.ok(!writes[0].includes(descriptionPlainText(value)));
  }
  assert.equal(h.calls.length, 0);
});
test("unavailable, denied and empty clipboard operations fail instead of claiming success", async () => {
  const api = h.load("description-clipboard");
  await assert.rejects(api.copyDescription(descriptions.en), /copyFailed/);
  await assert.rejects(api.copyDescription(descriptions.en, { writeText: async () => { throw Error("denied"); } }), /denied/);
  let writes = 0;
  await assert.rejects(api.copyDescription(" ", { writeText: async () => { writes++; } }), /copyFailed/);
  assert.equal(writes, 0);
});

// Exercise the real button event handler with persistent hook state, without a
// browser dependency or a clipboard permission dialog.
function buttonHarness(text, locale, writeText) {
  const state = [];
  const refs = [];
  let stateIndex = 0, refIndex = 0, cleanup, effectInstalled = false;
  const source = readFileSync(new URL("../src/components/copy-description.tsx", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const loaded = { exports: {} };
  const local = harness(() => { throw Error("unexpected request"); }, { navigator: { clipboard: { writeText } } });
  vm.runInNewContext(`(function(require,module,exports){${output}\n})`, {})(name => {
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name === "react") return {
      useState: initial => { const index = stateIndex++; if (!(index in state)) state[index] = initial; return [state[index], value => { state[index] = value; }]; },
      useRef: initial => { const index = refIndex++; refs[index] ??= { current: initial }; return refs[index]; },
      useEffect: setup => { if (!effectInstalled) { cleanup = setup(); effectInstalled = true; } },
    };
    if (name.startsWith("@/lib/")) return local.load(name.slice(6));
    throw Error(name);
  }, loaded, loaded.exports);
  return {
    render() { stateIndex = 0; refIndex = 0; return loaded.exports.CopyDescription({ text, locale }); },
    unmount() { cleanup?.(); },
    state,
  };
}
function button(tree) { return tree.props.children[0]; }
test("button reports localized success only after writing and blocks duplicate clicks", async () => {
  const labels = h.load("description-copy-messages").descriptionCopyMessages;
  for (const locale of ["uz", "en", "ko", "ru"]) {
    let finish;
    const writes = [];
    const ui = buttonHarness(descriptions[locale], locale, text => { writes.push(text); return new Promise(resolve => { finish = resolve; }); });
    const first = ui.render();
    assert.equal(button(first).props.children, labels[locale].copy);
    button(first).props.onClick(); button(first).props.onClick();
    assert.equal(writes.length, 1);
    assert.equal(button(ui.render()).props.disabled, true);
    assert.ok(!renderToStaticMarkup(ui.render()).includes(labels[locale].copied));
    finish(); await setImmediate();
    const html = renderToStaticMarkup(ui.render());
    assert.ok(html.includes(labels[locale].copied));
    assert.match(html, /role="status"/);
    assert.equal(button(ui.render()).props.disabled, false);
    assert.equal(writes[0], descriptionPlainText(descriptions[locale]));
  }
});
test("button reports localized failure and allows an explicit retry", async () => {
  const labels = h.load("description-copy-messages").descriptionCopyMessages;
  for (const locale of ["uz", "en", "ko", "ru"]) {
    let attempt = 0;
    const ui = buttonHarness(descriptions.en, locale, async () => { if (++attempt === 1) throw Error("denied"); });
    button(ui.render()).props.onClick(); await setImmediate();
    assert.ok(renderToStaticMarkup(ui.render()).includes(labels[locale].failed));
    button(ui.render()).props.onClick(); await setImmediate();
    assert.ok(renderToStaticMarkup(ui.render()).includes(labels[locale].copied));
    assert.equal(attempt, 2);
  }
});
test("a late clipboard result does not update an unmounted description", async () => {
  let finish;
  const ui = buttonHarness(descriptions.en, "en", () => new Promise(resolve => { finish = resolve; }));
  button(ui.render()).props.onClick(); ui.unmount(); finish(); await setImmediate();
  assert.equal(ui.state[0], "copying");
});
