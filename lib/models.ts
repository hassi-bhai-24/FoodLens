// Provider model defaults, fallback chain and chat temperature.
// Single place for model selection so the chat route, the model list
// and tests all agree. User-chosen models take precedence over env
// defaults; env defaults take precedence over built-in defaults.

export const CHAT_TEMPERATURE = 0.3;

export const GEMINI_DEFAULT_MODEL = "gemini-3.5-flash";
export const OPENAI_DEFAULT_MODEL = "gpt-4o-mini";
export const ANTHROPIC_DEFAULT_MODEL = "claude-sonnet-4-5";
export const LOCAL_DEFAULT_MODEL = "llama3.1";

// Gemini models tried, in order, when the primary model returns a
// model-not-found (404) error. Quota/429 errors never fall back.
export const GEMINI_FALLBACK_MODELS: readonly string[] = [
  "gemini-3.5-flash-lite",
  "gemini-flash-latest",
];

export type ChatProvider = "gemini" | "openai" | "anthropic" | "compatible" | "local";

const ENV_KEYS: Record<ChatProvider, string[]> = {
  gemini: ["FOODLENS_GEMINI_MODEL", "GEMINI_MODEL"],
  openai: ["FOODLENS_OPENAI_MODEL", "OPENAI_MODEL"],
  anthropic: ["FOODLENS_ANTHROPIC_MODEL", "ANTHROPIC_MODEL"],
  compatible: ["FOODLENS_COMPATIBLE_MODEL"],
  local: ["FOODLENS_LOCAL_MODEL", "OLLAMA_MODEL"],
};

const BUILTIN_DEFAULTS: Record<ChatProvider, string> = {
  gemini: GEMINI_DEFAULT_MODEL,
  openai: OPENAI_DEFAULT_MODEL,
  anthropic: ANTHROPIC_DEFAULT_MODEL,
  compatible: OPENAI_DEFAULT_MODEL,
  local: LOCAL_DEFAULT_MODEL,
};

export function defaultModelForProvider(
  provider: ChatProvider,
  env: Record<string, string | undefined> = {},
): string {
  for (const key of ENV_KEYS[provider]) {
    const v = env[key];
    if (v && v.trim()) return v.trim();
  }
  return BUILTIN_DEFAULTS[provider];
}

export function resolveChatModel(
  provider: ChatProvider,
  userModel: string | undefined,
  env: Record<string, string | undefined> = {},
): string {
  const trimmed = (userModel || "").trim();
  return trimmed || defaultModelForProvider(provider, env);
}

/** Ordered Gemini models to try: the primary first, then fallbacks, de-duplicated. */
export function geminiFallbackChain(primary: string): string[] {
  const chain = [primary];
  for (const m of GEMINI_FALLBACK_MODELS) {
    if (!chain.includes(m)) chain.push(m);
  }
  return chain;
}
