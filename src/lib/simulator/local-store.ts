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
import { keysUnder, openDatabase, whenComplete } from "./idb";
import type { Program, LocalEntry } from "./types";
const database = "50x-learning-simulator-v1";
const STORES = ["progress", "programs"] as const;

/** At most this many entries per owner; the library is a shelf, not an archive. */
const MAX_LOCAL_ENTRIES = 20;

function connect(): Promise<IDBDatabase> {
  return openDatabase(database, 2, (db) => {
    for (const name of STORES)
      if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
  });
}
export function accountKey(owner: string) {
  return `${process.env.NEXT_PUBLIC_CONVEX_URL}:${owner}:`;
}
async function transaction<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
  storeName: (typeof STORES)[number] = "progress",
): Promise<T> {
  const db = await connect();
  const tx = db.transaction(storeName, mode);
  const req = run(tx.objectStore(storeName));
  return whenComplete(db, tx, () => req.result);
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
  const tx = db.transaction("progress", "readwrite"),
    store = tx.objectStore("progress");
  let failure: Error | null = null;
  const existing = store.getKey(key);
  existing.onsuccess = () => {
    if (existing.result !== undefined) {
      store.put(entry, key);
      return;
    }
    const count = store.count(keysUnder(prefix));
    count.onsuccess = () => {
      if (count.result >= MAX_LOCAL_ENTRIES) {
        failure = new Error(
          "Local library is full. Clear an entry before saving another.",
        );
        tx.abort();
      } else store.put(entry, key);
    };
  };
  await whenComplete(db, tx, () => undefined, { failure: () => failure });
}
export async function removeLocal(owner: string, hash: string) {
  await deleteStored(accountKey(owner) + hash);
}
export async function listLocal(owner: string): Promise<LocalEntry[]> {
  const prefix = accountKey(owner);
  return transaction("readonly", (s) => s.getAll(keysUnder(prefix)));
}
export async function clearLocal(owner: string) {
  const prefix = accountKey(owner);
  await deleteStored(keysUnder(prefix));
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
  const tx = db.transaction([...STORES], "readwrite");
  for (const name of STORES) tx.objectStore(name).delete(key);
  await whenComplete(db, tx, () => undefined, {
    message: "Could not clear local storage.",
  });
}
