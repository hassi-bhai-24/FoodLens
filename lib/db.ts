// IndexedDB storage with schema versioning and migrations.
// Chats and encrypted keys live here. Never plain localStorage for data or keys.
import type { Chat, Settings } from "./types";

const DB_NAME = "foodlens";
const DB_VERSION = 2;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("chats")) {
        db.createObjectStore("chats", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("kv")) {
        db.createObjectStore("kv", { keyPath: "key" });
      }
      // v2: barcode cache store (added in upgrade from v1).
      if (!db.objectStoreNames.contains("barcodeCache")) {
        db.createObjectStore("barcodeCache", { keyPath: "code" });
      }
    };
  });
}

async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const req = fn(s) as IDBRequest<T> | undefined;
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function listChats(): Promise<Chat[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction("chats", "readonly").objectStore("chats").getAll();
    req.onsuccess = () => resolve((req.result as Chat[]).sort((a, b) => b.updatedAt - a.updatedAt));
    req.onerror = () => reject(req.error);
  });
}

export async function putChat(chat: Chat): Promise<void> {
  await tx("chats", "readwrite", (s) => s.put(chat));
}

export async function deleteChat(id: string): Promise<void> {
  await tx("chats", "readwrite", (s) => s.delete(id));
}

export async function clearChats(): Promise<void> {
  await tx("chats", "readwrite", (s) => s.clear());
}

export async function getKv<T>(key: string): Promise<T | undefined> {
  const row = await tx<{ key: string; value: T }>("kv", "readonly", (s) => s.get(key));
  return row?.value;
}

export async function putKv(key: string, value: unknown): Promise<void> {
  await tx("kv", "readwrite", (s) => s.put({ key, value }));
}

export async function deleteKv(key: string): Promise<void> {
  await tx("kv", "readwrite", (s) => s.delete(key));
}

export async function clearAllData(): Promise<void> {
  await clearChats();
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(["kv", "barcodeCache"], "readwrite");
    t.objectStore("kv").clear();
    t.objectStore("barcodeCache").clear();
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
  // Settings are cleared by kv.clear() above; do not re-create a
  // settings row with an undefined value.
}

export interface BarcodeCacheEntry {
  code: string;
  data: unknown;
  cachedAt: number;
}

export async function getBarcodeCache(code: string): Promise<BarcodeCacheEntry | undefined> {
  return tx<BarcodeCacheEntry>("barcodeCache", "readonly", (s) => s.get(code));
}

export async function putBarcodeCache(entry: BarcodeCacheEntry): Promise<void> {
  await tx("barcodeCache", "readwrite", (s) => s.put(entry));
}
