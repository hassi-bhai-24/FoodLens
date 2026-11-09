import { NextRequest } from "next/server";
import { jsonError, rateLimit, resolveOpenFoodFactsBaseUrl } from "@/lib/proxy";
import type { BarcodeProduct } from "@/lib/barcode";
import { checkDigitValid } from "@/lib/checkdigit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Open Food Facts lookup with the required User-Agent and ODbL
// attribution (attribution text lives in the UI footer). Data is
// crowdsourced and can be wrong; missing fields are listed, never invented.
export async function GET(req: NextRequest) {
  if (!rateLimit(req, "barcode")) return jsonError("Too many requests.", 429);
  const code = req.nextUrl.searchParams.get("code") || "";
  if (!/^\d{8}$|^\d{12}$|^\d{13}$/.test(code) || !checkDigitValid(code)) return jsonError("Invalid barcode.", 400);
  // Step B: test-only localhost override (FOODLENS_OFF_BASE_URL).
  // Ignored entirely in production; a non-localhost value in
  // non-production is a 400, never a fetch. See lib/proxy.ts.
  const offBase = resolveOpenFoodFactsBaseUrl();
  if (!offBase.ok) return jsonError(offBase.error, 400);
  try {
    const res = await fetch(`${offBase.baseUrl}/api/v2/product/${code}.json`, {
      headers: { "User-Agent": "FOODLENS/0.1 (standalone GitHub build; contact: see README)" },
      // Hard 15-second timeout: a stalled Open Food Facts connection must
      // return 502, never hang this route (same fix as the models route).
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 404) {
      // Open Food Facts answers 404 for a product it has never seen.
      // That is a normal "not found" result, not a lookup failure.
      return Response.json({ code, missing: ["product not found in Open Food Facts"], name: undefined } satisfies BarcodeProduct);
    }
    if (!res.ok) return jsonError("Barcode lookup failed.", 502);
    const data = (await res.json()) as { status?: number; product?: Record<string, unknown> };
    if (data.status !== 1 || !data.product) {
      return Response.json({ code, missing: ["product not found in Open Food Facts"], name: undefined } satisfies BarcodeProduct);
    }
    const p = data.product;
    const missing: string[] = [];
    const name = typeof p.product_name === "string" && p.product_name ? p.product_name : undefined;
    if (!name) missing.push("product name");
    const nutriments = (p.nutriments || {}) as Record<string, number>;
    const product: BarcodeProduct = {
      code,
      name,
      brands: typeof p.brands === "string" ? p.brands : undefined,
      categories: typeof p.categories === "string" ? p.categories : undefined,
      ingredients: typeof p.ingredients_text === "string" ? p.ingredients_text : undefined,
      allergens: typeof p.allergens === "string" ? p.allergens : undefined,
      nutriments,
      nutriscore: typeof p.nutriscore_grade === "string" ? p.nutriscore_grade : undefined,
      imageUrl: typeof p.image_url === "string" ? p.image_url : undefined,
      missing,
    };
    if (!product.ingredients) missing.push("ingredients");
    if (!product.brands) missing.push("brands");
    if (!product.categories) missing.push("categories");
    if (Object.keys(nutriments).length === 0) missing.push("nutrition values");
    return Response.json(product);
  } catch {
    return jsonError("Barcode lookup failed.", 502);
  }
}
