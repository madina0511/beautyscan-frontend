import { isRecord } from "./auth";
import { authenticatedRequest } from "./auth-session";
import type { Locale } from "./messages";

export type Product = {
  _id: string; name: string; originalImage: string | null; finalEditedImage: string | null;
  packageImage: string | null; descriptions: Partial<Record<Locale, string>>; createdAt: string; updatedAt: string;
};
const fields = "_id name originalImage finalEditedImage packageImage descriptions { uz en ru ko } createdAt updatedAt";
export const productOperations = {
  list: `query MyProducts { myProducts { ${fields} } }`,
  create: `mutation CreateProduct($name: String!) { createProduct(name: $name) { ${fields} } }`,
};
export class ProductError extends Error {
  constructor(public readonly kind: "productError" | "nameError" = "productError") { super(kind); }
}
function optionalString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new ProductError();
  return value;
}
export function parseProduct(value: unknown): Product {
  if (!isRecord(value) || typeof value._id !== "string" || !/^[a-f\d]{24}$/i.test(value._id) ||
    typeof value.name !== "string" || typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt)) ||
    typeof value.updatedAt !== "string" || !Number.isFinite(Date.parse(value.updatedAt))) throw new ProductError();
  if (value.descriptions !== undefined && value.descriptions !== null && !isRecord(value.descriptions)) throw new ProductError();
  const descriptions: Product["descriptions"] = {};
  for (const language of ["uz", "en", "ko", "ru"] as const) {
    const text = optionalString(isRecord(value.descriptions) ? value.descriptions[language] : null);
    if (text) descriptions[language] = text;
  }
  return { _id: value._id, name: value.name, createdAt: value.createdAt, updatedAt: value.updatedAt,
    originalImage: optionalString(value.originalImage), finalEditedImage: optionalString(value.finalEditedImage),
    packageImage: optionalString(value.packageImage), descriptions };
}
export async function listProducts(): Promise<Product[]> {
  const data = await authenticatedRequest(productOperations.list);
  if (!isRecord(data) || !Array.isArray(data.myProducts)) throw new ProductError();
  return data.myProducts.map(parseProduct);
}
export async function createProduct(name: string): Promise<Product> {
  const trimmed = name.trim();
  // A client-side usability limit; the existing backend has no name-length DTO.
  if (!trimmed || Array.from(trimmed).length > 150) throw new ProductError("nameError");
  const data = await authenticatedRequest(productOperations.create, { name: trimmed });
  if (!isRecord(data)) throw new ProductError();
  return parseProduct(data.createProduct);
}

// Only use an absolute browser URL actually returned by the API. In particular,
// uploads/... and Windows paths must never be prefixed with an invented origin.
export function savedMediaUrl(reference: string | null): string | null {
  if (!reference || !/^https?:\/\//i.test(reference)) return null;
  try {
    const url = new URL(reference);
    if (url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}
