import type { LocalEntry } from "./types";
const database = "50x-learning-simulator-v1";
function connect(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(database, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("progress");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("Close other simulator tabs to update local storage."));
  });
}
export function accountKey(owner: string) {
  return `${process.env.NEXT_PUBLIC_CONVEX_URL}:${owner}:`;
}
async function transaction<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await connect();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("progress", mode);
    const req = run(tx.objectStore("progress"));
    tx.oncomplete = () => {
      db.close();
      resolve(req.result);
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(tx.error ?? new Error("Local storage is unavailable."));
    };
  });
}
export async function readLocal(
  owner: string,
  hash: string,
): Promise<LocalEntry | undefined> {
  return transaction("readonly", (s) => s.get(accountKey(owner) + hash));
}
export async function writeLocal(owner: string, entry: LocalEntry) {
  const db = await connect();
  const prefix = accountKey(owner),
    key = prefix + entry.contentHash;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("progress", "readwrite"),
      store = tx.objectStore("progress");
    let failure: Error | null = null;
    const existing = store.getKey(key);
    existing.onsuccess = () => {
      if (existing.result !== undefined) {
        store.put(entry, key);
        return;
      }
      const count = store.count(IDBKeyRange.bound(prefix, prefix + "\uffff"));
      count.onsuccess = () => {
        if (count.result >= 20) {
          failure = new Error(
            "Local library is full. Clear an entry before saving another.",
          );
          tx.abort();
        } else store.put(entry, key);
      };
    };
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(failure ?? tx.error ?? new Error("Local storage is unavailable."));
    };
  });
}
export async function removeLocal(owner: string, hash: string) {
  await transaction("readwrite", (s) => s.delete(accountKey(owner) + hash));
}
export async function listLocal(owner: string): Promise<LocalEntry[]> {
  const prefix = accountKey(owner);
  return transaction("readonly", (s) =>
    s.getAll(IDBKeyRange.bound(prefix, prefix + "\uffff")),
  );
}
export async function clearLocal(owner: string) {
  const prefix = accountKey(owner);
  await transaction("readwrite", (s) =>
    s.delete(IDBKeyRange.bound(prefix, prefix + "\uffff")),
  );
}
