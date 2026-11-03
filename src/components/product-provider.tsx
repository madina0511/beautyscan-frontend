"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createProductWorkspace } from "@/lib/product-workspace";

const ProductContext = createContext<ReturnType<typeof createProductWorkspace> | null>(null);
export function ProductProvider({ children, authenticated }: { children: ReactNode; authenticated: boolean }) {
  const [workspace] = useState(createProductWorkspace);
  useEffect(() => { if (authenticated) void workspace.load(); }, [authenticated, workspace]);
  return <ProductContext.Provider value={workspace}>{children}</ProductContext.Provider>;
}
export function useProductWorkspace() {
  const value = useContext(ProductContext);
  if (!value) throw new Error("ProductProvider is required");
  return value;
}
