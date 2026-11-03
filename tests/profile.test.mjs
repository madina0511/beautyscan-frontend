import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import { harness, memberId, response, token, unauthorized } from "./harness.mjs";

const profile = { id: memberId, name: "Madina", email: "profile@example.test", phone: "+998901234567", isEmailVerified: true, isPhoneVerified: false };
function profileHarness(profileResponse = () => response({ me: profile })) {
  return harness(({ query }, count) => {
    if (query.includes("Refresh")) return response({ refresh: { accessToken: token() } });
    if (query.includes("Login(")) return response({ login: { accessToken: token(), member: { id: memberId, name: "Old name" } } });
    if (query.includes("Logout")) return response({ logout: { success: true } });
    return profileResponse(query, count);
  });
}

test("profile is protected client-side and anonymous calls send no request", async () => {
  const h = profileHarness();
  await h.session.loadProfile();
  assert.equal(h.calls.length, 0);
});

test("login is followed by the actual me query with Bearer auth and safe profile fields", async () => {
  const h = profileHarness();
  await h.session.login({ member: "profile@example.test", password: "test-password" });
  assert.equal(h.session.getAuthSnapshot().session.profileStatus, "idle");
  await h.session.loadProfile();
  const session = h.session.getAuthSnapshot().session;
  assert.equal(session.name, "Madina");
  assert.equal(session.profile.email, profile.email);
  assert.equal(session.profile.phone, profile.phone);
  assert.equal(session.profile.isEmailVerified, true);
  assert.equal(session.profileStatus, "ready");
  const call = h.calls[1];
  assert.match(call.query, /query Me \{ me \{ id name email phone isEmailVerified isPhoneVerified \} \}/);
  assert.equal(call.variables, undefined);
  assert.match(call.options.headers.Authorization, /^Bearer /);
  assert.equal(call.options.credentials, "include");
});

test("a fresh page session restores from the cookie and then retrieves all profile fields", async () => {
  const previousPage = profileHarness();
  await previousPage.session.login({ member: "profile@example.test", password: "test-password" });
  await previousPage.session.loadProfile();
  // New module instance represents reload: no name/profile is carried in memory.
  const reloaded = profileHarness();
  await reloaded.session.initializeSession();
  assert.equal(reloaded.session.getAuthSnapshot().session.name, null);
  await reloaded.session.loadProfile();
  assert.equal(reloaded.session.getAuthSnapshot().session.name, profile.name);
  assert.equal(reloaded.session.getAuthSnapshot().session.profile.email, profile.email);
  assert.equal(reloaded.session.getAuthSnapshot().session.profile.phone, profile.phone);
  assert.match(reloaded.calls[0].query, /Refresh/);
  assert.match(reloaded.calls[1].query, /query Me/);
});

test("duplicate profile loads share one request and expose a loading state", async () => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const h = profileHarness(() => pending);
  await h.session.initializeSession();
  const first = h.session.loadProfile();
  assert.equal(h.session.loadProfile(), first);
  assert.equal(h.session.getAuthSnapshot().session.profileStatus, "loading");
  finish(response({ me: profile }));
  await first;
  assert.equal(h.calls.length, 2);
  assert.equal(h.session.getAuthSnapshot().session.profileStatus, "ready");
});

test("optional missing phone/email are represented as absent rather than fabricated", async () => {
  const h = profileHarness(() => response({ me: { ...profile, email: null, phone: null } }));
  await h.session.initializeSession();
  await h.session.loadProfile();
  const session = h.session.getAuthSnapshot().session;
  assert.equal(session.name, "Madina");
  assert.equal(session.profile.email, undefined);
  assert.equal(session.profile.phone, undefined);
  assert.equal(session.profileStatus, "ready");
});

test("unexpected sensitive properties are never copied into stored profile data", async () => {
  const h = profileHarness(() => response({ me: { ...profile, password: "fixture-secret", refreshToken: "fixture-token", passwordResetToken: "fixture-reset" } }));
  await h.session.initializeSession();
  await h.session.loadProfile();
  const stored = h.session.getAuthSnapshot().session.profile;
  assert.deepEqual(Object.keys(stored).sort(), ["email", "phone", "isEmailVerified", "isPhoneVerified"].sort());
});

test("network profile failures keep the session usable and an explicit retry succeeds", async () => {
  let attempts = 0;
  const h = profileHarness(() => {
    if (++attempts === 1) throw new TypeError("offline");
    return response({ me: profile });
  });
  await h.session.initializeSession();
  await h.session.loadProfile();
  assert.equal(h.session.getAuthSnapshot().status, "authenticated");
  assert.equal(h.session.getAuthSnapshot().session.profileStatus, "error");
  assert.equal(h.session.getAuthSnapshot().session.profileError, "connectionError");
  await h.session.loadProfile();
  assert.equal(h.session.getAuthSnapshot().session.profileStatus, "ready");
});

test("invalid/mismatched profile responses are rejected without changing the displayed identity", async () => {
  for (const me of [null, { ...profile, id: "2123456789abcdef01234567" }, { ...profile, name: null }, { ...profile, phone: 123 }]) {
    const h = profileHarness(() => response({ me }));
    await h.session.initializeSession();
    await h.session.loadProfile();
    assert.equal(h.session.getAuthSnapshot().session.name, null);
    assert.equal(h.session.getAuthSnapshot().session.profile, null);
    assert.equal(h.session.getAuthSnapshot().session.profileStatus, "error");
  }
});

test("profile auth rejection renews the token once, then succeeds", async () => {
  let profileCalls = 0;
  const h = profileHarness(() => ++profileCalls === 1 ? unauthorized() : response({ me: profile }));
  await h.session.initializeSession();
  await h.session.loadProfile();
  assert.equal(h.session.getAuthSnapshot().session.profileStatus, "ready");
  assert.equal(h.calls.filter(call => call.query.includes("Refresh")).length, 2);
  assert.equal(profileCalls, 2);
});

test("expired refresh cookie during profile retrieval clears the authenticated session", async () => {
  let refreshes = 0;
  const h = harness(({ query }) => query.includes("Refresh") && ++refreshes === 1 ? response({ refresh: { accessToken: token() } }) : unauthorized());
  await h.session.initializeSession();
  await h.session.loadProfile();
  assert.equal(h.session.getAuthSnapshot().status, "anonymous");
  assert.equal(h.session.getAuthSnapshot().session, null);
  assert.equal(h.session.getAuthSnapshot().error, "sessionExpired");
});

test("late profile response cannot repopulate state after logout", async () => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const h = profileHarness(() => pending);
  await h.session.initializeSession();
  const load = h.session.loadProfile();
  await setImmediate();
  await h.session.logout();
  finish(response({ me: profile }));
  await load;
  assert.equal(h.session.getAuthSnapshot().status, "anonymous");
  assert.equal(h.session.getAuthSnapshot().session, null);
});

test("a new login cannot receive an older login's in-flight profile response", async () => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const h = profileHarness(() => pending);
  await h.session.initializeSession();
  const oldLoad = h.session.loadProfile();
  await setImmediate();
  await h.session.login({ member: "profile@example.test", password: "test-password" });
  finish(response({ me: profile }));
  await oldLoad;
  assert.equal(h.session.getAuthSnapshot().session.name, "Old name");
  assert.equal(h.session.getAuthSnapshot().session.profileStatus, "idle");
});
