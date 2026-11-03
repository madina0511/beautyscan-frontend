import assert from "node:assert/strict";
import test from "node:test";
import { File } from "node:buffer";
import { setImmediate } from "node:timers/promises";
import { harness, response, token } from "./harness.mjs";

const id = "1123456789abcdef01234567";
const file = () => new File([new Uint8Array([137, 80, 78, 71])], "photo.png", { type: "image/png" });
const saved = { productId: id, originalImage: "uploads/products/original/fixture.png", finalEditedImage: "uploads/products/final/fixture.png" };
const restResponse = body => ({ ok: true, status: 201, json: async () => body });
async function setup(respond) {
  const h = harness(request => request.query?.includes("Refresh") ? response({ refresh: { accessToken: token() } }) : respond(request));
  await h.session.initializeSession();
  return { ...h, api: h.load("product-image") };
}

test("processing requires auth and a selected valid product before any upload", async () => {
  const h = harness(() => { throw new Error("Unexpected request"); });
  await assert.rejects(h.load("product-image").uploadProductImage(id, file()), error => error.kind === "sessionExpired");
  assert.equal(h.calls.length, 0);
  const ready = await setup(() => { throw new Error("Unexpected upload"); });
  await assert.rejects(ready.api.uploadProductImage("", file()), error => error.kind === "chooseProduct");
  assert.equal(ready.calls.length, 1);
});

test("JPEG/PNG/WebP/AVIF and the exact ten-million-byte boundary are accepted", async () => {
  const h = await setup(() => restResponse(saved));
  for (const type of ["image/jpeg", "image/png", "image/webp", "image/avif"]) h.api.validateImage({ type, size: 10_000_000 });
  for (const input of [{ type: "image/heic", size: 1 }, { type: "image/png", size: 0 }, { type: "image/png", size: 10_000_001 }]) {
    assert.throws(() => h.api.validateImage(input), error => error.kind === "invalid");
  }
});

test("upload uses the actual REST multipart contract, Bearer token and browser-set boundary", async () => {
  const h = await setup(() => restResponse(saved));
  const result = await h.api.uploadProductImage(id, file());
  const call = h.calls[1];
  assert.equal(call.url, "http://localhost:3000/product-image/upload");
  assert.equal(call.options.method, "POST");
  assert.match(call.options.headers.Authorization, /^Bearer /);
  assert.equal(call.options.headers["Content-Type"], undefined);
  assert.deepEqual([...call.options.body.keys()], ["image", "productId"]);
  assert.equal(call.options.body.get("productId"), id);
  assert.equal(call.options.body.get("image").name, "photo.png");
  assert.equal(result.originalImage, saved.originalImage);
  assert.equal(result.finalEditedImage, saved.finalEditedImage);
});

test("duplicate in-flight processing for the same product is blocked", async () => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const h = await setup(() => pending);
  const first = h.api.uploadProductImage(id, file());
  await assert.rejects(h.api.uploadProductImage(id, file()), error => error.kind === "processingAnother");
  finish(restResponse(saved)); await first;
  assert.equal(h.calls.length, 2);
});

test("client-side image dimensions match the existing backend processing limits", async () => {
  const h = await setup(() => restResponse(saved));
  h.api.validateImageDimensions(5000, 5000);
  h.api.validateImageDimensions(10000, 2500);
  for (const dimensions of [[5001, 5000], [10001, 1], [1, 10001]]) {
    assert.throws(() => h.api.validateImageDimensions(...dimensions), error => error.kind === "uploadDimensions");
  }
  assert.throws(() => h.api.validateImageDimensions(0, 100), error => error.kind === "invalid");
});

test("uncertain network and server outcomes are not automatically replayed", async () => {
  for (const reply of [() => { throw new TypeError("offline"); }, () => ({ ok: false, status: 503 })]) {
    const h = await setup(reply);
    await assert.rejects(h.api.uploadProductImage(id, file()), error => error.kind === "uncertain");
    assert.equal(h.calls.length, 2);
  }
});

test("only a pre-handler 401 is renewed and retried, ownership rejection is not", async () => {
  let uploads = 0;
  const h = await setup(() => ++uploads === 1 ? { ok: false, status: 401 } : restResponse(saved));
  await h.api.uploadProductImage(id, file());
  assert.equal(uploads, 2);
  assert.equal(h.calls.filter(call => call.query?.includes("Refresh")).length, 2);
  for (const status of [403, 404]) {
    const denied = await setup(() => ({ ok: false, status }));
    await assert.rejects(denied.api.uploadProductImage(id, file()), error => error.kind === "noAccess");
    assert.equal(denied.calls.length, 2);
  }
});

test("response validation never invents a result from missing or mismatched fields", async () => {
  for (const body of [{}, { ...saved, productId: "wrong" }, { ...saved, finalEditedImage: "" }]) {
    const h = await setup(() => restResponse(body));
    await assert.rejects(h.api.uploadProductImage(id, file()), error => error.kind === "uncertain");
  }
});

test("structured upload errors distinguish configuration, provider, dimensions and size", async () => {
  const reference = "12345678-1234-1234-1234-123456789abc";
  for (const [status, code, kind] of [
    [503, "PHOTOROOM_CONFIGURATION", "configurationError"], [502, "PHOTOROOM_REJECTED", "providerError"],
    [502, "PHOTOROOM_UNAVAILABLE", "providerError"], [400, "UPLOAD_DIMENSIONS", "uploadDimensions"],
    [413, "UPLOAD_TOO_LARGE", "uploadSize"], [400, "UPLOAD_INVALID", "uploadFailed"],
  ]) {
    const h = await setup(() => ({ ok: false, status, json: async () => ({ code, requestId: reference, message: "private-response-do-not-display" }) }));
    await assert.rejects(h.api.uploadProductImage(id, file()), error => error.kind === kind && error.status === status && error.requestId === reference && !error.message.includes("private-response"));
    assert.equal(h.calls.length, 2);
  }
});

test("untrusted response bodies and request IDs are not displayed as diagnostics", async () => {
  const h = await setup(() => ({ ok: false, status: 500, json: async () => ({ code: "UNKNOWN", message: "private-provider-details", requestId: "private-credential" }) }));
  await assert.rejects(h.api.uploadProductImage(id, file()), error => error.kind === "uncertain" && error.requestId === undefined && !error.message.includes("private-"));
});

test("saved media is requested from the implemented protected route and returned as a blob", async () => {
  const h = await setup(() => ({ ok: true, status: 200, headers: new Headers({ "Content-Type": "image/png" }), blob: async () => new Blob(["fixture"], { type: "image/png" }) }));
  const blob = await h.api.fetchProductMedia(id, "processed");
  assert.equal(blob.type, "image/png");
  assert.equal(h.calls[1].url, `http://localhost:3000/product-image/${id}/media/processed`);
  assert.match(h.calls[1].options.headers.Authorization, /^Bearer /);
  assert.equal(h.calls[1].options.cache, "no-store");
});

test("unavailable, non-image and empty media never becomes a downloadable blob", async () => {
  for (const reply of [
    { ok: false, status: 404 },
    { ok: true, headers: new Headers({ "Content-Type": "text/html" }), blob: async () => new Blob(["error"]) },
    { ok: true, headers: new Headers({ "Content-Type": "image/png" }), blob: async () => new Blob([]) },
  ]) {
    const h = await setup(() => reply);
    await assert.rejects(h.api.fetchProductMedia(id, "processed"), error => error.kind === "mediaFailed");
  }
});

test("late processing responses after logout cannot update account state", async () => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const h = await setup(({ query }) => query?.includes("Logout") ? response({ logout: { success: true } }) : pending);
  const upload = h.api.uploadProductImage(id, file());
  await setImmediate();
  await h.session.logout(); finish(restResponse(saved));
  await assert.rejects(upload, error => error.kind === "sessionExpired");
});

test("an older list response cannot overwrite newly processed image references", async () => {
  let finish;
  let lists = 0;
  const old = { _id: id, name: "Essence", originalImage: null, finalEditedImage: null, createdAt: "2026-10-20T12:00:00Z", updatedAt: "2026-10-20T12:00:00Z" };
  const pending = new Promise(resolve => { finish = resolve; });
  const h = await setup(() => ++lists === 1 ? response({ myProducts: [old] }) : pending);
  const workspace = h.load("product-workspace").createProductWorkspace();
  await workspace.load(); workspace.select(id);
  const refresh = workspace.load();
  workspace.updateImages(saved);
  finish(response({ myProducts: [old] })); await refresh;
  assert.equal(workspace.getSnapshot().products[0].finalEditedImage, saved.finalEditedImage);
  assert.equal(workspace.getSnapshot().selectedId, id);
});

test("image processing messages have complete translations in all four languages", () => {
  const h = harness(() => { throw new Error("Unexpected request"); });
  const messages = h.load("product-image-messages").imageMessages;
  for (const locale of Object.values(messages)) {
    assert.deepEqual(Object.keys(locale).sort(), Object.keys(messages.en).sort());
    for (const value of Object.values(locale)) assert.ok(value.trim());
  }
});
