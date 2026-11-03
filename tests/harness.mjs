import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

export const memberId = "0123456789abcdef01234567";
export function token(seconds = 900, sub = memberId) {
  return `header.${Buffer.from(JSON.stringify({ sub, exp: Math.floor(Date.now() / 1000) + seconds })).toString("base64url")}.signature`;
}
export const response = data => ({ ok: true, status: 200, json: async () => ({ data }) });
export const unauthorized = () => ({ ok: true, status: 200, json: async () => ({ errors: [{ extensions: { code: "UNAUTHENTICATED" } }] }) });
export function harness(respond, globals = {}) {
  const calls = [];
  const locks = [];
  const context = vm.createContext({
    atob, AbortSignal, Date, URL, FormData, Blob, Headers, process: { env: {} },
    navigator: { locks: { request: async (name, operation) => { locks.push(name); return operation(); } } },
    fetch: async (url, options) => {
      const request = { url, options, ...(typeof options.body === "string" ? JSON.parse(options.body) : {}) };
      calls.push(request);
      return respond(request, calls.length);
    },
    ...globals,
  });
  const cache = new Map();
  function load(name) {
    if (cache.has(name)) return cache.get(name);
    const path = fileURLToPath(new URL(`../src/lib/${name}.ts`, import.meta.url));
    const { outputText } = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
    const loaded = { exports: {} };
    const run = vm.runInContext(`(function(require, module, exports) { ${outputText}\n})`, context);
    run(id => { assert.match(id, /^\.\/[\w-]+$/); return load(id.slice(2)); }, loaded, loaded.exports);
    cache.set(name, loaded.exports);
    return loaded.exports;
  }
  return { session: load("auth-session"), calls, locks, load };
}
