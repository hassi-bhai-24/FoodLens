// Provider network layer — the preview v9 hang fix.
//
// What went wrong in v8 (observed, timed): a provider that never sent
// response headers held the chat route for exactly 300 s (Node's undici
// default headersTimeout, not any app choice) while the phone showed
// "Thinking…" the whole time, and a provider that stalled mid-stream
// left the half-reply hanging until the same 300 s body timeout. The
// fix: every provider fetch is bounded by a HEADERS timeout that
// disarms the moment headers arrive (so a slow but healthy stream is
// never cut), and the SSE relay has an INACTIVITY watchdog that aborts
// a stream which goes silent mid-reply. Both abort paths deliver a
// clear message to the client instead of a silent hang.
//
// Pure Web APIs only (fetch, Response, ReadableStream, timers) — no
// Next/server imports — so the unit tests compile and drive this file
// directly.

/** Provider must send response HEADERS within this long (ms). */
export const PROVIDER_HEADERS_TIMEOUT_MS = 30_000;
/** An SSE stream may not go silent for longer than this between chunks (ms). */
export const SSE_INACTIVITY_TIMEOUT_MS = 30_000;

/** Clear message shown when the provider never starts answering. */
export const PROVIDER_TIMEOUT_MESSAGE =
  "The AI provider did not answer in time, so I stopped waiting. This is usually a slow or blocked connection, or the provider being down. Check your connection and the key in Settings, then try again.";

/** Clear message shown when a started stream goes silent mid-reply. */
export const SSE_STALL_MESSAGE =
  "The reply from the AI provider stopped part-way through, so I stopped waiting. What arrived so far is saved in your chat. This is usually a dropped or blocked connection — check your connection and try again.";

/** Clear message shown when the upstream stream errors mid-reply. */
export const SSE_UPSTREAM_ERROR_MESSAGE =
  "The connection to the AI provider was lost before the reply finished. What arrived so far is saved in your chat. Check your connection and try again.";

export interface HeadersTimeoutFetch {
  /** Response with headers received, or null if the fetch failed. */
  res: Response | null;
  /** True when the failure was the headers timeout (not a network error). */
  timedOut: boolean;
}

/**
 * fetch() bounded by a HEADERS-arrival timeout. The abort timer is
 * cleared the moment headers arrive, so a response body that streams
 * for minutes is never cut by this helper — the SSE relay's own
 * inactivity watchdog covers the body. On timeout the fetch is aborted
 * and { res: null, timedOut: true } is returned; other failures return
 * { res: null, timedOut: false }. The AbortController is returned too
 * so the caller (and the relay) can still cancel the body later, e.g.
 * when the app's own client disconnects.
 */
export async function fetchWithHeadersTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  fetchFn: typeof fetch = fetch,
  clientSignal?: AbortSignal,
): Promise<HeadersTimeoutFetch & { controller: AbortController }> {
  const controller = new AbortController();
  // If the app's own client is already gone (or goes away while the
  // provider is still being contacted), stop the upstream fetch too —
  // no orphaned provider connections after a Stop press or a dropped
  // phone connection. Once headers arrive this listener is removed;
  // from there the SSE relay's cancel() covers a client disconnect.
  const onClientAbort = () => controller.abort();
  if (clientSignal) {
    if (clientSignal.aborted) controller.abort();
    else clientSignal.addEventListener("abort", onClientAbort, { once: true });
  }
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const res = await fetchFn(url, { ...init, signal: controller.signal });
    // Headers arrived — disarm. From here the body is guarded by the
    // SSE inactivity watchdog in sseStreamFromProvider, not by us.
    clearTimeout(timer);
    return { res, timedOut: false, controller };
  } catch {
    clearTimeout(timer);
    return { res: null, timedOut, controller };
  } finally {
    if (clientSignal) clientSignal.removeEventListener("abort", onClientAbort);
  }
}

/**
 * Relay a provider SSE response to the app's own SSE client, with an
 * inactivity watchdog: if no upstream chunk arrives for
 * inactivityTimeoutMs, the upstream is aborted and a final
 * data: {"error": "..."} event is sent so the client can show what
 * happened instead of hanging. `abortUpstream` should abort the fetch
 * controller that produced `upstream` (best-effort cancellation).
 */
export function sseStreamFromProvider(
  upstream: Response,
  extract: (line: string) => string | null,
  modelUsed: string | undefined,
  opts: { inactivityTimeoutMs: number; abortUpstream: () => void },
): Response {
  const reader = upstream.body!.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  let first = true;
  let finished = false;
  let inactivityTimer: ReturnType<typeof setTimeout> | null = null;

  const clearInactivity = () => {
    if (inactivityTimer !== null) {
      clearTimeout(inactivityTimer);
      inactivityTimer = null;
    }
  };
  const stopUpstream = () => {
    clearInactivity();
    opts.abortUpstream();
    reader.cancel().catch(() => undefined);
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // The watchdog is armed from the very first moment, not only
      // while a pull is in flight: a stalled upstream must be caught
      // even between reads.
      inactivityTimer = setTimeout(() => {
        if (finished) return;
        finished = true;
        stopUpstream();
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: SSE_STALL_MESSAGE })}\n\n`));
          controller.close();
        } catch {
          /* client already went away */
        }
      }, opts.inactivityTimeoutMs);
      // Record which model answered (clients ignore events without a delta).
      if (first && modelUsed) {
        first = false;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ model: modelUsed })}\n\n`));
      }
    },
    async pull(controller) {
      if (finished) return;
      const { done, value } = await reader.read().catch(() => {
        // Upstream errored mid-stream: say so, then end cleanly.
        if (finished) return { done: true, value: undefined };
        finished = true;
        stopUpstream();
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: SSE_UPSTREAM_ERROR_MESSAGE })}\n\n`));
          controller.close();
        } catch {
          /* client already went away */
        }
        return { done: true, value: undefined };
      });
      if (finished) return;
      if (done) {
        finished = true;
        clearInactivity();
        try {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch {
          /* client already went away */
        }
        return;
      }
      // A chunk arrived: reset the inactivity clock.
      clearInactivity();
      inactivityTimer = setTimeout(() => {
        if (finished) return;
        finished = true;
        stopUpstream();
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: SSE_STALL_MESSAGE })}\n\n`));
          controller.close();
        } catch {
          /* client already went away */
        }
      }, opts.inactivityTimeoutMs);
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const delta = extract(line.trim());
        if (delta) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`));
      }
    },
    cancel() {
      // The app's own client went away (Stop button, tab closed,
      // watchdog): stop the upstream too, not just our half.
      finished = true;
      stopUpstream();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
}
