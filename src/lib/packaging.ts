import { AuthError, isRecord } from "./auth";
import { authenticatedOperation, getAuthSnapshot } from "./auth-session";
import { backendUrl, validateImage } from "./product-image";
import type { Locale } from "./messages";

export type PackagingResult = { productId: string; language: Locale; extractedText: string; description: string; packageImage: string };
export type PackagingErrorKey = "chooseProduct" | "chooseLanguage" | "noText" | "ocrFailed" | "aiFailed" | "unverified" | "insufficient" | "invalid" | "noAccess" | "failed";
export class PackagingError extends Error {
  constructor(public readonly kind: PackagingErrorKey) { super(kind); }
}
export function isDescriptionLanguage(value: string): value is Locale { return ["uz", "en", "ko", "ru"].includes(value); }
const running = new Set<string>();
export async function generatePackagingDescription(productId: string, file: File, language: string): Promise<PackagingResult> {
  if (getAuthSnapshot().status !== "authenticated") throw new AuthError("sessionExpired");
  if (!/^[a-f\d]{24}$/i.test(productId)) throw new PackagingError("chooseProduct");
  if (!isDescriptionLanguage(language)) throw new PackagingError("chooseLanguage");
  try { validateImage(file); } catch { throw new PackagingError("invalid"); }
  if (running.has(productId)) throw new PackagingError("failed");
  running.add(productId);
  try {
    return await authenticatedOperation(async token => {
      const body = new FormData(); body.append("image", file); body.append("productId", productId); body.append("language", language);
      let response: Response;
      try { response = await fetch(backendUrl("/ocr/upload"), { method: "POST", headers: { Authorization: `Bearer ${token}` }, credentials: "include", body, cache: "no-store", signal: AbortSignal.timeout(180_000) }); }
      catch { throw new PackagingError("failed"); }
      if (response.status === 401) throw new AuthError("sessionExpired");
      if (response.status === 403 || response.status === 404) throw new PackagingError("noAccess");
      let value: unknown; try { value = await response.json(); } catch { throw new PackagingError("failed"); }
      if (!response.ok) {
        const code = isRecord(value) ? value.code : undefined;
        if (code === "PACKAGING_INFORMATION_INSUFFICIENT") throw new PackagingError("insufficient");
        if (code === "DESCRIPTION_UNAVAILABLE" && isRecord(value) && value.reason === "RESPONSE_NOT_VERIFIED") throw new PackagingError("unverified");
        throw new PackagingError(code === "OCR_NO_TEXT" ? "noText" : code === "OCR_UNAVAILABLE" ? "ocrFailed" : code === "DESCRIPTION_UNAVAILABLE" ? "aiFailed" : response.status === 413 || response.status === 400 ? "invalid" : "failed");
      }
      if (!isRecord(value) || value.productId !== productId || value.language !== language || typeof value.extractedText !== "string" || !value.extractedText.trim() || typeof value.description !== "string" || !value.description.trim() || typeof value.packageImage !== "string" || !value.packageImage) throw new PackagingError("failed");
      return { productId, language, extractedText: value.extractedText, description: value.description, packageImage: value.packageImage };
    });
  } finally { running.delete(productId); }
}
