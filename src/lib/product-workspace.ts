import { AuthError } from "./auth";
import { createProduct, listProducts, ProductError, type Product } from "./products";
import type { PackagingResult } from "./packaging";
import type { ImageResult } from "./product-image";

type ErrorKey = "productError" | "nameError" | "connectionError" | "sessionExpired";
type State = {
  status: "idle" | "loading" | "ready" | "error"; products: Product[]; selectedId: string | null;
  error: ErrorKey | null; creating: boolean; createError: ErrorKey | null; created: boolean;
};
function errorKey(error: unknown): ErrorKey {
  if (error instanceof ProductError) return error.kind;
  if (error instanceof AuthError) return error.kind === "connectionError" || error.kind === "sessionExpired" ? error.kind : "productError";
  return "productError";
}

// Each mounted account workspace owns its state. No product/profile state is
// persisted to browser storage or shared across accounts.
export function createProductWorkspace() {
  let state: State = { status: "idle", products: [], selectedId: null, error: null, creating: false, createError: null, created: false };
  const initial = state;
  const listeners = new Set<() => void>();
  let loadFlight: Promise<void> | null = null;
  let creationVersion = 0;
  const changed = new Map<string, number>();
  function publish(patch: Partial<State>) {
    state = { ...state, ...patch };
    listeners.forEach(listener => listener());
  }
  return {
    getSnapshot: () => state,
    getServerSnapshot: () => initial,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    select(id: string) {
      if (state.products.some(product => product._id === id)) publish({ selectedId: id, created: false });
    },
    updateImages(result: ImageResult) {
      creationVersion++;
      changed.set(result.productId, creationVersion);
      publish({ products: state.products.map(product => product._id === result.productId ? { ...product, originalImage: result.originalImage, finalEditedImage: result.finalEditedImage } : product) });
    },
    updatePackaging(result: PackagingResult) {
      creationVersion++;
      changed.set(result.productId, creationVersion);
      publish({ products: state.products.map(product => product._id === result.productId ? { ...product, packageImage: result.packageImage, descriptions: { ...product.descriptions, [result.language]: result.description } } : product) });
    },
    load(): Promise<void> {
      if (loadFlight) return loadFlight;
      const version = creationVersion;
      publish({ status: "loading", error: null });
      loadFlight = listProducts().then(products => {
        // Keep a product created while the older list request was in flight.
        const current = new Map(state.products.map(product => [product._id, product]));
        const merged = version === creationVersion ? products : [
          ...state.products.filter(item => !products.some(product => product._id === item._id) && (changed.get(item._id) ?? 0) > version),
          ...products.map(product => (changed.get(product._id) ?? 0) > version ? current.get(product._id) ?? product : product),
        ];
        publish({ status: "ready", products: merged,
          selectedId: merged.some(product => product._id === state.selectedId) ? state.selectedId : null });
      }).catch(error => { publish({ status: "error", error: errorKey(error) }); }).finally(() => { loadFlight = null; });
      return loadFlight;
    },
    async reload(): Promise<void> {
      // A request begun before saving must finish before fetching fresh history.
      if (loadFlight) await loadFlight;
      await this.load();
    },
    async create(name: string): Promise<boolean> {
      if (state.creating) return false;
      publish({ creating: true, createError: null, created: false });
      try {
        const product = await createProduct(name);
        creationVersion++;
        changed.set(product._id, creationVersion);
        publish({ products: [product, ...state.products.filter(item => item._id !== product._id)], selectedId: product._id, created: true });
        return true;
      } catch (error) {
        publish({ createError: errorKey(error) });
        return false;
      } finally { publish({ creating: false }); }
    },
  };
}
