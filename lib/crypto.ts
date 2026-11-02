// Key vault: user-entered keys are encrypted in IndexedDB with a
// non-extractable WebCrypto AES-GCM key that lives only in memory for
// this page session. The plaintext key is decrypted only in memory and
// sent per request over HTTPS to the server proxy, which never stores
// or logs it. Keys never appear in bundles, errors or logs.
//
// Honest limitation: because the wrapping key is non-extractable and
// session-scoped, an encrypted key cannot be decrypted after a reload.
// The Settings UI says so plainly and asks the user to re-enter the key
// after reloading. This is safer than persisting extractable key
// material in IndexedDB.
import { deleteKv, getKv, putKv } from "./db";

let cachedKey: CryptoKey | null = null;

async function wrappingKey(): Promise<CryptoKey> {
  if (!cachedKey) {
    cachedKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  return cachedKey;
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
  try {
    const key = await wrappingKey();
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(blob.iv) },
      key,
      new Uint8Array(blob.data),
    );
    return new TextDecoder().decode(pt);
  } catch {
    return null;
  }
}

export async function removeApiKey(provider: string): Promise<void> {
  await deleteKv(`apiKey:${provider}`);
}

export async function hasStoredApiKey(provider: string): Promise<boolean> {
  return (await getKv(`apiKey:${provider}`)) !== undefined;
}
