/**
 * The device's copy of every simulation and its progress, in IndexedDB.
 *
 * Two object stores: the programs themselves, so a file only has to be
 * chosen once, and the progress, keyed by owner and hash so two accounts on
 * one machine never see each other's saves. The cloud copy in
 * `convex/simulator/` is the backup; this is what the player actually runs
 * from, which is why it works with no network at all.
 */
import { identify } from "./files";
import type { Program, LocalEntry } from "./types";
const database = "50x-learning-simulator-v1";
function connect(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(database, 2);
    request.onupgradeneeded = () => {
      for (const name of ["progress", "programs"])
        if (!request.result.objectStoreNames.contains(name))
          request.result.createObjectStore(name);
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
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
  storeName = "progress",
): Promise<T> {
  const db = await connect();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const req = run(tx.objectStore(storeName));
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
  await deleteStored(accountKey(owner) + hash);
}
export async function listLocal(owner: string): Promise<LocalEntry[]> {
  const prefix = accountKey(owner);
  return transaction("readonly", (s) =>
    s.getAll(IDBKeyRange.bound(prefix, prefix + "\uffff")),
  );
}
export async function clearLocal(owner: string) {
  const prefix = accountKey(owner);
  await deleteStored(IDBKeyRange.bound(prefix, prefix + "\uffff"));
}

// Program bytes live only in this browser store, never in progress envelopes.
export async function writeProgram(owner: string, program: Program) {
  await transaction(
    "readwrite",
    (store) =>
      store.put(
        { bytes: program.bytes, label: program.label },
        accountKey(owner) + program.contentHash,
      ),
    "programs",
  );
}
export async function readProgram(
  owner: string,
  hash: string,
): Promise<Program | null> {
  const cached = await transaction<
    ArrayBuffer | { bytes: ArrayBuffer; label?: string } | undefined
  >("readonly", (store) => store.get(accountKey(owner) + hash), "programs");
  if (!cached) return null;
  const program = await identify(
    cached instanceof ArrayBuffer ? cached : cached.bytes,
  );
  if (program.contentHash !== hash)
    throw new Error(
      "The stored game file is damaged. Select the original file again.",
    );
  return cached instanceof ArrayBuffer
    ? program
    : { ...program, ...(cached.label ? { label: cached.label } : {}) };
}
async function deleteStored(key: string | IDBKeyRange) {
  const db = await connect();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(["progress", "programs"], "readwrite");
    for (const name of ["progress", "programs"])
      tx.objectStore(name).delete(key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(tx.error ?? new Error("Could not clear local storage."));
    };
  });
}
