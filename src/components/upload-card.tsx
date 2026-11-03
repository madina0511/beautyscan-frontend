"use client";
import { ProductImageStudio } from "./product-image-studio";
import { PackagingStudio } from "./packaging-studio";
export function UploadCard({ kind }: { kind: "product" | "packaging" }) {
  return kind === "product" ? <ProductImageStudio /> : <PackagingStudio />;
}
