import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { harness, memberId, token, response, unauthorized } from "./harness.mjs";

test("startup and concurrent refresh share one credentialed request, restoring token-only identity", async () => {
  const h = harness(() => response({ refresh: { accessToken: token() } }));
  const first = h.session.initializeSession();
  assert.equal(first, h.session.initializeSession());
  assert.equal(first, h.session.restoreSession());
  await first;
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].url, "http://localhost:3000/graphql");
  assert.equal(h.calls[0].options.credentials, "include");
  assert.match(h.calls[0].query, /refresh \{ accessToken \}/);
  assert.equal(h.session.getAuthSnapshot().status, "authenticated");
  assert.equal(h.session.getAuthSnapshot().session.name, null);
  assert.equal(h.session.getAuthSnapshot().session.memberId, memberId);
  assert.deepEqual(h.locks, ["beautyscan-auth-cookie"]);
});

test("missing or rejected refresh cookie starts anonymously without an expiry warning", async () => {
  const h = harness(unauthorized);
  await h.session.initializeSession();
  assert.equal(h.session.getAuthSnapshot().status, "anonymous");
  assert.equal(h.session.getAuthSnapshot().session, null);
  assert.equal(h.session.getAuthSnapshot().error, null);
});

test("login uses LoginInput and member fields; refresh retains the same user's name", async () => {
  const h = harness(({ query }) => response(query.includes("Login(") ? { login: { accessToken: token(), member: { id: memberId, name: "Madina" } } } : { refresh: { accessToken: token() } }));
  await h.session.login({ member: "user@example.test", password: "test-password" });
  assert.match(h.calls[0].query, /\$input: LoginInput!/);
  assert.equal(h.calls[0].variables.input.member, "user@example.test");
  assert.equal(h.session.getAuthSnapshot().session.name, "Madina");
  await h.session.restoreSession();
  assert.equal(h.session.getAuthSnapshot().session.name, "Madina");
});

test("signup uses SignupDto and requires an id without signing in", async () => {
  const h = harness(() => response({ signup: { id: memberId } }));
  await h.session.signup({ name: "Madina", email: "user@example.test", password: "test-password" });
  assert.match(h.calls[0].query, /\$input: SignupDto!/);
  assert.equal(h.calls[0].variables.input.email, "user@example.test");
  assert.equal(h.session.getAuthSnapshot().session, null);
  const malformed = harness(() => response({ signup: {} }));
  await assert.rejects(malformed.session.signup({ name: "Madina", email: "user@example.test", password: "test-password" }));
});

test("a rejected renewal clears the previous session and reports expiry", async () => {
  const h = harness((_, count) => count === 1 ? response({ refresh: { accessToken: token() } }) : unauthorized());
  await h.session.initializeSession();
  await h.session.restoreSession();
  assert.equal(h.session.getAuthSnapshot().status, "anonymous");
  assert.equal(h.session.getAuthSnapshot().session, null);
  assert.equal(h.session.getAuthSnapshot().error, "sessionExpired");
});

test("network failure exposes retry state and an explicit retry can restore the session", async () => {
  const h = harness((_, count) => {
    if (count === 1) throw new TypeError("offline");
    return response({ refresh: { accessToken: token() } });
  });
  await h.session.initializeSession();
  assert.equal(h.session.getAuthSnapshot().status, "error");
  assert.equal(h.session.getAuthSnapshot().error, "connectionError");
  await h.session.restoreSession();
  assert.equal(h.session.getAuthSnapshot().status, "authenticated");
});

test("malformed or expired server tokens never establish a session", async () => {
  for (const accessToken of ["broken", token(-1), token(900, "invalid-subject")]) {
    const h = harness(() => response({ refresh: { accessToken } }));
    await h.session.initializeSession();
    assert.equal(h.session.getAuthSnapshot().status, "error");
    assert.equal(h.session.getAuthSnapshot().session, null);
  }
});

test("logout waits for refresh and prevents its late response from resurrecting a session", async () => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const h = harness(({ query }) => query.includes("Refresh") ? pending : response({ logout: { success: true } }));
  const refresh = h.session.initializeSession();
  await setImmediate();
  assert.equal(h.calls.length, 1);
  const logout = h.session.logout();
  assert.equal(h.session.getAuthSnapshot().status, "loggingOut");
  finish(response({ refresh: { accessToken: token() } }));
  await Promise.all([refresh, logout]);
  assert.equal(h.calls.length, 2);
  assert.match(h.calls[1].query, /logout \{ success \}/);
  assert.equal(h.session.getAuthSnapshot().status, "anonymous");
  assert.equal(h.session.getAuthSnapshot().session, null);
});

test("failed logout discards the access token and supports a confirmed retry", async () => {
  const h = harness(({ query }, count) => {
    if (query.includes("Refresh")) return response({ refresh: { accessToken: token() } });
    if (count === 2) throw new TypeError("offline");
    return response({ logout: { success: true } });
  });
  await h.session.initializeSession();
  await assert.rejects(h.session.logout());
  assert.equal(h.session.getAuthSnapshot().session, null);
  assert.equal(h.session.getAuthSnapshot().status, "error");
  assert.equal(h.session.getAuthSnapshot().error, "logoutError");
  await h.session.logout();
  assert.equal(h.session.getAuthSnapshot().status, "anonymous");
});

test("HTTP 200 GraphQL auth errors and backend 401/403 responses are recognized", async () => {
  for (const result of [unauthorized(), { ok: false, status: 401 }, { ok: false, status: 403 }]) {
    const h = harness(() => result);
    await assert.rejects(h.load("auth").authRequest("query {}"), error => error.kind === "sessionExpired");
  }
});

test("all four languages include AVIF and session states; homepage has no mojibake", () => {
  const h = harness(() => { throw new Error("Unexpected network request"); });
  const { messages } = h.load("messages");
  assert.equal(Object.keys(messages).length, 4);
  for (const locale of Object.values(messages)) {
    assert.match(locale.formats, /AVIF/);
    assert.match(locale.invalid, /AVIF/);
    for (const key of ["restoring", "sessionExpired", "logoutError", "retry"]) assert.ok(locale[key]);
  }
  const home = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(home, /[\u00e2\u00c3\ufffd]/u);
  assert.match(home, /&#x2727;/);
});

const loginInput = { member: "user@example.test", password: "test-password" };
const signupInput = { name: "Madina", email: "user@example.test", password: "test-password" };
const graphQLError = (code, message, extensions = {}, status = 200) => ({
  ok: status >= 200 && status < 300, status,
  json: async () => ({ errors: [{ message, extensions: { code, ...extensions } }] }),
});

test("login distinguishes known invalid credentials from generic authorization failures", async () => {
  for (const result of [
    graphQLError("UNAUTHENTICATED", "Invalid credentials"),
    graphQLError("INVALID_CREDENTIALS", "Known error code"),
    graphQLError("UNAUTHENTICATED", "Unauthorized", { originalError: { message: "Invalid credentials", statusCode: 401 } }, 401),
  ]) {
    const h = harness(() => result);
    await assert.rejects(h.session.login(loginInput), error => error.kind === "invalidCredentials");
    assert.equal(h.session.getAuthSnapshot().session, null);
    assert.equal(h.calls.length, 1);
  }
  for (const result of [
    unauthorized(),
    graphQLError("FORBIDDEN", "Account is blocked"),
    { ok: false, status: 401 },
  ]) {
    const h = harness(() => result);
    await assert.rejects(h.session.login(loginInput), error => error.kind === "authError");
  }
});

test("signup recognizes explicit duplicate-email signals, including Nest's known HTTP 409 wrapper", async () => {
  for (const result of [
    graphQLError("EMAIL_ALREADY_EXISTS", "Known error code"),
    graphQLError("CONFLICT", "Email is already registered"),
    graphQLError("CONFLICT", "Email or phone number is already registered", {}, 409),
    graphQLError("INTERNAL_SERVER_ERROR", "Email is already registered", { status: 409, originalError: { statusCode: 409, message: "Email is already registered" } }),
  ]) {
    const h = harness(() => result);
    await assert.rejects(h.session.signup(signupInput), error => error.kind === "emailAlreadyExists");
    assert.equal(h.session.getAuthSnapshot().session, null);
    assert.equal(h.calls.length, 1);
  }
});

test("signup validation and unrelated conflicts use the generic auth message", async () => {
  for (const result of [
    graphQLError("BAD_USER_INPUT", "Bad Request Exception", { originalError: { statusCode: 400, message: ["name must be a string", "email must be an email"] } }),
    graphQLError("BAD_REQUEST", "Invalid signup information", {}, 400),
    graphQLError("CONFLICT", "Phone number is already registered", {}, 409),
    graphQLError("UNKNOWN", "Unrecognized diagnostic message"),
  ]) {
    const h = harness(() => result);
    await assert.rejects(h.session.signup(signupInput), error => error.kind === "authError");
  }
});

test("production INTERNAL_SERVER_ERROR remains a safe server failure, never an inferred duplicate email", async () => {
  for (const result of [
    graphQLError("INTERNAL_SERVER_ERROR", "Internal server error"),
    graphQLError("INTERNAL_SERVER_ERROR", "Email is already registered"),
    graphQLError("INTERNAL_SERVER_ERROR", "Email is already registered", { originalError: { statusCode: 500 } }),
    graphQLError("INTERNAL_SERVER_ERROR", "Unknown conflict", { status: 409 }),
    { ok: false, status: 500 },
    { ok: false, status: 503 },
  ]) {
    const h = harness(() => result);
    await assert.rejects(h.session.signup(signupInput), error => error.kind === "serverError" && error.message === "serverError");
    assert.equal(h.calls.length, 1);
  }
});

test("internal errors take priority over misleading credentials or partial success data", async () => {
  const h = harness(() => ({ ok: true, status: 200, json: async () => ({
    data: { login: { accessToken: token(), member: { id: memberId, name: "Madina" } } },
    errors: [
      { message: "Invalid credentials", extensions: { code: "UNAUTHENTICATED" } },
      { message: "Private database diagnostic", extensions: { code: "INTERNAL_SERVER_ERROR", stacktrace: ["private stack"] } },
    ],
  }) }));
  await assert.rejects(h.session.login(loginInput), error => error.kind === "serverError" && !error.message.includes("private"));
  assert.equal(h.session.getAuthSnapshot().session, null);
  assert.equal(h.calls.length, 1);
});

test("credential and duplicate messages are scoped to their operation", async () => {
  const signup = harness(() => graphQLError("UNAUTHENTICATED", "Invalid credentials"));
  await assert.rejects(signup.session.signup(signupInput), error => error.kind === "authError");
  const login = harness(() => graphQLError("EMAIL_ALREADY_EXISTS", "Email is already registered"));
  await assert.rejects(login.session.login(loginInput), error => error.kind === "authError");
  const refresh = harness(() => graphQLError("UNAUTHENTICATED", "Invalid credentials"));
  await refresh.session.initializeSession();
  assert.equal(refresh.session.getAuthSnapshot().status, "anonymous");
  assert.equal(refresh.session.getAuthSnapshot().error, null);
  const expired = harness(() => graphQLError("SESSION_EXPIRED", "Session expired"));
  await assert.rejects(expired.session.login(loginInput), error => error.kind === "sessionExpired");
});

test("network failures and timeouts are distinct from malformed server responses", async () => {
  for (const failure of [new TypeError("Network failure"), Object.assign(new Error("Timed out"), { name: "TimeoutError" })]) {
    const h = harness(() => { throw failure; });
    await assert.rejects(h.session.login(loginInput), error => error.kind === "connectionError");
    assert.equal(h.calls.length, 1);
  }
  for (const result of [
    { ok: true, status: 200, json: async () => { throw new SyntaxError("Private malformed response body"); } },
    { ok: true, status: 200, json: async () => ({}) },
  ]) {
    const h = harness(() => result);
    await assert.rejects(h.session.signup(signupInput), error => error.kind === "serverError");
  }
});

test("server failure does not trigger token refresh or replay a protected mutation", async () => {
  const h = harness((_, count) => count === 1 ? response({ refresh: { accessToken: token() } }) : { ok: false, status: 503 });
  await h.session.initializeSession();
  await assert.rejects(h.session.authenticatedRequest("mutation Protected { action }"), error => error.kind === "serverError");
  assert.equal(h.calls.length, 2);
  assert.equal(h.session.getAuthSnapshot().status, "authenticated");
});

// Exercise the real submit handler and translations with mocked React hooks,
// DOM FormData and fetch. No browser, database, or provider calls are needed.
function authFormHarness(mode, locale, respond) {
  const local = harness(respond);
  const { messages } = local.load("messages");
  const state = [];
  let stateIndex = 0;
  const source = readFileSync(new URL("../src/components/auth-form.tsx", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const loaded = { exports: {} };
  class FormDataMock {
    constructor(values) { this.values = values; }
    get(key) { return this.values[key]; }
  }
  vm.runInNewContext(`(function(require,module,exports){${output}\n})`, { FormData: FormDataMock, TextEncoder })(name => {
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name === "react") return {
      useState: initial => { const index = stateIndex++; if (!(index in state)) state[index] = initial; return [state[index], value => { state[index] = value; }]; },
      useEffect: () => {},
      useSyncExternalStore: (_subscribe, _getSnapshot, getServerSnapshot) => getServerSnapshot(),
    };
    if (name === "next/link") return { default: props => jsxRuntime.jsx("a", props) };
    if (name === "next/navigation") return { useRouter: () => ({ replace: () => {} }) };
    if (name === "./site-provider") return { useSite: () => ({ t: messages[locale], auth: { status: "anonymous" } }) };
    if (name === "@/lib/auth-session") return local.session;
    if (name === "@/lib/auth") return local.load("auth");
    throw Error(name);
  }, loaded, loaded.exports);
  return {
    local, labels: messages[locale],
    render() { stateIndex = 0; return loaded.exports.AuthForm({ mode }); },
  };
}

function findElement(tree, predicate) {
  if (!tree || typeof tree !== "object") return null;
  if (Array.isArray(tree)) {
    for (const child of tree) { const found = findElement(child, predicate); if (found) return found; }
    return null;
  }
  return predicate(tree) ? tree : findElement(tree.props?.children, predicate);
}

test("Login and Signup render only localized safe error labels in all four languages", async () => {
  const privateDiagnostic = "Private database failure at /internal/server: private stack";
  for (const locale of ["en", "uz", "ko", "ru"]) {
    for (const [mode, key, result] of [
      ["login", "invalidCredentials", graphQLError("UNAUTHENTICATED", "Invalid credentials")],
      ["signup", "emailAlreadyExists", graphQLError("CONFLICT", "Email is already registered")],
      ["signup", "authError", graphQLError("BAD_USER_INPUT", "Invalid signup information")],
      ["login", "sessionExpired", graphQLError("SESSION_EXPIRED", "Expired")],
      ["login", "connectionError", null],
      ["signup", "serverError", graphQLError("INTERNAL_SERVER_ERROR", privateDiagnostic, { stacktrace: [privateDiagnostic] })],
    ]) {
      const ui = authFormHarness(mode, locale, () => { if (!result) throw new TypeError("Offline"); return result; });
      const form = findElement(ui.render(), node => node.type === "form");
      await form.props.onSubmit({ preventDefault() {}, currentTarget: { name: "Madina", identifier: "user@example.test", password: "test-password" } });
      const tree = ui.render();
      const alert = findElement(tree, node => node.props?.role === "alert");
      assert.equal(alert.props.children, ui.labels[key], `${locale}/${mode}/${key}`);
      assert.ok(typeof ui.labels[key] === "string" && ui.labels[key].length > 0);
      assert.doesNotMatch(renderToStaticMarkup(tree), /Private database|internal\/server|private stack|INTERNAL_SERVER_ERROR/);
      assert.equal(ui.local.calls.length, 1);
    }
  }
});
