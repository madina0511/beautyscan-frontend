import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
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
