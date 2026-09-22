import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  chatDraftKey,
  parseChatDraft,
  readChatDraft,
  updateChatDraft,
} from "../../src/lib/chat-drafts";
import { pollDraftError } from "../../src/components/app/chat/thread/poll-composer";
import type { ChatMessage } from "../../convex/chat/messages";

describe("chat draft recovery", () => {
  let stored: Map<string, string>;
  beforeEach(() => {
    stored = new Map();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => stored.get(key) ?? null,
        setItem: (key: string, value: string) => stored.set(key, value),
        removeItem: (key: string) => stored.delete(key),
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("keeps separate conversation drafts for each signed-in account", () => {
    updateChatDraft("alice", "room-a", (draft) => ({
      ...draft,
      body: "Alice's message",
    }));
    updateChatDraft("alice", "room-b", (draft) => ({
      ...draft,
      body: "Another message",
    }));
    updateChatDraft("bob", "room-a", (draft) => ({
      ...draft,
      body: "Bob's message",
    }));
    expect(readChatDraft("alice", "room-a").body).toBe("Alice's message");
    expect(readChatDraft("alice", "room-b").body).toBe("Another message");
    expect(readChatDraft("bob", "room-a").body).toBe("Bob's message");
    expect(readChatDraft(null, "room-a").body).toBe("");
    expect(chatDraftKey("a:b", "c")).not.toBe(chatDraftKey("a", "b:c"));
    expect(stored.size).toBe(3);
  });

  it("writes draft text, poll and reply to durable storage without transient image URLs", () => {
    const reply = {
      _id: "message-1",
      _creationTime: 10,
      authorClerkId: "bob",
      authorHandle: "bob",
      body: "Choose one",
      images: [
        {
          url: "blob:do-not-persist",
          attachmentId: "picture-1",
          width: 10,
          height: 10,
        },
      ],
    } as ChatMessage;
    updateChatDraft("durable", "room", (draft) => ({
      ...draft,
      body: "Lunch?",
      reply,
      poll: { options: ["Pizza", "Salad"] },
      hadAttachments: true,
    }));
    const raw = stored.get(chatDraftKey("durable", "room")!);
    expect(raw).not.toContain("blob:");
    const recovered = parseChatDraft(raw!);
    expect(recovered.body).toBe("Lunch?");
    expect(recovered.reply?._id).toBe("message-1");
    expect(recovered.poll?.options).toEqual(["Pizza", "Salad"]);
    expect(recovered.hadAttachments).toBe(true);
    updateChatDraft("durable", "room", () => ({
      body: "",
      reply: null,
      poll: null,
      hadAttachments: false,
    }));
    expect(stored.has(chatDraftKey("durable", "room")!)).toBe(false);
  });

  it("keeps the newest in-memory draft if a full disk leaves older durable data", () => {
    updateChatDraft("quota", "room", (draft) => ({ ...draft, body: "old" }));
    window.localStorage.setItem = () => {
      throw new Error("quota");
    };
    window.localStorage.removeItem = () => {
      throw new Error("quota");
    };
    updateChatDraft("quota", "room", (draft) => ({ ...draft, body: "new" }));
    expect(readChatDraft("quota", "room").body).toBe("new");
    updateChatDraft("quota", "room", () => ({
      body: "",
      reply: null,
      poll: null,
      hadAttachments: false,
    }));
    expect(readChatDraft("quota", "room").body).toBe("");
  });

  it("recovers safely from corrupted or obsolete browser data", () => {
    for (const raw of ["not json", "null", "42", "[]"])
      expect(parseChatDraft(raw).body).toBe("");
    expect(
      parseChatDraft(
        JSON.stringify({
          body: "a".repeat(3000),
          poll: { options: [1, 2] },
          reply: { _id: 12 },
        }),
      ),
    ).toMatchObject({ body: "a".repeat(2000), poll: null, reply: null });
  });
});

describe("poll validation", () => {
  it("requires distinct nonempty choices before a poll can send", () => {
    expect(pollDraftError({ options: ["", "One"] })).not.toBeNull();
    expect(pollDraftError({ options: [" Yes ", "yes"] })).not.toBeNull();
    expect(pollDraftError({ options: ["Yes", "No"] })).toBeNull();
  });
});
