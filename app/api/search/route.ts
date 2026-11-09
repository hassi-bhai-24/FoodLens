import { NextRequest } from "next/server";
import { envKey, jsonError, rateLimit } from "@/lib/proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Real web search only when a search provider key is configured.
// Otherwise returns 503 and the chat proxy relies on provider-native
// search (Gemini/OpenAI) or answers without claiming a search happened.
export async function POST(req: NextRequest) {
  if (!rateLimit(req, "search")) return jsonError("Too many requests.", 429);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid request.", 400);
  }
  const q = (body as { q?: string }).q?.trim();
  if (!q || q.length > 300) return jsonError("Invalid query.", 400);
  const tavily = envKey("TAVILY_API_KEY");
  const brave = envKey("BRAVE_API_KEY");
  try {
    if (tavily) {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: tavily, query: q, max_results: 5, include_domains: ["who.int", "fda.gov", "usda.gov", "efsa.europa.eu", "nhs.uk"] }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return jsonError("Search failed.", 502);
      const data = (await res.json()) as { results?: { title?: string; url?: string }[] };
      return Response.json({ results: (data.results || []).map((r) => ({ title: r.title || r.url || "", url: r.url || "" })).filter((r) => r.url) });
    }
    if (brave) {
      const res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=5`, {
        headers: { Accept: "application/json", "X-Subscription-Token": brave },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return jsonError("Search failed.", 502);
      const data = (await res.json()) as { web?: { results?: { title?: string; url?: string }[] } };
      return Response.json({ results: (data.web?.results || []).map((r) => ({ title: r.title || "", url: r.url || "" })).filter((r) => r.url) });
    }
    return jsonError("Web search is not configured on this deployment (no Tavily/Brave key). Enable provider-native search or add a search key.", 503);
  } catch {
    return jsonError("Search failed.", 502);
  }
}
