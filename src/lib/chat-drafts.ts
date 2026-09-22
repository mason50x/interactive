"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { ChatMessage } from "@convex/chat/messages";

export type ChatPollDraft = { options: string[] };

export type ChatDraft = {
  body: string;
  reply: ChatMessage | null;
  poll: ChatPollDraft | null;
  hadAttachments: boolean;
};

const EMPTY: ChatDraft = {
  body: "",
  reply: null,
  poll: null,
  hadAttachments: false,
};
const memory = new Map<string, string | null>();
const listeners = new Map<string, Set<() => void>>();

/** Account and conversation are both required; anonymous drafts are never shared. */
export function chatDraftKey(
  account: string | null | undefined,
  conversation: string,
) {
  return account
    ? `chat-draft:v1:${encodeURIComponent(account)}:${encodeURIComponent(conversation)}`
    : null;
}

function snapshot(key: string | null): string | null {
  if (key === null || typeof window === "undefined") return null;
  if (memory.has(key)) return memory.get(key) ?? null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

/** Stored browser data is untrusted, and old drafts must never break the composer. */
export function parseChatDraft(raw: string | null): ChatDraft {
  if (raw === null) return EMPTY;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return EMPTY;
    const data = value as Record<string, unknown>;
    let reply: ChatMessage | null = null;
    if (typeof data.reply === "object" && data.reply !== null) {
      const candidate = data.reply as Record<string, unknown>;
      if (
        typeof candidate._id === "string" &&
        typeof candidate._creationTime === "number" &&
        typeof candidate.authorClerkId === "string" &&
        typeof candidate.authorHandle === "string" &&
        typeof candidate.body === "string"
      ) {
        reply = {
          _id: candidate._id as ChatMessage["_id"],
          _creationTime: candidate._creationTime,
          authorClerkId: candidate.authorClerkId,
          authorHandle: candidate.authorHandle,
          authorName:
            typeof candidate.authorName === "string"
              ? candidate.authorName
              : undefined,
          body: candidate.body.slice(0, 2000),
          mentions: [],
          mentionsEveryone: false,
          status: "visible",
          images: [],
          reactions: [],
        };
      }
    }
    let poll: ChatPollDraft | null = null;
    if (typeof data.poll === "object" && data.poll !== null) {
      const options = (data.poll as Record<string, unknown>).options;
      if (
        Array.isArray(options) &&
        options.length >= 2 &&
        options.length <= 6 &&
        options.every((option) => typeof option === "string")
      ) {
        poll = {
          options: options.map((option) => (option as string).slice(0, 80)),
        };
      }
    }
    return {
      body: typeof data.body === "string" ? data.body.slice(0, 2000) : "",
      reply,
      poll,
      hadAttachments: data.hadAttachments === true,
    };
  } catch {
    return EMPTY;
  }
}

export function readChatDraft(
  account: string | null | undefined,
  conversation: string,
): ChatDraft {
  return parseChatDraft(snapshot(chatDraftKey(account, conversation)));
}

function save(key: string | null, update: (draft: ChatDraft) => ChatDraft) {
  if (key === null || typeof window === "undefined") return;
  const draft = update(parseChatDraft(snapshot(key)));
  // Persist just the reply's text snapshot and identity, never transient image URLs.
  const reply =
    draft.reply === null
      ? null
      : {
          _id: draft.reply._id,
          _creationTime: draft.reply._creationTime,
          authorClerkId: draft.reply.authorClerkId,
          authorHandle: draft.reply.authorHandle,
          authorName: draft.reply.authorName,
          body:
            draft.reply.body ||
            (draft.reply.images.length > 0 ? "Picture" : ""),
        };
  const raw = JSON.stringify({ ...draft, reply });
  const empty =
    draft.body === "" &&
    reply === null &&
    draft.poll === null &&
    !draft.hadAttachments;
  memory.set(key, empty ? null : raw);
  try {
    if (empty) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, raw);
    memory.delete(key);
  } catch {
    // The in-memory copy still preserves drafts between chats if storage is blocked.
  }
  for (const listener of listeners.get(key) ?? []) listener();
}

export function updateChatDraft(
  account: string | null | undefined,
  conversation: string,
  update: (draft: ChatDraft) => ChatDraft,
) {
  save(chatDraftKey(account, conversation), update);
}

export function useChatDraft(
  account: string | null | undefined,
  conversation: string,
) {
  const key = chatDraftKey(account, conversation);
  const subscribe = useCallback(
    (listener: () => void) => {
      if (key === null) return () => {};
      const subscribers = listeners.get(key) ?? new Set();
      subscribers.add(listener);
      listeners.set(key, subscribers);
      const onStorage = (event: StorageEvent) => {
        if (event.key !== key && event.key !== null) return;
        memory.delete(key);
        listener();
      };
      window.addEventListener("storage", onStorage);
      return () => {
        subscribers.delete(listener);
        if (subscribers.size === 0) listeners.delete(key);
        window.removeEventListener("storage", onStorage);
      };
    },
    [key],
  );
  const getSnapshot = useCallback(() => snapshot(key), [key]);
  const raw = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const draft = useMemo(() => parseChatDraft(raw), [raw]);
  const updateDraft = useCallback(
    (update: (draft: ChatDraft) => ChatDraft) => save(key, update),
    [key],
  );
  return { draft, updateDraft };
}
