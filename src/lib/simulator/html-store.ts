import { accountKey } from "./local-store";
export const MAX_HTML_BYTES = 8 * 1024 * 1024;
export const MAX_HTML_SAVE_BYTES = 256 * 1024;
export type HtmlSlot = "auto" | "previous" | "manual1" | "manual2" | "manual3";
export type HtmlSave = {
  version: 1;
  contentHash: string;
  savedAt: number;
  json: string;
};
export type HtmlEntry = {
  contentHash: string;
  label: string;
  updatedAt: number;
  saves: Partial<Record<HtmlSlot, HtmlSave>>;
};
export type HtmlProgram = {
  contentHash: string;
  bytes: ArrayBuffer;
  label: string;
};
const database = "50x-html-simulators-v1";
async function connect(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(database, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore("files");
      r.result.createObjectStore("entries");
    };
    r.onsuccess = () => {
      r.result.onversionchange = () => r.result.close();
      resolve(r.result);
    };
    r.onerror = () => reject(r.error);
    r.onblocked = () =>
      reject(new Error("Close other simulator tabs to update local storage."));
  });
}
async function read<T>(
  owner: string,
  store: string,
  hash?: string,
): Promise<T> {
  const db = await connect();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store),
      s = tx.objectStore(store),
      prefix = accountKey(owner);
    const r = hash
      ? s.get(prefix + hash)
      : s.getAll(IDBKeyRange.bound(prefix, prefix + "\uffff"));
    tx.oncomplete = () => {
      db.close();
      resolve(r.result);
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
// All updates use read-modify-write transactions, so rename/save cannot overwrite each other.
async function update(
  owner: string,
  hash: string,
  change: (
    entry: HtmlEntry | undefined,
    tx: IDBTransaction,
    key: string,
  ) => void,
) {
  const db = await connect();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(["entries", "files"], "readwrite"),
      key = accountKey(owner) + hash;
    let failure: unknown;
    const r = tx.objectStore("entries").get(key);
    r.onsuccess = () => {
      try {
        change(r.result, tx, key);
      } catch (e) {
        failure = e;
        tx.abort();
      }
    };
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(failure ?? tx.error ?? new Error("Local storage unavailable."));
    };
  });
}
export async function identifyHtml(
  bytes: ArrayBuffer,
  label = "Untitled HTML",
): Promise<HtmlProgram> {
  if (!bytes.byteLength || bytes.byteLength > MAX_HTML_BYTES)
    throw new Error("Choose a nonempty HTML file up to 8 MiB.");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (!text.trim() || text.includes("\0"))
    throw new Error("Use a UTF-8 HTML document.");
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const contentHash = Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  return {
    bytes,
    contentHash,
    label:
      label
        .replace(/[\x00-\x1f]/g, "")
        .trim()
        .slice(0, 60) || "Untitled HTML",
  };
}
export async function openHtml(file: File) {
  if (!/\.html?$/i.test(file.name))
    throw new Error("Choose an .html or .htm file.");
  if (file.size > MAX_HTML_BYTES)
    throw new Error("Choose an HTML file up to 8 MiB.");
  return identifyHtml(
    await file.arrayBuffer(),
    file.name.replace(/\.html?$/i, ""),
  );
}
export async function importHtml(owner: string, program: HtmlProgram) {
  await update(owner, program.contentHash, (entry, tx, key) => {
    const store = tx.objectStore("entries");
    const put = () => {
      tx.objectStore("files").put(program.bytes, key);
      store.put(
        entry
          ? { ...entry, updatedAt: Date.now() }
          : {
              contentHash: program.contentHash,
              label: program.label,
              updatedAt: Date.now(),
              saves: {},
            },
        key,
      );
    };
    if (entry) put();
    else {
      const prefix = accountKey(owner),
        count = store.count(IDBKeyRange.bound(prefix, prefix + "\uffff"));
      count.onsuccess = () => {
        if (count.result >= 20) tx.abort();
        else put();
      };
    }
  }).catch((e) => {
    throw new Error(
      e instanceof Error && e.name !== "AbortError"
        ? e.message
        : "The HTML library is full or storage is unavailable. Remove an entry and try again.",
    );
  });
}
export const listHtml = (owner: string) => read<HtmlEntry[]>(owner, "entries");
export const readHtmlEntry = (owner: string, hash: string) =>
  read<HtmlEntry | undefined>(owner, "entries", hash);
export async function readHtmlProgram(owner: string, hash: string) {
  const bytes = await read<ArrayBuffer | undefined>(owner, "files", hash);
  if (!bytes) return null;
  const p = await identifyHtml(bytes);
  if (p.contentHash !== hash)
    throw new Error(
      "The cached HTML is damaged. Open the original file again.",
    );
  return p;
}
export function validateHtmlSave(value: unknown, hash: string): HtmlSave {
  const s = value as HtmlSave | null;
  if (
    !s ||
    s.version !== 1 ||
    s.contentHash !== hash ||
    typeof s.json !== "string" ||
    !Number.isFinite(s.savedAt) ||
    s.savedAt < 0
  )
    throw new Error(
      "This progress belongs to another file or uses an unsupported format.",
    );
  if (new TextEncoder().encode(s.json).byteLength > MAX_HTML_SAVE_BYTES)
    throw new Error("Progress exceeds the 256 KiB limit.");
  JSON.parse(s.json);
  return { version: 1, contentHash: hash, savedAt: s.savedAt, json: s.json };
}
export async function saveHtml(
  owner: string,
  hash: string,
  value: unknown,
  slot: Exclude<HtmlSlot, "previous"> = "auto",
) {
  const save = validateHtmlSave(
    {
      version: 1,
      contentHash: hash,
      savedAt: Date.now(),
      json: JSON.stringify(value),
    },
    hash,
  );
  await update(owner, hash, (entry, tx, key) => {
    if (!entry)
      throw new Error(
        "This simulation was removed. Reopen its HTML to save again.",
      );
    // Timer-driven captures must not rotate away the last distinct checkpoint.
    if (slot === "auto" && entry.saves.auto?.json === save.json) return;
    const saves = { ...entry.saves };
    if (slot === "auto" && saves.auto) saves.previous = saves.auto;
    saves[slot] = save;
    tx.objectStore("entries").put(
      { ...entry, saves, updatedAt: save.savedAt },
      key,
    );
  });
  return save;
}
export async function renameHtml(owner: string, hash: string, label: string) {
  const clean = label.trim();
  if (!clean || clean.length > 60 || /[\x00-\x1f]/.test(clean))
    throw new Error("Use a name between 1 and 60 characters.");
  await update(owner, hash, (entry, tx, key) => {
    if (entry) tx.objectStore("entries").put({ ...entry, label: clean }, key);
  });
}
export async function removeHtml(owner: string, hash?: string) {
  const db = await connect();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(["entries", "files"], "readwrite"),
      prefix = accountKey(owner);
    const key = hash
      ? prefix + hash
      : IDBKeyRange.bound(prefix, prefix + "\uffff");
    for (const name of ["entries", "files"]) tx.objectStore(name).delete(key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
