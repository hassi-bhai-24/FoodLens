// Key vault: user-entered keys are encrypted in IndexedDB with a
// WebCrypto AES-GCM wrapping key. The wrapping key is extractable and
// its JWK is stored in IndexedDB (separate entry, `apiKey:wrap`), so a
// saved key survives a page reload: on load the stored JWK is imported
// instead of generating a fresh key. The user's API key itself is never
// stored in plaintext — only as AES-GCM ciphertext — and is decrypted
// only in memory, sent per request over HTTPS to the server proxy,
// which never stores or logs it. Keys never appear in bundles, errors
// or logs.
//
// Trade-off, stated plainly: the wrapping key's JWK in IndexedDB is
// extractable by design, so anyone with access to this browser profile
// could in principle unwrap a saved key. That is the cost of keys that
// survive reloads; a key can always be removed in Settings, which
// deletes its ciphertext.
import { deleteKv, getKv, putKv } from "./db";

let cachedKey: CryptoKey | null = null;

async function wrappingKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const stored = await getKv<JsonWebKey>("apiKey:wrap");
  if (stored) {
    cachedKey = await crypto.subtle.importKey("jwk", stored, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    return cachedKey;
  }
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  await putKv("apiKey:wrap", await crypto.subtle.exportKey("jwk", key));
  cachedKey = key;
  return cachedKey;
}

/** Test-only hook: forget the in-memory wrapping key so the next call
 *  goes through the stored-JWK path, exactly as after a page reload. */
export function __resetWrappingKeyForTests(): void {
  cachedKey = null;
}

export async function saveApiKey(provider: string, apiKey: string): Promise<void> {
  const key = await wrappingKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(apiKey));
  await putKv(`apiKey:${provider}`, { iv: Array.from(iv), data: Array.from(new Uint8Array(ct)) });
}

export async function loadApiKey(provider: string): Promise<string | null> {
  const blob = await getKv<{ iv: number[]; data: number[] }>(`apiKey:${provider}`);
  if (!blob) return null;
  let key: CryptoKey;
  try {
    key = await wrappingKey();
  } catch {
    return null;
  }
  try {
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(blob.iv) },
      key,
      new Uint8Array(blob.data),
    );
    return new TextDecoder().decode(pt);
  } catch {
    // This blob was encrypted under a wrapping key that no longer
    // exists (e.g. saved before the wrapping key was made persistent).
    // It can never decrypt, so drop it — Settings must not claim a key
    // is stored when none can be loaded.
    await deleteKv(`apiKey:${provider}`).catch(() => undefined);
    return null;
  }
}

export async function removeApiKey(provider: string): Promise<void> {
  await deleteKv(`apiKey:${provider}`);
}

export async function hasStoredApiKey(provider: string): Promise<boolean> {
  return (await getKv(`apiKey:${provider}`)) !== undefined;
}
