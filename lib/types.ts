export type Role = "user" | "assistant";
export type ProviderId = "gemini" | "openai" | "anthropic" | "compatible" | "local";

export interface ChatImage {
  id: string;
  name: string;
  mime: string;
  /** data URL, already EXIF-stripped and resized by the image pipeline. */
  dataUrl: string;
  width: number;
  height: number;
}

export interface ChatMessage {
  id: string;
  role: Role;
  text: string;
  images?: ChatImage[];
  createdAt: number;
  feedback?: 1 | -1;
  sources?: { title: string; url: string }[];
  status?: "streaming" | "done" | "error" | "typing";
  /** Model that produced this assistant reply (SSE model event), if known. */
  model?: string;
  /** Two-step photo flow: which step produced this assistant reply. */
  mode?: "transcribe" | "analyse-confirmed";
}

export interface Chat {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

export interface Settings {
  provider: ProviderId;
  model: string;
  customBaseUrl: string;
  searchEnabled: boolean;
  theme: "system" | "dark" | "light";
  aboutMe: string;
  offlineModel: string;
}

export const DEFAULT_SETTINGS: Settings = {
  provider: "gemini",
  model: "",
  customBaseUrl: "",
  searchEnabled: false,
  theme: "system",
  aboutMe: "",
  offlineModel: "",
};

export interface ProviderCapability {
  id: ProviderId;
  label: string;
  vision: boolean;
  streaming: boolean;
  search: boolean;
  maxImages: number;
  maxImageBytes: number;
}

export const PROVIDER_CAPABILITIES: ProviderCapability[] = [
  { id: "gemini", label: "Google Gemini", vision: true, streaming: true, search: true, maxImages: 6, maxImageBytes: 20 * 1024 * 1024 },
  { id: "openai", label: "OpenAI", vision: true, streaming: true, search: true, maxImages: 6, maxImageBytes: 20 * 1024 * 1024 },
  { id: "anthropic", label: "Anthropic Claude", vision: true, streaming: true, search: false, maxImages: 6, maxImageBytes: 5 * 1024 * 1024 },
  { id: "compatible", label: "OpenAI-compatible", vision: true, streaming: true, search: false, maxImages: 6, maxImageBytes: 20 * 1024 * 1024 },
  { id: "local", label: "Local (Ollama / llama.cpp)", vision: false, streaming: true, search: false, maxImages: 0, maxImageBytes: 0 },
];

export { FOODLENS_SYSTEM_PROMPT, TRANSCRIPTION_ONLY_INSTRUCTION } from "./prompt";
