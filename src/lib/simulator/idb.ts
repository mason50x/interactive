/**
 * The IndexedDB plumbing the two device stores share.
 *
 * `local-store.ts` keeps the cartridge library and `html-store.ts` the HTML
 * one, in databases of their own so a schema change to either cannot strand
 * the other. What they have in common is everything around the data: opening
 * a database and creating its stores on first use, closing a connection that
 * another tab wants to upgrade, and turning a transaction's three terminal
 * events into one promise that always closes the connection behind it.
 */

/** What a blocked upgrade tells the person, in both stores. */
const BLOCKED_MESSAGE = "Close other simulator tabs to update local storage.";

/** What a transaction failure says when the transaction itself has no error. */
const UNAVAILABLE_MESSAGE = "Local storage is unavailable.";

/**
 * Opens `name` at `version`, running `upgrade` when the stores have to be
 * created or changed. The connection closes itself when a newer tab asks to
 * upgrade, so that tab is never blocked by this one.
 */
export function openDatabase(
  name: string,
  version: number,
  upgrade: (db: IDBDatabase) => void,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onupgradeneeded = () => upgrade(request.result);
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error(BLOCKED_MESSAGE));
  });
}

/**
 * Resolves with `result()` once `tx` completes and rejects when it aborts or
 * fails, closing `db` either way.
 *
 * `failure` is consulted first on rejection, for the case where the caller
 * aborted the transaction itself and knows why; the transaction's own error
 * comes next, and `message` covers a transaction that failed without one.
 */
export function whenComplete<T>(
  db: IDBDatabase,
  tx: IDBTransaction,
  result: () => T,
  {
    failure,
    message = UNAVAILABLE_MESSAGE,
  }: { failure?: () => unknown; message?: string } = {},
): Promise<T> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => {
      db.close();
      resolve(result());
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(failure?.() ?? tx.error ?? new Error(message));
    };
  });
}

/** Every key under `prefix`, for a store keyed by owner-prefixed strings. */
export function keysUnder(prefix: string): IDBKeyRange {
  return IDBKeyRange.bound(prefix, prefix + "\uffff");
}
