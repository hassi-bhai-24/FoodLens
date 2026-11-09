"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { deleteChat, getKv, listChats, putChat, putKv } from "@/lib/db";
import { loadApiKey, removeApiKey, saveApiKey } from "@/lib/crypto";
import { processImageFile, dataUrlSizeBytes, MAX_IMAGES_PER_MESSAGE } from "@/lib/image";
import { flagUnverifiedAnalysis } from "@/lib/photo-check";
import { classifyUserText } from "@/lib/guards";
import { answerLocally } from "@/lib/local-answers";
import { checkDigitValid, lookupBarcode, type BarcodeProduct } from "@/lib/barcode";
import { Markdown } from "@/lib/markdown";
import { DEFAULT_SETTINGS, PROVIDER_CAPABILITIES, type Chat, type ChatImage, type ChatMessage, type ProviderId, type Settings } from "@/lib/types";
import { BUILD_LABEL } from "@/lib/build";

const CHIPS = ["What's on my plate?", "Is this biscuit healthy?", "Help me understand food labels.", "What can I cook today?", "What are these ingredients?"];

function newChat(): Chat {
  const now = Date.now();
  return { id: crypto.randomUUID(), title: "New chat", createdAt: now, updatedAt: now, messages: [] };
}

function friendlyError(status: number, fallback: string): string {
  if (status === 401) return "I couldn't answer that from local knowledge. Add an API key in Settings (optional) to unlock full AI answers.";
  if (status === 429) return "The provider is rate-limited. Please wait a moment and try again.";
  if (status === 502) return "The AI provider or local model could not be reached. Check your connection, key and model, then try again.";
  return fallback;
}

// Photo quality warning (preview v7, Test 18 gap): computed on-device in
// the image pipeline, this warns BEFORE a blurry or dark photo is sent.
// Advice only — sending is never blocked, because a photo of food (not a
// label) needs no readable text. First person, plain paragraph, no
// headings — same answer style as FOODLENS replies.
function photoQualityNotice(images: ChatImage[]): string | null {
  const names = (list: ChatImage[]) => list.map((i) => i.name).join(", ");
  const blurry = images.filter((i) => i.quality?.blurry || i.quality?.flat);
  const dark = images.filter((i) => i.quality?.dark);
  const parts: string[] = [];
  if (blurry.length > 0) {
    parts.push(`This photo looks blurry to me: ${names(blurry)}. If it is a label, I may not be able to read the ingredients from it reliably, and I would rather you retake it steady, close to the label and in focus than have me guess and get it wrong. If it is just a photo of food, you can send it as it is.`);
  }
  if (dark.length > 0) {
    parts.push(`This photo looks quite dark to me: ${names(dark)}. Dim light is where I misread labels most, so I would retake it with more light on the label before sending it for a label check.`);
  }
  return parts.length > 0 ? parts.join(" ") : null;
}

export default function Home() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<ChatImage[]>([]);
  const [generating, setGenerating] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [statusLine, setStatusLine] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showBarcode, setShowBarcode] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [keySaved, setKeySaved] = useState(false);
  const [testStatus, setTestStatus] = useState("");
  const [barcodeCode, setBarcodeCode] = useState("");
  const [barcodeResult, setBarcodeResult] = useState<BarcodeProduct | null>(null);
  const [barcodeError, setBarcodeError] = useState<string | null>(null);
  const [barcodeScanning, setBarcodeScanning] = useState(false);
  // Batch 5: scanned product data is sent to the chat route as a
  // delimited payload, never pasted into the user's message text.
  const [pendingBarcode, setPendingBarcode] = useState<BarcodeProduct | null>(null);
  // Two-step photo flow (Batch 2 / B28): after a transcription reply,
  // the user edits/confirms what was read before any analysis happens.
  const [pendingConfirm, setPendingConfirm] = useState<{ chatId: string; transcription: string; question: string } | null>(null);
  const [confirmDraft, setConfirmDraft] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  // Local-answer animation (no-key path): the typing pause and the
  // word-by-word reveal run on timers. The refs let Stop cancel them
  // and let the unmount cleanup clear a pending timer.
  const localTimerRef = useRef<number | null>(null);
  const localResolveRef = useRef<(() => void) | null>(null);
  const localStopRef = useRef(false);

  // Stop whatever is generating: abort the cloud fetch and cancel the
  // local typing/reveal animation. The reveal promise resolves so the
  // local branch can save what has been shown so far.
  const stopReply = useCallback(() => {
    abortRef.current?.abort();
    localStopRef.current = true;
    if (localTimerRef.current !== null) {
      window.clearTimeout(localTimerRef.current);
      localTimerRef.current = null;
    }
    localResolveRef.current?.();
  }, []);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const headerRef = useRef<HTMLElement | null>(null);
  // B31 refinement (parent verification): the mobile sidebar starts
  // below the measured header height, so the menu toggle is never
  // covered. Measured after mount and on resize; 0 means "not yet
  // measured" and the CSS fallback (0px) applies for the first frame.
  const [sidebarTop, setSidebarTop] = useState(0);

  const active = chats.find((c) => c.id === activeId) || null;

  const loadAll = useCallback(async () => {
    setLoadError(null);
    try {
      const [loadedChats, savedSettings] = await Promise.all([listChats(), getKv<Settings>("settings")]);
      setChats(loadedChats);
      if (savedSettings) setSettings({ ...DEFAULT_SETTINGS, ...savedSettings });
      setSettingsLoaded(true);
      // Verify the key actually loads, not just that a blob exists: a
      // blob saved before the key vault was made persistent (v4) can
      // never decrypt, and must not make Settings claim a key is
      // stored. loadApiKey drops such a stale blob on a failed load.
      setKeySaved((await loadApiKey((savedSettings?.provider || DEFAULT_SETTINGS.provider) as ProviderId)) !== null);
    } catch {
      setLoadError("Chats and settings could not be loaded from this browser. Your data was not deleted. Try reloading, or use Retry below.");
    }
  }, []);

  useEffect(() => {
    loadAll();
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    return () => {
      if (localTimerRef.current !== null) window.clearTimeout(localTimerRef.current);
    };
  }, [loadAll]);

  // Desktop starts with the sidebar open; mobile starts closed. Done
  // after mount so the first render matches the server (no hydration
  // mismatch) and the sidebar simply slides in on wide screens.
  useEffect(() => {
    if (window.innerWidth > 720) setSidebarOpen(true);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme === "system" ? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : settings.theme;
    if (settingsLoaded) putKv("settings", settings).catch(() => undefined);
  }, [settings, settingsLoaded]);

  // B31 (Step A): Esc closes the mobile sidebar. The backdrop and the
  // visible X button in the sidebar are the other two ways out; no
  // close path requires selecting a chat.
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSidebarOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sidebarOpen]);

  useEffect(() => {
    const measure = () => { if (headerRef.current) setSidebarTop(headerRef.current.offsetHeight); };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    // Only auto-scroll when there is actually a conversation to show.
    // On the empty welcome screen (no messages) this used to scroll the
    // greeting off the top of the screen on mobile on first load.
    if ((active?.messages?.length ?? 0) === 0 && !thinking) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [active?.messages, thinking]);

  const saveChat = useCallback(async (chat: Chat) => {
    const updated = { ...chat, updatedAt: Date.now() };
    await putChat(updated);
    setChats((prev) => {
      const rest = prev.filter((c) => c.id !== updated.id);
      return [updated, ...rest].sort((a, b) => b.updatedAt - a.updatedAt);
    });
    return updated;
  }, []);

  const ensureChat = useCallback((): Chat => {
    if (active) return active;
    const chat = newChat();
    setChats((prev) => [chat, ...prev]);
    setActiveId(chat.id);
    return chat;
  }, [active]);

  // Returns true when a reply (full or partial) was saved, false when
  // nothing was sent. The prompt bar is never restored on failure —
  // the message is already in the chat history.
  async function streamReply(chat: Chat, history: ChatMessage[], opts?: { mode?: "transcribe" | "analyse-confirmed"; confirmedIngredients?: string; barcodeData?: BarcodeProduct }): Promise<{ sent: boolean; text: string; model?: string }> {
    const cap = PROVIDER_CAPABILITIES.find((p) => p.id === settings.provider)!;
    // In analyse-confirmed mode the route strips image parts, so the
    // provider image budget is not consumed; do not re-count history photos.
    const images = opts?.mode === "analyse-confirmed" ? [] : history.flatMap((m) => m.images || []);
    if (settings.provider !== "local" && images.length > cap.maxImages) {
      setError(`This provider supports at most ${cap.maxImages} images per conversation. Start a new chat or remove some photos.`);
      return { sent: false, text: "" };
    }
    const totalImageBytes = images.reduce((n, i) => n + dataUrlSizeBytes(i.dataUrl), 0);
    if (totalImageBytes > cap.maxImageBytes) {
      setError(`Photos in this conversation are over this provider's ${Math.round(cap.maxImageBytes / 1024 / 1024)} MB limit. Start a new chat or remove some photos.`);
      return { sent: false, text: "" };
    }
    if (settings.provider === "local" && images.length > 0) {
      setError("Photos need an online vision provider, or a local Ollama model with vision support. The local text path in this build cannot see photos. Your message was kept — remove the photos or switch provider in Settings.");
      return { sent: false, text: "" };
    }
    // No-key path: when no API key is saved for this provider, answer
    // from FOODLENS local knowledge instead of failing outright. The
    // cloud path with a key is untouched. Photo flows (transcribe /
    // analyse-confirmed) need vision, so they always use the provider.
    const savedKey = await loadApiKey(settings.provider);
    if (settings.provider !== "local" && !savedKey && images.length === 0 && !opts?.mode) {
      const lastUserText = [...history].reverse().find((m) => m.role === "user")?.text || "";
      const guard = classifyUserText(lastUserText, false);
      // Pass the recent chat (excluding this new message) so follow-ups
      // like "why?" or "is that better than roti?" can resolve "that".
      const prevTurns = history.slice(0, -1).slice(-6).map((m) => ({ role: m.role, text: m.text }));
      const localText = guard ? guard.text : answerLocally(lastUserText, { barcodeData: opts?.barcodeData, history: prevTurns });
      if (localText) {
        // Local answers are instant, so animate them like a real chatbot:
        // typing dots first (~0.7s), then the answer revealed word by word
        // with a blinking cursor. The cloud path below is untouched.
        setGenerating(true);
        localStopRef.current = false;
        const assistant: ChatMessage = { id: crypto.randomUUID(), role: "assistant", text: "", createdAt: Date.now(), status: "typing", model: "FOODLENS local answers" };
        const working: Chat = { ...chat, messages: [...history, assistant] };
        setChats((prev) => prev.map((c) => (c.id === chat.id ? working : c)));
        const updateLocal = (text: string, status: "typing" | "streaming" | "done") => {
          setChats((prev) => prev.map((c) => (c.id === chat.id ? { ...c, messages: c.messages.map((m) => (m.id === assistant.id ? { ...m, text, status } : m)) } : c)));
        };
        // Split keeping the whitespace so the reveal rebuilds the exact text.
        const parts = localText.split(/(\s+)/).filter((p) => p.length > 0);
        let shown = "";
        let partIdx = 0;
        let typingTicks = 0;
        const TYPING_TICKS = 34; // 34 x 35ms ≈ 1.2s of typing dots
        await new Promise<void>((resolve) => {
          localResolveRef.current = resolve;
          const tick = () => {
            if (localStopRef.current) { resolve(); return; }
            if (typingTicks < TYPING_TICKS) {
              typingTicks++;
              localTimerRef.current = window.setTimeout(tick, 35);
              return;
            }
            const chunk = parts.slice(partIdx, partIdx + 2).join("");
            partIdx += 2;
            shown += chunk;
            updateLocal(shown, "streaming");
            if (partIdx >= parts.length) { resolve(); return; }
            localTimerRef.current = window.setTimeout(tick, 35);
          };
          localTimerRef.current = window.setTimeout(tick, 35);
        });
        localResolveRef.current = null;
        localTimerRef.current = null;
        const stopped = localStopRef.current;
        // Stopped before a word appeared: the answer was already computed,
        // so deliver it whole rather than leaving an empty bubble.
        const finalText = stopped && shown === "" ? localText : stopped ? shown : localText;
        const doneMsg: ChatMessage = { ...assistant, text: finalText, status: "done" };
        const finalChat: Chat = { ...chat, messages: [...history, doneMsg], title: chat.messages.length <= 1 ? (history[0]?.text.slice(0, 48) || "New chat") : chat.title };
        await saveChat(finalChat);
        setGenerating(false);
        return { sent: true, text: finalText, model: "FOODLENS local answers" };
      }
      // No local answer for this question: fall through to the cloud
      // call, which returns the usual "no key" message when no key
      // exists anywhere.
    }
    setGenerating(true);
    setThinking(true);
    setStatusLine(settings.searchEnabled ? "Searching the web…" : "");
    const controller = new AbortController();
    abortRef.current = controller;
    const assistant: ChatMessage = { id: crypto.randomUUID(), role: "assistant", text: "", createdAt: Date.now(), status: "streaming", mode: opts?.mode };
    const working: Chat = { ...chat, messages: [...history, assistant] };
    setChats((prev) => prev.map((c) => (c.id === chat.id ? working : c)));
    let fullText = "";
    let streamed = false;
    let modelUsed: string | undefined;
    try {
      const apiKey = savedKey;
      const res = await fetch("/api/chat", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: settings.provider,
          model: settings.model || undefined,
          customBaseUrl: settings.customBaseUrl || undefined,
          apiKey: apiKey || undefined,
          searchEnabled: settings.searchEnabled,
          aboutMe: settings.aboutMe || undefined,
          mode: opts?.mode,
          confirmedIngredients: opts?.confirmedIngredients,
          barcodeData: opts?.barcodeData,
          messages: history.map((m) => ({ role: m.role, text: m.text, images: m.images?.map((i) => ({ dataUrl: i.dataUrl, mime: i.mime })) })),
        }),
      });
      setThinking(false);
      setStatusLine("");
      if (!res.ok) {
        let msg = friendlyError(res.status, "Something went wrong. Your message is saved in the chat — try again.");
        try { const j = await res.json(); if (j?.error) msg = j.error; } catch { /* keep friendly message */ }
        throw new Error(msg);
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (payload === "[DONE]") continue;
          try {
            const j = JSON.parse(payload) as { delta?: string; model?: string };
            if (j.model) modelUsed = j.model;
            if (j.delta) {
              fullText += j.delta;
              streamed = true;
              const current = fullText;
              setChats((prev) => prev.map((c) => (c.id === chat.id ? { ...c, messages: c.messages.map((m) => (m.id === assistant.id ? { ...m, text: current } : m)) } : c)));
            }
          } catch { /* ignore partial SSE lines */ }
        }
      }
            // Deterministic backstop (Batch 2): in analyse-confirmed mode, flag
      // any E-number/allergen in the analysis that is not in the confirmed text.
      if (opts?.mode === "analyse-confirmed" && opts.confirmedIngredients) {
        fullText = flagUnverifiedAnalysis(fullText, opts.confirmedIngredients);
      }
      const doneMsg: ChatMessage = { ...assistant, text: fullText || "The provider returned an empty reply.", status: "done", model: modelUsed };
      const finalChat: Chat = { ...working, messages: working.messages.map((m) => (m.id === assistant.id ? doneMsg : m)), title: chat.messages.length <= 1 ? (history[0]?.text.slice(0, 48) || "New chat") : chat.title };
      await saveChat(finalChat);
      return { sent: true, text: fullText, model: modelUsed };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      // Partial replies are saved, never discarded silently.
      const partial: ChatMessage = { ...assistant, text: fullText || msg, status: "error" };
      const partialChat: Chat = { ...working, messages: working.messages.map((m) => (m.id === assistant.id ? partial : m)) };
      setChats((prev) => prev.map((c) => (c.id === chat.id ? partialChat : c)));
      await putChat(partialChat).catch(() => undefined);
      setError(controller.signal.aborted ? "Generation stopped. The partial reply was kept." : msg);
      return { sent: streamed, text: fullText, model: modelUsed };
    } finally {
      setGenerating(false);
      setThinking(false);
      setStatusLine("");
      abortRef.current = null;
    }
  }

  // baseChat/baseHistory are used by Edit & resend so the trimmed
  // history is the one actually sent — never a stale `active` closure.
  async function send(text?: string, baseChat?: Chat, baseHistory?: ChatMessage[]) {
    const content = (text ?? input).trim();
    if (!content && attachments.length === 0) return;
    if (generating) return;
    setError(null);
    const chat = baseChat ?? ensureChat();
    const draftAttachments = attachments;
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", text: content || "(photo attached)", images: attachments.length ? [...attachments] : undefined, createdAt: Date.now(), status: "done" };
    const history = [...(baseHistory ?? chat.messages), userMsg];
    setAttachments([]);
    setInput("");
    const withUser = { ...chat, messages: history, title: (baseHistory ?? chat.messages).length === 0 ? content.slice(0, 48) || "Photo chat" : chat.title };
    await saveChat(withUser);
    // A photo must NEVER go straight to analysis: first step is
    // transcription only. The confirm box (below) gates the analysis.
    const isPhotoSend = draftAttachments.length > 0;
    if (!isPhotoSend) setPendingConfirm(null);
    const barcodeForSend = pendingBarcode;
    setPendingBarcode(null);
    const result = await streamReply(withUser, history, isPhotoSend ? { mode: "transcribe" } : barcodeForSend ? { barcodeData: barcodeForSend } : undefined);
    if (isPhotoSend && result.sent && result.text) {
      setPendingConfirm({ chatId: chat.id, transcription: result.text, question: content });
      setConfirmDraft(result.text);
    }
    // The prompt bar stays cleared even when the reply failed: the
    // user's message (text and any photos) is already saved in the chat
    // history, and the error text explains the failed reply. Restoring
    // the draft here used to leave the prompt sitting in the bar.
  }

  // Step 2 of the photo flow: only the confirmed text is analysed.
  // The photo is NOT re-sent; the route strips images in this mode.
  async function confirmTranscription() {
    if (!pendingConfirm || !active || pendingConfirm.chatId !== active.id || generating) return;
    const confirmed = confirmDraft.trim();
    if (!confirmed) return;
    setError(null);
    const userText = pendingConfirm.question
      ? `My question: ${pendingConfirm.question}\nConfirmed ingredients I read: ${confirmed}`
      : `Confirmed ingredients I read: ${confirmed}`;
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", text: userText, createdAt: Date.now(), status: "done" };
    const history = [...active.messages, userMsg];
    const withUser = { ...active, messages: history };
    const savedQuestion = pendingConfirm.question;
    const savedDraft = confirmDraft;
    await saveChat(withUser);
    setPendingConfirm(null);
    const result = await streamReply(withUser, history, { mode: "analyse-confirmed", confirmedIngredients: confirmed });
    if (!result.sent) {
      // Analysis did not reach the provider: restore the confirm box
      // so the confirmed text is not lost.
      setPendingConfirm({ chatId: active.id, transcription: savedDraft, question: savedQuestion });
      setConfirmDraft(confirmed);
    }
  }

  async function addFiles(files: FileList | File[]) {
    setError(null);
    const list = Array.from(files);
    if (attachments.length + list.length > MAX_IMAGES_PER_MESSAGE) {
      setError(`You can attach up to ${MAX_IMAGES_PER_MESSAGE} photos per message.`);
      return;
    }
    try {
      const processed = await Promise.all(list.map((f) => processImageFile(f)));
      setAttachments((prev) => [...prev, ...processed]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add those photos.");
    }
  }

  async function testConnection() {
    setTestStatus("Testing…");
    try {
      const apiKey = await loadApiKey(settings.provider);
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: settings.provider, model: settings.model || undefined, customBaseUrl: settings.customBaseUrl || undefined, apiKey: apiKey || undefined, messages: [{ role: "user", text: "In one short sentence, what is FOODLENS?" }] }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setTestStatus(`Failed: ${j?.error || "provider error"}`);
        return;
      }
      // Read only the first chunk, then cancel — a live check, not a full chat.
      const reader = res.body!.getReader();
      await reader.read();
      await reader.cancel().catch(() => undefined);
      setTestStatus("Connection OK — the provider responded.");
    } catch {
      setTestStatus("Failed: could not reach the provider. Check your connection, key and model.");
    }
  }

  async function doBarcodeLookup(code: string) {
    setBarcodeError(null);
    setBarcodeResult(null);
    if (!checkDigitValid(code)) {
      setBarcodeError("That barcode check digit is invalid. Check the digits and try again, or send a photo of the label.");
      return;
    }
    try {
      const product = await lookupBarcode(code);
      setBarcodeResult(product);
    } catch (e) {
      setBarcodeError(e instanceof Error ? e.message : "Barcode lookup failed.");
    }
  }

  async function scanBarcode() {
    setBarcodeError(null);
    const BD = (window as unknown as { BarcodeDetector?: new (opts: { formats: string[] }) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
    if (!BD) {
      setBarcodeError("Live camera barcode scanning needs the browser BarcodeDetector, which this browser does not support. Manual entry below always works; a ZXing fallback is not bundled in this build.");
      return;
    }
    setBarcodeScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      const video = document.createElement("video");
      video.srcObject = stream;
      await video.play();
      const detector = new BD({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });
      const deadline = Date.now() + 20000;
      while (Date.now() < deadline) {
        const codes = await detector.detect(video);
        if (codes[0]?.rawValue) {
          setBarcodeCode(codes[0].rawValue);
          await doBarcodeLookup(codes[0].rawValue);
          break;
        }
        await new Promise((r) => setTimeout(r, 300));
      }
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      setBarcodeError("Camera was denied or unavailable. Use manual entry below, or send a photo of the label.");
    } finally {
      setBarcodeScanning(false);
    }
  }

  const filtered = chats.filter((c) => !searchQuery || c.title.toLowerCase().includes(searchQuery.toLowerCase()) || c.messages.some((m) => m.text.toLowerCase().includes(searchQuery.toLowerCase())));
  const cap = PROVIDER_CAPABILITIES.find((p) => p.id === settings.provider)!;

  return (
    <div className="app" style={{ "--sidebar-top": `${sidebarTop}px` } as React.CSSProperties}>
      {sidebarOpen && <div className="sidebar-backdrop" aria-hidden="true" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? "open" : "collapsed"}`} aria-label="Chat history">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div className="logo">FOOD<span>LENS</span></div>
          <button type="button" className="sidebar-close" aria-label="Close history" onClick={() => setSidebarOpen(false)}>✕</button>
        </div>
        <button className="btn" onClick={() => { const c = newChat(); setChats((p) => [c, ...p]); setActiveId(c.id); if (window.innerWidth <= 720) setSidebarOpen(false); }}>+ New chat</button>
        <input type="search" placeholder="Search chats" aria-label="Search chats" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        {loadError ? (
          <div className="panel error" role="alert">
            <p>{loadError}</p>
            <button className="btn secondary" onClick={loadAll}>Retry loading</button>
          </div>
        ) : filtered.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>No chats yet. Start one above.</p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, overflowY: "auto" }}>
            {filtered.map((c) => (
              <li key={c.id} style={{ display: "flex", gap: 6, alignItems: "center", padding: "6px 4px" }}>
                <button className={`chat-item ${c.id === activeId ? "active" : ""}`} style={{ flex: 1 }} onClick={() => { setActiveId(c.id); if (window.innerWidth <= 720) setSidebarOpen(false); }}>
                  {c.title}
                </button>
                <button type="button" className="icon-btn" aria-label={`Rename chat ${c.title}`} onClick={async () => { const name = window.prompt("Rename chat", c.title); if (name && name.trim()) await saveChat({ ...c, title: name.trim().slice(0, 60) }); }}>✎</button>
                <button type="button" className="icon-btn" aria-label={`Delete chat ${c.title}`} onClick={async () => { await deleteChat(c.id); setChats((p) => p.filter((x) => x.id !== c.id)); if (activeId === c.id) setActiveId(null); }}>✕</button>
              </li>
            ))}
          </ul>
        )}
        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
          <button className="btn secondary" onClick={() => { setShowSettings(true); if (window.innerWidth <= 720) setSidebarOpen(false); }}>Settings</button>
        </div>
      </aside>

      <main className="main">
        <header ref={headerRef} className="topbar">
          <button className="btn secondary" aria-label={sidebarOpen ? "Close history" : "Open history"} aria-expanded={sidebarOpen} onClick={() => setSidebarOpen((v) => !v)}>☰</button>
          <strong>FOODLENS</strong>
          <span className="tagline">Chat before you eat unhealthy.</span>
          <span className="topbar-note" style={{ color: "var(--muted)", fontSize: 12 }}>General food information, not medical advice. Always check allergens on the real label.</span>
        </header>

        <div className="chat-scroll" ref={scrollRef} aria-live="polite">
          <div className="chat-col">
            {!active || active.messages.length === 0 ? (
              <div className="hero">
                <h1>Hello! I&apos;m FOODLENS.</h1>
                <p style={{ color: "var(--muted)" }}>Ask me anything about food, nutrition, cooking or what&apos;s on your plate.</p>
                <div className="chip-row" style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                  {CHIPS.map((chip) => (
                    <button key={chip} className="chip" onClick={() => { setInput(chip); }}>{chip}</button>
                  ))}
                </div>
                {!settingsLoaded && <p style={{ color: "var(--muted)" }}>Loading your chats…</p>}
              </div>
            ) : null}

            {active?.messages.map((m, idx) => (
              <article key={m.id} className={`msg ${m.role}`}>
                <div className="bubble">
                  {m.images?.map((img) => (
                    <img key={img.id} className="thumbs" src={img.dataUrl} alt={img.name} onClick={() => setLightbox(img.dataUrl)} />
                  ))}
                  {m.text ? <Markdown text={m.text} /> : null}
                  {m.status === "typing" && <span className="dots" aria-label="FOODLENS is typing"><span /><span /><span /></span>}
                  {m.role === "assistant" && idx > 0 && active.messages[idx - 1].role === "user" && (active.messages[idx - 1].images?.length || 0) > 0 && (
                    <p style={{ fontSize: 12, color: "var(--muted)", borderTop: "1px solid var(--border)", paddingTop: 6, marginTop: 8 }}>Please verify against the real label</p>
                  )}
                  {m.status === "streaming" && <span className="cursor" aria-hidden="true" />}
                </div>
                {m.status !== "typing" && m.status !== "streaming" && (
                <div className="meta">
                  <button onClick={() => navigator.clipboard.writeText(m.text).catch(() => undefined)}>Copy</button>
                  {m.role === "assistant" && (
                    <>
                      <button onClick={async () => {
                        if (navigator.share) {
                          try { await navigator.share({ text: m.text }); } catch { /* user cancelled the share sheet */ }
                        } else {
                          await navigator.clipboard.writeText(m.text).catch(() => undefined);
                        }
                      }}>Share</button>
                      <button onClick={() => {
                        if (!("speechSynthesis" in window)) return;
                        if (speakingId === m.id) {
                          speechSynthesis.cancel();
                          setSpeakingId(null);
                          return;
                        }
                        speechSynthesis.cancel();
                        const utter = new SpeechSynthesisUtterance(m.text.replace(/[*#_`>]/g, ""));
                        utter.onend = () => setSpeakingId(null);
                        utter.onerror = () => setSpeakingId(null);
                        speechSynthesis.speak(utter);
                        setSpeakingId(m.id);
                      }}>{speakingId === m.id ? "Stop" : "Listen"}</button>
                      <button onClick={async () => {
                        const idx = active.messages.findIndex((x) => x.id === m.id);
                        const history = active.messages.slice(0, idx);
                        const trimmed = { ...active, messages: history };
                        await saveChat(trimmed);
                        const prevUser = [...history].reverse().find((x) => x.role === "user");
                        const regenMode = m.mode === "transcribe" ? "transcribe" as const : m.mode === "analyse-confirmed" ? "analyse-confirmed" as const : undefined;
                        const regenConfirmed = regenMode === "analyse-confirmed" && prevUser ? prevUser.text.split("Confirmed ingredients I read: ")[1] || "" : undefined;
                        await streamReply(trimmed, history, regenMode ? { mode: regenMode, confirmedIngredients: regenConfirmed } : undefined);
                      }}>Regenerate</button>
                    </>
                  )}
                  {m.role === "user" && (
                    <button onClick={() => { setEditingId(m.id); setInput(m.text); }}>Edit &amp; resend</button>
                  )}
                </div>
                )}
              </article>
            ))}

            {thinking && (
              <p className="dots" aria-label="FOODLENS is thinking"><span /><span /><span /> {statusLine || "Thinking…"}</p>
            )}
            {error && <div className="notice error" role="alert">{error} <button className="btn secondary" onClick={() => setError(null)}>Dismiss</button></div>}
          </div>
        </div>

        {pendingConfirm && active && pendingConfirm.chatId === active.id && (
          <section aria-label="Confirm what was read" style={{ borderTop: "1px solid var(--border)", padding: "12px 14px", background: "var(--card)" }}>
            <strong>Ingredients I read</strong>
            <p style={{ color: "var(--muted)", fontSize: 13, margin: "4px 0 8px" }}>Check the transcription above. Edit anything misread, then tap Confirm — only the confirmed text will be analysed. Nothing is analysed before you confirm.</p>
            <textarea aria-label="Ingredients I read" value={confirmDraft} onChange={(e) => setConfirmDraft(e.target.value)} rows={5} style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }} />
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <button className="btn" type="button" onClick={confirmTranscription} disabled={generating || !confirmDraft.trim()}>Confirm</button>
              <button className="btn secondary" type="button" onClick={() => setPendingConfirm(null)}>Cancel — keep transcription only</button>
            </div>
            <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>Please verify against the real label.</p>
          </section>
        )}

        {pendingBarcode && (
          <p style={{ padding: "8px 14px", fontSize: 13, color: "var(--muted)", borderTop: "1px solid var(--border)" }}>
            Discussing scanned product: {pendingBarcode.name || pendingBarcode.code} (barcode {pendingBarcode.code}) — product data will be sent as untrusted data, not as message text.{" "}
            <button className="btn secondary" type="button" onClick={() => setPendingBarcode(null)}>Remove</button>
          </p>
        )}
        {photoQualityNotice(attachments) && (
          <p className="notice" role="status">{photoQualityNotice(attachments)}</p>
        )}
        <form className="composer" onSubmit={(e) => { e.preventDefault(); if (editingId && active) { const idx = active.messages.findIndex((x) => x.id === editingId); const history = active.messages.slice(0, idx); const trimmed = { ...active, messages: history }; setEditingId(null); saveChat(trimmed).then(() => send(undefined, trimmed, history)); } else send(); }}
          onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}
          onDragOver={(e) => e.preventDefault()}
          onPaste={(e) => { const files = Array.from(e.clipboardData.items).filter((i) => i.type.startsWith("image/")).map((i) => i.getAsFile()).filter(Boolean) as File[]; if (files.length) addFiles(files); }}
        >
          <div className="composer-box">
            {attachments.length > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                {attachments.map((img) => (
                  <span key={img.id} style={{ position: "relative" }}>
                    <img className="thumbs" src={img.dataUrl} alt={img.name} style={{ maxHeight: 90 }} onClick={() => setLightbox(img.dataUrl)} />
                    <button type="button" aria-label="Remove photo" onClick={() => setAttachments((p) => p.filter((x) => x.id !== img.id))}>✕</button>
                  </span>
                ))}
              </div>
            )}
            <label className="sr-only" htmlFor="composer-input">Message FOODLENS</label>
            <textarea id="composer-input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about food, or send a photo…" rows={2}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); (e.target as HTMLTextAreaElement).form?.requestSubmit(); } }} />
            <div className="composer-row">
              <button type="button" className="btn secondary" aria-label="Take a photo" onClick={() => cameraRef.current?.click()}>Camera</button>
              <button type="button" className="btn secondary" aria-label="Attach from gallery" onClick={() => fileRef.current?.click()}>Gallery</button>
              <button type="button" className="btn secondary" aria-label="Scan barcode" onClick={() => setShowBarcode(true)}>Barcode</button>
              <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
              <span style={{ flex: 1 }} />
              {generating ? (
                <button type="button" className="btn" onClick={stopReply}>Stop</button>
              ) : (
                <button type="submit" className="btn" disabled={!input.trim() && attachments.length === 0} aria-label="Send message">Send</button>
              )}
            </div>
          </div>
          <p style={{ fontSize: 12, color: "var(--muted)", textAlign: "center" }}>FOODLENS only helps with food. Photos are stripped of location data on your device before sending.</p>
        </form>
      </main>

      {lightbox && <div className="lightbox" role="dialog" aria-label="Photo viewer" onClick={() => setLightbox(null)}><img src={lightbox} alt="Enlarged food photo" /></div>}

      {showSettings && (
        <dialog open aria-label="Settings" onClose={() => setShowSettings(false)}>
          <h2>Settings</h2>
          <label>Provider<br />
            <select value={settings.provider} onChange={async (e) => { const p = e.target.value as ProviderId; setSettings((s) => ({ ...s, provider: p })); setKeyInput(""); setKeySaved((await loadApiKey(p)) !== null); }}>
              {PROVIDER_CAPABILITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
          {settings.provider !== "local" && (
            <div style={{ marginTop: 10 }}>
              <label>API key (optional)<br />
                <input type={showKey ? "text" : "password"} value={keyInput} onChange={(e) => setKeyInput(e.target.value)} placeholder={keySaved ? "A key is stored" : "Enter your API key"} autoComplete="off" />
              </label>
              <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 6 }}>Optional — adding a key unlocks full AI answers. Without a key, FOODLENS answers from its built-in local knowledge. Keys are encrypted and stored in this browser only.</p>
              <p style={{ fontSize: 13, marginTop: 6 }}>{keySaved ? `Key saved for ${PROVIDER_CAPABILITIES.find((p) => p.id === settings.provider)?.label || settings.provider} — verified after saving.` : `No key saved for ${PROVIDER_CAPABILITIES.find((p) => p.id === settings.provider)?.label || settings.provider} yet.`}</p>
              <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                <button type="button" className="btn secondary" onClick={() => setShowKey((v) => !v)}>{showKey ? "Hide" : "Show"}</button>
                <button type="button" className="btn secondary" onClick={async () => { if (!keyInput.trim()) return; try { await saveApiKey(settings.provider, keyInput.trim()); setKeySaved(true); setKeyInput(""); setTestStatus(""); } catch { setTestStatus("Could not save the key in this browser. Check that storage is allowed, then try again."); } }}>Save key</button>
                <button type="button" className="btn secondary" onClick={async () => { try { await removeApiKey(settings.provider); } catch { /* key is gone or storage failed; still show no key */ } setKeySaved(false); setTestStatus(""); }}>Remove key</button>
                <button type="button" className="btn secondary" onClick={testConnection}>Test connection</button>
              </div>
              {testStatus && <p>{testStatus}</p>}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
            <button type="button" className="btn" onClick={() => setShowSettings(false)}>Done</button>
          </div>
          <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 10 }}>FOODLENS {BUILD_LABEL}</p>
        </dialog>
      )}

      {showBarcode && (
        <dialog open aria-label="Barcode scanner" onClose={() => setShowBarcode(false)}>
          <h2>Barcode</h2>
          <p>Scan with your camera where supported, or type the number. Open Food Facts data is crowdsourced and can be wrong; missing fields are shown as missing, never invented.</p>
          <label>Barcode number<br /><input type="text" inputMode="numeric" value={barcodeCode} onChange={(e) => setBarcodeCode(e.target.value.replace(/\D/g, ""))} placeholder="e.g. 3017620422003" /></label>
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn" onClick={() => doBarcodeLookup(barcodeCode)}>Look up</button>
            <button type="button" className="btn secondary" onClick={scanBarcode} disabled={barcodeScanning}>{barcodeScanning ? "Scanning…" : "Scan with camera"}</button>
            <button type="button" className="btn secondary" onClick={() => setShowBarcode(false)}>Close</button>
          </div>
          {barcodeError && <p className="notice error">{barcodeError}</p>}
          {barcodeResult && (
            <div className="panel">
              <h3>{barcodeResult.name || "Unknown product"}</h3>
              <p>Code: {barcodeResult.code} · Brands: {barcodeResult.brands || "[Unknown]"} · Categories: {barcodeResult.categories || "[Unknown]"}</p>
              <p>Ingredients: {barcodeResult.ingredients || "[Unknown — send a photo of the ingredients label]"}</p>
              <p>Allergens: {barcodeResult.allergens || "[Unknown]"}</p>
              <p>Nutri-Score: {barcodeResult.nutriscore || "[Unknown]"}</p>
              {barcodeResult.missing.length > 0 && <p>Missing: {barcodeResult.missing.join(", ")}.</p>}
              <button type="button" className="btn" onClick={() => {
                setPendingBarcode(barcodeResult);
                setShowBarcode(false);
                setInput("Is this healthy, and what should I watch for?");
              }}>Discuss in chat</button>
              <p style={{ fontSize: 12, color: "var(--muted)" }}>Source: Open Food Facts, ODbL. Cached locally for 7 days.</p>
            </div>
          )}
        </dialog>
      )}
    </div>
  );
}
