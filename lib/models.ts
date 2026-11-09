// Provider model defaults, fallback chain and chat temperature.
// Single place for model selection so the chat route, the model list
// and tests all agree. User-chosen models take precedence over env
// defaults; env defaults take precedence over built-in defaults.

export const CHAT_TEMPERATURE = 0.3;

export const GEMINI_DEFAULT_MODEL = "gemini-3.8-flash";
export const OPENAI_DEFAULT_MODEL = "gpt-6-luna";
export const ANTHROPIC_DEFAULT_MODEL = "claude-sonnet-5-5";
// Hugging Face Inference Providers default: Qwen3.8-27B — Apache 2.0,
// native vision (text + image input on the router), cheap on the
// router's fastest providers, and the strongest open model that takes
// photos. Verified live on the router 2026-11-09.
export const HF_DEFAULT_MODEL = "Qwen/Qwen3.8-27B";
export const LOCAL_DEFAULT_MODEL = "llama3.1";

// Gemini models tried, in order, when the primary model returns a
// model-not-found (404) error. Quota/429 errors never fall back.
//
// Defaults verified 2026-11-06 against the providers' own published
// lists: Google's models page lists gemini-3.8-flash as the current
// Flash model and gemini-3.6-flash / gemini-3.5-flash-lite as stable;
// the old default gemini-3.5-flash is a deprecated alias (Google routes
// it to gemini-3.6-flash) and is no longer in the current list, and
// gemini-flash-latest is not a published model ID. OpenAI's own
// deprecations page shuts gpt-4o-mini down on 2027-01-14 and names
// gpt-6-luna as the replacement. Anthropic's models overview lists
// Claude Sonnet 5.5 as the current Sonnet; Sonnet 4.5 retires
// 2026-11-30 with claude-sonnet-5-5 as the replacement.
export const GEMINI_FALLBACK_MODELS: readonly string[] = [
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
];

export type ChatProvider = "gemini" | "openai" | "anthropic" | "huggingface" | "compatible" | "local";

const ENV_KEYS: Record<ChatProvider, string[]> = {
  gemini: ["FOODLENS_GEMINI_MODEL", "GEMINI_MODEL"],
  openai: ["FOODLENS_OPENAI_MODEL", "OPENAI_MODEL"],
  anthropic: ["FOODLENS_ANTHROPIC_MODEL", "ANTHROPIC_MODEL"],
  huggingface: ["FOODLENS_HF_MODEL", "HF_MODEL"],
  compatible: ["FOODLENS_COMPATIBLE_MODEL"],
  local: ["FOODLENS_LOCAL_MODEL", "OLLAMA_MODEL"],
};

const BUILTIN_DEFAULTS: Record<ChatProvider, string> = {
  gemini: GEMINI_DEFAULT_MODEL,
  openai: OPENAI_DEFAULT_MODEL,
  anthropic: ANTHROPIC_DEFAULT_MODEL,
  huggingface: HF_DEFAULT_MODEL,
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
