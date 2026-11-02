// Barcode validation (EAN-13 / EAN-8 / UPC-A check digits) and
// Open Food Facts lookup via the server route (which sets the required
// User-Agent). Results are cached in IndexedDB; crowdsourced data can
// be wrong and missing fields are marked clearly — never invented.
import { getBarcodeCache, putBarcodeCache } from "./db";

export { checkDigitValid } from "./checkdigit";

export interface BarcodeProduct {
  code: string;
  name?: string;
  brands?: string;
  categories?: string;
  ingredients?: string;
  allergens?: string;
  nutriments?: Record<string, number | undefined>;
  nutriscore?: string;
  imageUrl?: string;
  missing: string[];
}

export async function lookupBarcode(code: string): Promise<BarcodeProduct> {
  const cached = await getBarcodeCache(code).catch(() => undefined);
  if (cached && Date.now() - cached.cachedAt < 7 * 24 * 3600 * 1000) {
    return cached.data as BarcodeProduct;
  }
  const res = await fetch(`/api/barcode?code=${encodeURIComponent(code)}`);
  if (!res.ok) throw new Error("Barcode lookup failed. Check your connection and try again, or send a photo of the label.");
  const product = (await res.json()) as BarcodeProduct;
  await putBarcodeCache({ code, data: product, cachedAt: Date.now() }).catch(() => undefined);
  return product;
}
