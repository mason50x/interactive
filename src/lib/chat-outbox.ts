import type { Id } from "@convex/_generated/dataModel";
import type {
  ChatImage,
  ChatMention,
  ChatMessage,
} from "@convex/chat/messages";

export type OutboxEntry = {
  nonce: string;
  createdAt: number;
  body: string;
  attachmentIds: Id<"attachments">[];
  images: ChatImage[];
  replyTo: ChatMessage | null;
  mentions: ChatMention[];
  everyone: boolean;
  poll?: { options: string[] };
  status: "queued" | "sending" | "failed";
  /** An interrupted attempt may have committed; retry its original nonce. */
  uncertain?: boolean;
  error?: string;
};

const PREFIX = "50x:chat-outbox:v1:";
const RECORD = ":entry:";
const EMPTY: OutboxEntry[] = [];
type State = { entries: OutboxEntry[]; records: Map<string, string> };
const cache = new Map<string, State>();
// Storage failures retain in-memory payloads and removal tombstones.
const dirty = new Map<string, Map<string, OutboxEntry | null>>();
const active = new Set<string>();
const listeners = new Set<() => void>();
export const outboxKey = (account: string, conversation: string) =>
  `${PREFIX}${encodeURIComponent(account)}:${encodeURIComponent(conversation)}`;
export const emptyOutbox = () => EMPTY;
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const id = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 200;
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

function legacyKey(key: string): string | null {
  try {
    const [account, conversation] = key
      .slice(PREFIX.length)
      .split(":")
      .map(decodeURIComponent);
    // The old format did not escape delimiters; migrate only unambiguous identities.
    return account &&
      conversation &&
      !account.includes(":") &&
      !conversation.includes(":")
      ? `50x:chat-outbox:${account}:${conversation}`
      : null;
  } catch {
    return null;
  }
}

function validImage(value: unknown): value is ChatImage {
  if (
    !object(value) ||
    !id(value.attachmentId) ||
    typeof value.url !== "string" ||
    !finite(value.width) ||
    !finite(value.height) ||
    value.width <= 0 ||
    value.height <= 0
  )
    return false;
  try {
    return ["https:", "http:"].includes(new URL(value.url).protocol);
  } catch {
    return false;
  }
}

function restoreEntry(value: unknown): OutboxEntry | null {
  if (
    !object(value) ||
    typeof value.nonce !== "string" ||
    !/^[a-zA-Z0-9_-]{1,100}$/.test(value.nonce) ||
    typeof value.body !== "string" ||
    value.body.length > 2000 ||
    !finite(value.createdAt) ||
    value.createdAt < 0 ||
    !Array.isArray(value.attachmentIds) ||
    value.attachmentIds.length > 4 ||
    !value.attachmentIds.every(id) ||
    !Array.isArray(value.images) ||
    !Array.isArray(value.mentions) ||
    typeof value.everyone !== "boolean"
  )
    return null;
  let poll: OutboxEntry["poll"];
  if (value.poll !== undefined) {
    if (
      !object(value.poll) ||
      !Array.isArray(value.poll.options) ||
      value.poll.options.length < 2 ||
      value.poll.options.length > 6 ||
      !value.poll.options.every(
        (option): option is string =>
          typeof option === "string" &&
          option.trim().length > 0 &&
          option.length <= 80,
      )
    )
      return null;
    poll = { options: value.poll.options };
  }
  let replyTo: ChatMessage | null = null;
  if (value.replyTo !== null && value.replyTo !== undefined) {
    const reply = value.replyTo;
    if (
      !object(reply) ||
      !id(reply._id) ||
      !finite(reply._creationTime) ||
      !id(reply.authorClerkId) ||
      typeof reply.authorHandle !== "string" ||
      typeof reply.body !== "string"
    )
      return null;
    replyTo = {
      _id: reply._id as Id<"messages">,
      _creationTime: reply._creationTime,
      authorClerkId: reply.authorClerkId,
      authorHandle: reply.authorHandle,
      authorName:
        typeof reply.authorName === "string" ? reply.authorName : undefined,
      body: reply.body.slice(0, 2000),
      mentions: [],
      mentionsEveryone: false,
      images: [],
      reactions: [],
      status: "visible",
    };
  }
  const uncertain = value.uncertain === true || value.status === "sending";
  return {
    nonce: value.nonce,
    createdAt: value.createdAt,
    body: value.body,
    attachmentIds: value.attachmentIds as Id<"attachments">[],
    images: value.images.filter(validImage),
    replyTo,
    mentions: value.mentions.filter(
      (mention): mention is ChatMention =>
        object(mention) &&
        id(mention.clerkId) &&
        typeof mention.handle === "string",
    ),
    everyone: value.everyone,
    poll,
    uncertain,
    status: "failed",
    error:
      value.status === "failed" && typeof value.error === "string"
        ? value.error.slice(0, 500)
        : uncertain
          ? "Delivery was interrupted and could not be confirmed. Retry to check and finish sending this same message."
          : "This message is saved. Retry when you are ready to send it.",
  };
}

/** A damaged row cannot discard other saved messages or fabricate a retry payload. */
export function restoreOutbox(raw: string | null): OutboxEntry[] {
  if (!raw) return [];
  try {
    const values: unknown = JSON.parse(raw);
    if (!Array.isArray(values)) return [];
    const seen = new Set<string>();
    return values.flatMap((value) => {
      const row = restoreEntry(value);
      if (!row || seen.has(row.nonce)) return [];
      seen.add(row.nonce);
      return [row];
    });
  } catch {
    return [];
  }
}

/** Object URLs remain in this tab's cache; durable storage contains only useful metadata. */
function serialize(entry: OutboxEntry): string {
  const reply = entry.replyTo;
  return JSON.stringify({
    ...entry,
    images: entry.images.filter(validImage),
    replyTo:
      reply === null
        ? null
        : {
            _id: reply._id,
            _creationTime: reply._creationTime,
            authorClerkId: reply.authorClerkId,
            authorHandle: reply.authorHandle,
            authorName: reply.authorName,
            body: reply.body || (reply.images.length ? "Picture" : ""),
          },
  });
}

function readRecords(key: string) {
  const records = new Map<string, string>();
  const rows = new Map<string, OutboxEntry>();
  const legacy: string[] = [];
  let readable = true;
  try {
    for (const source of [key, legacyKey(key)]) {
      if (source === null) continue;
      const old = window.localStorage.getItem(source);
      if (old === null) continue;
      legacy.push(source);
      for (const row of restoreOutbox(old)) {
        rows.set(row.nonce, row);
        records.set(row.nonce, serialize(row));
      }
    }
    // Independent records prevent two tabs overwriting one another's new messages.
    const prefix = key + RECORD;
    for (let index = 0; index < window.localStorage.length; index++) {
      const recordKey = window.localStorage.key(index);
      if (!recordKey?.startsWith(prefix)) continue;
      const raw = window.localStorage.getItem(recordKey);
      if (raw === "null") {
        rows.delete(recordKey.slice(prefix.length));
        records.set(recordKey.slice(prefix.length), raw);
        continue;
      }
      const row = restoreOutbox(`[${raw}]`)[0];
      if (row && recordKey === prefix + row.nonce && raw !== null) {
        rows.set(row.nonce, row);
        records.set(row.nonce, raw);
      }
    }
  } catch {
    readable = false;
    /* Dirty entries below survive blocked storage. */
  }
  return { rows, records, legacy, readable };
}

function refresh(key: string): State {
  const stored = readRecords(key);
  const previous = cache.get(key);
  if (!stored.readable && previous) {
    for (const entry of previous.entries) stored.rows.set(entry.nonce, entry);
    for (const [nonce, raw] of previous.records) stored.records.set(nonce, raw);
  }
  const before = new Map(
    previous?.entries.map((entry) => [entry.nonce, entry]),
  );
  for (const [nonce, row] of stored.rows) {
    const current = before.get(nonce);
    if (
      current &&
      (previous?.records.get(nonce) === stored.records.get(nonce) ||
        active.has(key + RECORD + nonce))
    )
      stored.rows.set(nonce, current);
    else if (current)
      stored.rows.set(nonce, {
        ...row,
        images: current.images.length ? current.images : row.images,
      });
  }
  for (const [nonce, entry] of dirty.get(key) ?? []) {
    if (entry === null) stored.rows.delete(nonce);
    else stored.rows.set(nonce, entry);
  }
  const entries = [...stored.rows.values()].sort(
    (a, b) => a.createdAt - b.createdAt || a.nonce.localeCompare(b.nonce),
  );
  const unchanged =
    previous &&
    entries.length === previous.entries.length &&
    entries.every((entry, index) => entry === previous.entries[index]);
  const state = {
    entries: unchanged ? previous.entries : entries,
    records: stored.records,
  };
  cache.set(key, state);
  return state;
}

export function getOutbox(key: string | null): OutboxEntry[] {
  if (!key || typeof window === "undefined") return EMPTY;
  return (cache.get(key) ?? refresh(key)).entries;
}

export function isOutboxDurable(key: string | null): boolean {
  return key === null || (dirty.get(key)?.size ?? 0) === 0;
}

/** Capture synchronously; only changed nonce records are written. */
export function updateOutbox(
  key: string,
  change: (entries: OutboxEntry[]) => OutboxEntry[],
): boolean {
  const state = refresh(key);
  const entries = change(state.entries);
  const byNonce = new Map(entries.map((entry) => [entry.nonce, entry]));
  const pending = dirty.get(key) ?? new Map<string, OutboxEntry | null>();
  const records = new Map(state.records);
  let durable = true;
  const legacy = readRecords(key).legacy;
  for (const nonce of new Set([
    ...state.entries.map((entry) => entry.nonce),
    ...entries.map((entry) => entry.nonce),
    ...pending.keys(),
  ])) {
    const entry = byNonce.get(nonce) ?? null;
    const raw = entry === null ? null : serialize(entry);
    if (
      legacy.length === 0 &&
      !pending.has(nonce) &&
      raw === (records.get(nonce) ?? null)
    )
      continue;
    try {
      if (raw === null) {
        if (legacy.length)
          window.localStorage.setItem(key + RECORD + nonce, "null");
        else window.localStorage.removeItem(key + RECORD + nonce);
      } else window.localStorage.setItem(key + RECORD + nonce, raw);
      pending.delete(nonce);
      if (raw === null) records.delete(nonce);
      else records.set(nonce, raw);
    } catch {
      durable = false;
      pending.set(nonce, entry);
    }
  }
  if (legacy.length > 0 && durable) {
    try {
      for (const source of legacy) window.localStorage.removeItem(source);
    } catch {
      durable = false;
    }
  }
  dirty.set(key, pending);
  cache.set(key, { entries, records });
  listeners.forEach((notify) => notify());
  return durable;
}

export function claimOutboxSend(key: string, nonce: string): boolean {
  const scoped = key + RECORD + nonce;
  if (active.has(scoped)) return false;
  active.add(scoped);
  return true;
}
export function releaseOutboxSend(key: string, nonce: string) {
  active.delete(key + RECORD + nonce);
}

export function subscribeOutbox(notify: () => void): () => void {
  listeners.add(notify);
  // A remount must see changes made while no chat had a storage listener.
  for (const key of cache.keys()) refresh(key);
  const changed = (event: StorageEvent) => {
    if (event.key === null) {
      for (const key of cache.keys()) refresh(key);
      notify();
    } else if (event.key.startsWith(PREFIX)) {
      refresh(event.key.split(RECORD)[0]);
      notify();
    }
  };
  window.addEventListener("storage", changed);
  return () => {
    listeners.delete(notify);
    window.removeEventListener("storage", changed);
  };
}
