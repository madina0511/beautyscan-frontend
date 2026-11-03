import { AuthError, isRecord } from "./auth";
import { authenticatedOperation, getAuthSnapshot } from "./auth-session";

export type ImageResult = { productId: string; originalImage: string; finalEditedImage: string };
export type ImageErrorKey = "invalid" | "chooseProduct" | "uploadFailed" | "uncertain" | "noAccess" | "mediaFailed" | "configurationError" | "providerError" | "uploadDimensions" | "uploadSize" | "processingAnother" | "expiredPreview" | "trialUsed" | "budgetExceeded" | "guestBusy";
export class ImageProcessingError extends Error {
  constructor(public readonly kind: ImageErrorKey, public readonly status?: number, public readonly requestId?: string) { super(kind); }
}
const running = new Set<string>();
export function backendUrl(path: string): string {
  const graphql = new URL(process.env.NEXT_PUBLIC_GRAPHQL_URL || "http://localhost:3000/graphql");
  // These Nest controllers are mounted at the backend origin's root.
  return new URL(path, graphql.origin).href;
}
export function validateImage(file: Pick<File, "type" | "size">): void {
  if (!["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type) || file.size <= 0 || file.size > 10_000_000) throw new ImageProcessingError("invalid");
}
export function validateImageDimensions(width: number, height: number): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) throw new ImageProcessingError("invalid");
  if (width > 10_000 || height > 10_000 || width * height > 25_000_000) throw new ImageProcessingError("uploadDimensions");
}
export async function uploadProductImage(productId: string, file: File): Promise<ImageResult> {
  if (getAuthSnapshot().status !== "authenticated") throw new AuthError("sessionExpired");
  if (!/^[a-f\d]{24}$/i.test(productId)) throw new ImageProcessingError("chooseProduct");
  validateImage(file);
  if (running.has(productId)) throw new ImageProcessingError("processingAnother");
  running.add(productId);
  try {
    return await authenticatedOperation(async accessToken => {
      const body = new FormData(); body.append("image", file); body.append("productId", productId);
      let response: Response;
      try {
        response = await fetch(backendUrl("/product-image/upload"), {
          method: "POST", headers: { Authorization: `Bearer ${accessToken}` }, body,
          credentials: "include", signal: AbortSignal.timeout(120_000),
        });
      } catch { throw new ImageProcessingError("uncertain"); }
      if (response.status === 401) throw new AuthError("sessionExpired");
      if (response.status === 403 || response.status === 404) throw new ImageProcessingError("noAccess");
      if (!response.ok) {
        let body: unknown = null;
        try { body = await response.json(); } catch { /* Never display arbitrary server response text. */ }
        const code = isRecord(body) && typeof body.code === "string" ? body.code : "";
        const requestId = isRecord(body) && typeof body.requestId === "string" && /^[a-f\d-]{36}$/i.test(body.requestId) ? body.requestId : undefined;
        const kind = code === "PHOTOROOM_CONFIGURATION" ? "configurationError"
          : code === "PHOTOROOM_REJECTED" || code === "PHOTOROOM_UNAVAILABLE" ? "providerError"
          : code === "UPLOAD_DIMENSIONS" ? "uploadDimensions"
          : code === "UPLOAD_TOO_LARGE" || response.status === 413 ? "uploadSize"
          : response.status >= 500 ? "uncertain" : "uploadFailed";
        throw new ImageProcessingError(kind, response.status, requestId);
      }
      let result: unknown;
      try { result = await response.json(); } catch { throw new ImageProcessingError("uncertain"); }
      if (!isRecord(result) || result.productId !== productId || typeof result.originalImage !== "string" || !result.originalImage ||
        typeof result.finalEditedImage !== "string" || !result.finalEditedImage) throw new ImageProcessingError("uncertain");
      return { productId, originalImage: result.originalImage, finalEditedImage: result.finalEditedImage };
    });
  } finally { running.delete(productId); }
}

export async function fetchProductMedia(productId: string, kind: "original" | "processed"): Promise<Blob> {
  if (!/^[a-f\d]{24}$/i.test(productId)) throw new ImageProcessingError("mediaFailed");
  return authenticatedOperation(async accessToken => {
    let response: Response;
    try {
      response = await fetch(backendUrl(`/product-image/${productId}/media/${kind}`), {
        headers: { Authorization: `Bearer ${accessToken}` }, credentials: "include", cache: "no-store", signal: AbortSignal.timeout(30_000),
      });
    } catch { throw new ImageProcessingError("mediaFailed"); }
    if (response.status === 401) throw new AuthError("sessionExpired");
    if (!response.ok || !/^image\/(png|jpeg)(?:;|$)/i.test(response.headers.get("Content-Type") || "")) throw new ImageProcessingError("mediaFailed");
    const blob = await response.blob();
    if (!blob.size) throw new ImageProcessingError("mediaFailed");
    return blob;
  });
}

export type GuestPreview = { previewId: string; expiresAt: string };
export const pendingPreviewKey = "beautyscan-guest-preview";
const previewIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export function readPendingPreview(): GuestPreview | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(pendingPreviewKey) || "null");
    if (isRecord(value) && typeof value.previewId === "string" && previewIdPattern.test(value.previewId) && typeof value.expiresAt === "string" && Number.isFinite(Date.parse(value.expiresAt))) return { previewId: value.previewId, expiresAt: value.expiresAt };
  } catch { /* Continuation storage is optional. */ }
  return null;
}
async function studioRequest(path: string, options: RequestInit, authenticated = false): Promise<Response> {
  const operation = async (token?: string) => {
    let response: Response;
    try { response = await fetch(backendUrl(path), { ...options, headers: token ? { Authorization: `Bearer ${token}` } : undefined, credentials: "include", cache: "no-store", signal: AbortSignal.timeout(120_000) }); }
    catch { throw new ImageProcessingError("uncertain"); }
    if (response.status === 401 && authenticated) throw new AuthError("sessionExpired");
    if (!response.ok) {
      let body: unknown; try { body = await response.json(); } catch { /* Safe errors only. */ }
      const code = isRecord(body) ? body.code : undefined;
      const kind: ImageErrorKey = code === "GUEST_SESSION_USED" ? "trialUsed"
        : code === "DEMO_LIMIT_REACHED" || code === "PHOTOROOM_BUDGET_EXHAUSTED" || code === "PHOTOROOM_ADMISSION_DENIED" ? "budgetExceeded"
        : response.status === 404 || response.status === 410 || code === "GUEST_SESSION_INVALID" ? "expiredPreview"
        : response.status === 429 || code === "GUEST_BUSY" || code === "PHOTOROOM_BUSY" ? "guestBusy"
        : code === "PHOTOROOM_CONFIGURATION" ? "configurationError"
        : code === "UPLOAD_DIMENSIONS" ? "uploadDimensions"
        : response.status === 413 ? "uploadSize"
        : response.status >= 500 ? "uncertain" : "uploadFailed";
      throw new ImageProcessingError(kind, response.status);
    }
    return response;
  };
  return authenticated ? authenticatedOperation(operation) : operation();
}
export async function enhanceStudioImage(file: File, authenticated: boolean): Promise<GuestPreview | ImageResult> {
  validateImage(file);
  const body = new FormData(); body.append("image", file);
  const response = await studioRequest(authenticated ? "/product-image/enhance" : "/product-image/guest/enhance", { method: "POST", body }, authenticated);
  const value: unknown = await response.json();
  if (!isRecord(value)) throw new ImageProcessingError("uncertain");
  if (authenticated && typeof value.productId === "string" && /^[a-f0-9]{24}$/i.test(value.productId) && typeof value.originalImage === "string" && typeof value.finalEditedImage === "string") return { productId: value.productId, originalImage: value.originalImage, finalEditedImage: value.finalEditedImage };
  if (!authenticated && typeof value.previewId === "string" && previewIdPattern.test(value.previewId) && typeof value.expiresAt === "string" && Number.isFinite(Date.parse(value.expiresAt))) return { previewId: value.previewId, expiresAt: value.expiresAt };
  throw new ImageProcessingError("uncertain");
}
export async function fetchGuestPreview(preview: GuestPreview): Promise<Blob> {
  if (!previewIdPattern.test(preview.previewId) || Date.parse(preview.expiresAt) <= Date.now()) throw new ImageProcessingError("expiredPreview");
  const response = await studioRequest(`/product-image/guest/${preview.previewId}/preview`, {});
  if (!/^image\/jpeg(?:;|$)/i.test(response.headers.get("Content-Type") || "")) throw new ImageProcessingError("mediaFailed");
  const blob = await response.blob();
  if (!blob.size) throw new ImageProcessingError("mediaFailed");
  return blob;
}
export async function claimGuestPreview(preview: GuestPreview): Promise<ImageResult> {
  if (!previewIdPattern.test(preview.previewId)) throw new ImageProcessingError("expiredPreview");
  const response = await studioRequest(`/product-image/guest/${preview.previewId}/claim`, { method: "POST" }, true);
  const value: unknown = await response.json();
  if (!isRecord(value) || typeof value.productId !== "string" || !/^[a-f0-9]{24}$/i.test(value.productId) || value.originalMediaUrl !== `/product-image/${value.productId}/media/original` || value.processedMediaUrl !== `/product-image/${value.productId}/media/processed`) throw new ImageProcessingError("uncertain");
  return { productId: value.productId, originalImage: value.originalMediaUrl, finalEditedImage: value.processedMediaUrl };
}
