import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import { harness, memberId, token, response, unauthorized } from "./harness.mjs";

const productId = "1123456789abcdef01234567";
const otherId = "2123456789abcdef01234567";
const product = (patch = {}) => ({ _id: productId, name: "Daily essence", createdAt: "2026-10-20T12:00:00.000Z", updatedAt: "2026-10-20T12:00:00.000Z", ...patch });
async function authenticated(respond) {
  const h = harness((request, count) => request.query.includes("Refresh") ? response({ refresh: { accessToken: token() } }) : respond(request, count));
  await h.session.initializeSession();
  return { ...h, api: h.load("products"), workspace: h.load("product-workspace").createProductWorkspace() };
}

test("anonymous callers cannot list or create products, and no request is sent", async () => {
  const h = harness(() => { throw new Error("Unexpected request"); });
  const api = h.load("products");
  await assert.rejects(api.listProducts(), error => error.kind === "sessionExpired");
  await assert.rejects(api.createProduct("Essence"), error => error.kind === "sessionExpired");
  assert.equal(h.calls.length, 0);
});

test("myProducts sends Bearer auth without owner arguments and parses saved details", async () => {
  const h = await authenticated(() => response({ myProducts: [product({ originalImage: "uploads/products/original.jpg", descriptions: { uz: "Tavsif", ko: "제품 설명", en: null } })] }));
  const products = await h.api.listProducts();
  const call = h.calls[1];
  assert.match(call.query, /query MyProducts \{ myProducts \{/);
  assert.doesNotMatch(call.query, /ownerId/);
  assert.equal(call.variables, undefined);
  assert.match(call.options.headers.Authorization, /^Bearer /);
  assert.equal(call.options.credentials, "include");
  assert.equal(products[0].originalImage, "uploads/products/original.jpg");
  assert.equal(products[0].descriptions.ko, "제품 설명");
  assert.equal(products[0].packageImage, null);
});

test("createProduct sends only trimmed name, validates it locally, and selects the server product", async () => {
  const h = await authenticated(({ variables }) => response({ createProduct: product({ name: variables.name }) }));
  assert.equal(await h.workspace.create("  Daily essence  "), true);
  assert.deepEqual(h.calls[1].variables, { name: "Daily essence" });
  assert.doesNotMatch(h.calls[1].query, /ownerId/);
  assert.match(h.calls[1].query, /\$name: String!/);
  assert.equal(h.workspace.getSnapshot().selectedId, productId);
  assert.equal(h.workspace.getSnapshot().products[0]._id, productId);
  assert.equal(h.workspace.getSnapshot().created, true);
  const before = h.calls.length;
  assert.equal(await h.workspace.create("   "), false);
  await assert.rejects(h.api.createProduct("a".repeat(151)), error => error.kind === "nameError");
  assert.equal(h.calls.length, before);
});

test("concurrent list loads are deduplicated; only existing products may be selected", async () => {
  const h = await authenticated(() => response({ myProducts: [product(), product({ _id: otherId })] }));
  const first = h.workspace.load();
  assert.equal(first, h.workspace.load());
  assert.equal(h.workspace.getSnapshot().status, "loading");
  await first;
  assert.equal(h.calls.length, 2);
  assert.equal(h.workspace.getSnapshot().status, "ready");
  h.workspace.select("unknown");
  assert.equal(h.workspace.getSnapshot().selectedId, null);
  h.workspace.select(otherId);
  assert.equal(h.workspace.getSnapshot().selectedId, otherId);
});

test("an older list response cannot discard a just-created product", async () => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const h = await authenticated(({ query }) => query.includes("MyProducts") ? pending : response({ createProduct: product() }));
  const load = h.workspace.load();
  await setImmediate();
  await h.workspace.create("Daily essence");
  finish(response({ myProducts: [] }));
  await load;
  assert.equal(h.workspace.getSnapshot().products.length, 1);
  assert.equal(h.workspace.getSnapshot().selectedId, productId);
});

test("empty list, invalid response and network failures have explicit states", async () => {
  const empty = await authenticated(() => response({ myProducts: [] }));
  await empty.workspace.load();
  assert.equal(empty.workspace.getSnapshot().status, "ready");
  assert.equal(empty.workspace.getSnapshot().products.length, 0);
  const malformed = await authenticated(() => response({ myProducts: [product({ descriptions: "bad" })] }));
  await malformed.workspace.load();
  assert.equal(malformed.workspace.getSnapshot().error, "productError");
  const offline = await authenticated(() => { throw new TypeError("offline"); });
  await offline.workspace.load();
  assert.equal(offline.workspace.getSnapshot().status, "error");
  assert.equal(offline.workspace.getSnapshot().error, "connectionError");
});

test("network-failed create is never replayed and duplicate in-flight submits are blocked", async () => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const h = await authenticated(() => pending);
  const first = h.workspace.create("Daily essence");
  assert.equal(await h.workspace.create("Daily essence"), false);
  finish({ ok: false, status: 503 });
  assert.equal(await first, false);
  assert.equal(h.calls.filter(call => call.query.includes("CreateProduct")).length, 1);
  assert.equal(h.workspace.getSnapshot().createError, "connectionError");
});

test("authorization rejection renews once and retries with the renewed Bearer token", async () => {
  let listCalls = 0;
  let refreshCalls = 0;
  const h = harness(({ query }) => {
    if (query.includes("Refresh")) return response({ refresh: { accessToken: token(900 + refreshCalls++) } });
    return ++listCalls === 1 ? unauthorized() : response({ myProducts: [product()] });
  });
  await h.session.initializeSession();
  const products = await h.load("products").listProducts();
  assert.equal(products.length, 1);
  assert.equal(refreshCalls, 2);
  assert.equal(listCalls, 2);
  assert.notEqual(h.calls[1].options.headers.Authorization, h.calls[3].options.headers.Authorization);
});

test("a rejected renewal expires the session and prevents replaying the product request", async () => {
  let refreshCalls = 0;
  const h = harness(({ query }) => {
    if (query.includes("Refresh") && ++refreshCalls === 1) return response({ refresh: { accessToken: token() } });
    return unauthorized();
  });
  await h.session.initializeSession();
  await assert.rejects(h.load("products").listProducts(), error => error.kind === "sessionExpired");
  assert.equal(h.session.getAuthSnapshot().status, "anonymous");
  assert.equal(h.calls.filter(call => call.query.includes("MyProducts")).length, 1);
});

test("a second product auth rejection expires the session without a retry loop", async () => {
  let refreshCalls = 0;
  const h = harness(({ query }) => query.includes("Refresh") ? response({ refresh: { accessToken: token(900 + refreshCalls++) } }) : unauthorized());
  await h.session.initializeSession();
  await assert.rejects(h.load("products").listProducts(), error => error.kind === "sessionExpired");
  assert.equal(h.session.getAuthSnapshot().status, "anonymous");
  assert.equal(h.session.getAuthSnapshot().session, null);
  assert.equal(h.calls.filter(call => call.query.includes("MyProducts")).length, 2);
  assert.equal(refreshCalls, 2);
});

test("an account change rejects old product responses and drops the previous profile", async () => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const h = harness(({ query }) => {
    if (query.includes("Login(")) return response({ login: { accessToken: token(), member: { id: memberId, name: "Madina", email: "user@example.test" } } });
    if (query.includes("Refresh")) return response({ refresh: { accessToken: token(900, otherId) } });
    return pending;
  });
  await h.session.login({ member: "user@example.test", password: "test-password" });
  assert.equal(h.session.getAuthSnapshot().session.profile.email, "user@example.test");
  const list = h.load("products").listProducts();
  await setImmediate();
  await h.session.restoreSession();
  finish(response({ myProducts: [product()] }));
  await assert.rejects(list, error => error.kind === "sessionExpired");
  assert.equal(h.session.getAuthSnapshot().session.memberId, otherId);
  assert.equal(h.session.getAuthSnapshot().session.profile, null);
});

test("late product responses after logout are rejected", async () => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const h = await authenticated(({ query }) => query.includes("Logout") ? response({ logout: { success: true } }) : pending);
  const list = h.api.listProducts();
  await setImmediate();
  await h.session.logout();
  finish(response({ myProducts: [product()] }));
  await assert.rejects(list, error => error.kind === "sessionExpired");
});

test("media references never become invented browser URLs or executable schemes", async () => {
  const h = await authenticated(() => response({ myProducts: [] }));
  for (const reference of [null, "uploads/products/test.png", "/uploads/test.png", "C:\\uploads\\test.png", "javascript:alert(1)", "data:image/png;base64,test", "//example.test/image.png", "https://user:password@example.test/image.png"]) {
    assert.equal(h.api.savedMediaUrl(reference), null);
  }
  const url = "https://media.example.test/image.png?signature=opaque";
  assert.equal(h.api.savedMediaUrl(url), url);
});

test("login supplies available profile data and renewal preserves it only for the same member", async () => {
  const h = harness(({ query }) => response(query.includes("Login(") ? { login: { accessToken: token(), member: { id: memberId, name: "Madina", email: "user@example.test", isEmailVerified: true } } } : { refresh: { accessToken: token() } }));
  await h.session.login({ member: "user@example.test", password: "test-password" });
  assert.equal(h.session.getAuthSnapshot().session.profile.email, "user@example.test");
  await h.session.restoreSession();
  assert.equal(h.session.getAuthSnapshot().session.profile.isEmailVerified, true);
  assert.equal(h.session.getAuthSnapshot().session.profile.phone, undefined);
});

test("all My Page translation keys exist in four languages", () => {
  const h = harness(() => { throw new Error("Unexpected request"); });
  const { myPageMessages } = h.load("mypage-messages");
  const expected = Object.keys(myPageMessages.en).sort();
  assert.equal(Object.keys(myPageMessages).length, 4);
  for (const messages of Object.values(myPageMessages)) {
    assert.deepEqual(Object.keys(messages).sort(), expected);
    for (const text of Object.values(messages)) assert.ok(text.trim());
  }
});

test("history reload waits for the pre-save list and then fetches the newly saved product", async () => {
  let finish;
  let lists = 0;
  const pending = new Promise(resolve => { finish = resolve; });
  const h = await authenticated(() => ++lists === 1 ? pending : response({ myProducts: [product()] }));
  const older = h.workspace.load();
  await setImmediate();
  const reload = h.workspace.reload();
  assert.equal(lists, 1);
  finish(response({ myProducts: [] }));
  await older; await reload;
  assert.equal(lists, 2);
  assert.equal(h.workspace.getSnapshot().products[0]._id, productId);
});
