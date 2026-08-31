import { paginationOptsValidator, type PaginationResult } from "convex/server";
import { v } from "convex/values";
import { hasAccepted } from "../agreement";
import type { Doc, Id } from "../_generated/dataModel";
import {
  DELETE_WINDOW_MS,
  MAX_REACTION_KINDS,
  MAX_REACTORS,
  REACTIONS,
} from "../moderation/limits";
import type { Refusal } from "../moderation/rules";
import { screen, type SendContext } from "../moderation/verdict";
import { mutation, query, type QueryCtx } from "../_generated/server";
import {
  applyStrike,
  blockedBy,
  blockedEitherWay,
  callerProfile,
  membership,
  profileFor,
  pushRecent,
  standingFor,
} from "./shared";

/**
 * Saying something, and reading what was said.
 *
 * ## A refused message is not stored
 *
 * There is no row for it, no id, nothing hidden behind a flag. The filter runs
 * before the insert and the insert does not happen, which means a message that
 * broke a rule cannot be recovered, cannot leak through a query that forgot to
 * exclude it, and never existed to be replicated to anybody's client. The only
 * trace is the strike, which carries a short excerpt and belongs to the person
 * who wrote it.
 *
 * `status` on a message is therefore about the one thing that happens after it
 * is already real: reports piling up on it. Its author taking it back is not a
 * status — see `remove` below, which deletes the row.
 *
 * ## What the thread query costs
 *
 * One indexed range read per page, filtered in JavaScript afterwards. The
 * filtering is deliberately not `.filter()` on the query builder — that scans
 * without bound before the page is counted, and a busy room could walk it into
 * the thirty-two-thousand-document transaction limit. Filtering the returned
 * page instead means a page can come back short, which is correct: a page is a
 * position in the conversation, not a promise of fifty messages.
 */

export type SendResult =
  | { ok: true }
  | { ok: false; refusal: Refusal; mutedUntil?: number };

/** One message, exactly as it goes to the client. */
export type ChatMessage = {
  _id: Id<"messages">;
  _creationTime: number;
  authorClerkId: string;
  authorHandle: string;
  body: string;
  status: "visible" | "hidden";
  reactions: { emoji: string; count: number; mine: boolean }[];
};

/**
 * Send a message, if it survives.
 *
 * Everything it reads belongs to the sender: their profile, their membership
 * row, their strikes. Nothing shared is read at all, which is what keeps two
 * people talking at once from conflicting over a document neither of them is
 * writing — see the note on `dmPeer` in `convex/schema.ts`.
 */
export const send = mutation({
  args: { conversationId: v.id("conversations"), body: v.string() },
  handler: async (ctx, { conversationId, body }): Promise<SendResult> => {
    const profile = await callerProfile(ctx);
    if (profile === null) return { ok: false, refusal: "not-a-member" };

    // The terms are what the rules below are enforced under, so this is the
    // gate rather than the page that draws it. The page can only ever be a
    // courtesy: this mutation is called from a browser and a browser can be
    // asked to call it without ever rendering the card.
    if (!(await hasAccepted(ctx, profile.clerkId))) {
      return { ok: false, refusal: "not-agreed" };
    }

    const member = await membership(ctx, conversationId, profile.clerkId);
    if (member === null || member.status !== "active") {
      return { ok: false, refusal: "not-a-member" };
    }

    // A block ends the conversation for both people, and it can land after the
    // thread already exists — which is the only reason this is checked on every
    // send rather than once when the thread opened.
    if (member.dmPeer !== undefined) {
      if (await blockedEitherWay(ctx, profile.clerkId, member.dmPeer)) {
        return { ok: false, refusal: "blocked" };
      }
    }

    const now = Date.now();
    const context: SendContext = {
      surface: member.kind,
      conversationId,
      now,
      createdAt: profile.createdAt,
      messagesSent: profile.messagesSent,
      standing: await standingFor(ctx, profile.clerkId, now),
      mutedUntil: profile.mutedUntil,
      bannedAt: profile.bannedAt,
      recent: profile.recent,
    };

    const verdict = screen(body, context);

    if (!verdict.allow) {
      if (verdict.strike !== null) {
        await applyStrike(
          ctx,
          profile,
          verdict.strike,
          verdict.strike.rule === "too-fast" ? "rate" : "filter",
          conversationId,
        );
        // Re-read, because the strike may have just muted them and the client
        // should be told when it lifts rather than discovering it by trying.
        const after = await ctx.db.get(profile._id);
        return {
          ok: false,
          refusal: verdict.refusal,
          mutedUntil: after?.mutedUntil,
        };
      }
      return { ok: false, refusal: verdict.refusal, mutedUntil: profile.mutedUntil };
    }

    await ctx.db.insert("messages", {
      conversationId,
      authorClerkId: profile.clerkId,
      authorHandle: profile.handle,
      body: verdict.body,
      status: "visible",
      // Always empty now that tier three is refused rather than allowed — see
      // `flags` in `convex/schema.ts` for why the column stays anyway.
      flags: [],
    });

    await ctx.db.patch(profile._id, {
      messagesSent: profile.messagesSent + 1,
      recent: pushRecent(profile.recent, {
        at: now,
        conversationId,
        hash: verdict.hash,
        // Likewise: nothing that reaches this line carries a tier-three word.
        flagged: false,
      }),
    });

    // Your own message is read. Written on your own row, so it conflicts with
    // nothing.
    await ctx.db.patch(member._id, { lastReadAt: now });

    // Deliberately not the global room. See `lastMessageAt` in
    // `convex/schema.ts` for why one shared counter is worse than no counter.
    if (member.kind !== "global") {
      await ctx.db.patch(conversationId, { lastMessageAt: now });
    }

    return { ok: true };
  },
});

/** Fold the stored reactions into counts, and whether the caller is in them. */
function readReactions(
  message: Doc<"messages">,
  clerkId: string,
): { emoji: string; count: number; mine: boolean }[] {
  if (message.reactions === undefined) return [];
  return message.reactions
    .filter((entry) => entry.by.length > 0)
    .map((entry) => ({
      emoji: entry.emoji,
      count: entry.by.length,
      mine: entry.by.includes(clerkId),
    }));
}

/**
 * A page of a conversation, newest first.
 *
 * Returns the raw message rows and nothing joined. That is what makes an
 * optimistic send possible: the client already knows its own handle and can
 * build the row it is about to receive, which it could not do if this query
 * enriched each message with something only the server has.
 *
 * A message from somebody the caller has blocked is dropped outright. One that
 * reports have hidden keeps its place with its body emptied, so the
 * conversation still reads in order and the gap is visible rather than silently
 * closed.
 */
export const list = query({
  args: {
    conversationId: v.id("conversations"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (
    ctx,
    { conversationId, paginationOpts },
  ): Promise<PaginationResult<ChatMessage>> => {
    const profile = await callerProfile(ctx);
    if (profile === null) {
      return { page: [], isDone: true, continueCursor: "" };
    }

    const member = await membership(ctx, conversationId, profile.clerkId);
    if (member === null || member.status !== "active") {
      return { page: [], isDone: true, continueCursor: "" };
    }

    const blocked = await blockedBy(ctx, profile.clerkId);

    const result = await ctx.db
      .query("messages")
      .withIndex("byConversation", (q) => q.eq("conversationId", conversationId))
      .order("desc")
      .paginate(paginationOpts);

    const page: ChatMessage[] = [];
    for (const message of result.page) {
      if (blocked.has(message.authorClerkId)) continue;
      const gone = message.status !== "visible";
      page.push({
        _id: message._id,
        _creationTime: message._creationTime,
        authorClerkId: message.authorClerkId,
        authorHandle: message.authorHandle,
        body: gone ? "" : message.body,
        status: message.status,
        reactions: gone ? [] : readReactions(message, profile.clerkId),
      });
    }

    return { ...result, page };
  },
});

/**
 * Add or remove one of the six reactions.
 *
 * The emoji set is fixed in `convex/moderation/limits.ts`, which is the entire
 * moderation story for reactions: there is nothing to screen, because there is
 * nothing a person can put here that was not already chosen.
 *
 * Written onto the message document, so a popular message is a document several
 * people write at once. Convex retries the conflicts; the alternative is a row
 * per reaction and a read per message to draw a page, which is a worse trade at
 * every realistic size.
 */
export const react = mutation({
  args: { messageId: v.id("messages"), emoji: v.string() },
  handler: async (ctx, { messageId, emoji }) => {
    const profile = await callerProfile(ctx);
    if (profile === null) return;
    if (profile.bannedAt !== undefined) return;
    if (profile.mutedUntil !== undefined && profile.mutedUntil > Date.now()) return;
    if (!(REACTIONS as readonly string[]).includes(emoji)) return;

    const message = await ctx.db.get(messageId);
    if (message === null || message.status !== "visible") return;

    const member = await membership(ctx, message.conversationId, profile.clerkId);
    if (member === null || member.status !== "active") return;

    const reactions = message.reactions ?? [];
    const existing = reactions.find((entry) => entry.emoji === emoji);

    if (existing === undefined) {
      if (reactions.length >= MAX_REACTION_KINDS) return;
      await ctx.db.patch(messageId, {
        reactions: [...reactions, { emoji, by: [profile.clerkId] }],
      });
      return;
    }

    const mine = existing.by.includes(profile.clerkId);
    const by = mine
      ? existing.by.filter((id) => id !== profile.clerkId)
      : existing.by.length >= MAX_REACTORS
        ? existing.by
        : [...existing.by, profile.clerkId];

    await ctx.db.patch(messageId, {
      reactions: reactions.map((entry) =>
        entry.emoji === emoji ? { emoji, by } : entry,
      ),
    });
  },
});

/**
 * Unsend something you just said.
 *
 * The document goes — no tombstone, no emptied row, nothing left in the thread
 * to say that anything was there. That is only defensible because the window is
 * `DELETE_WINDOW_MS` wide: inside thirty seconds a message has been read by
 * almost nobody and replied to by nobody, so taking it back edits nothing that
 * anyone was part of. Past the window the mutation refuses, and the message
 * stays for good — a conversation somebody else is in is not one person's to
 * rewrite an hour later.
 *
 * The window is checked here and only here. The menu that offers it stops
 * offering at the same moment, but that is a courtesy: this runs from a browser
 * and a browser can be asked to call it whenever it likes.
 *
 * Only your own, and ownership is re-established from the message rather than
 * trusted from the caller.
 */
export const remove = mutation({
  args: { messageId: v.id("messages") },
  handler: async (ctx, { messageId }) => {
    const profile = await callerProfile(ctx);
    if (profile === null) return;

    const message = await ctx.db.get(messageId);
    if (message === null) return;
    if (message.authorClerkId !== profile.clerkId) return;
    if (Date.now() - message._creationTime > DELETE_WINDOW_MS) return;

    // Reports are about a message and do not outlive it — the same rule the
    // `byConversation` index on `reports` exists to serve when a whole
    // conversation goes. Within thirty seconds there is rarely one to find.
    const reports = await ctx.db
      .query("reports")
      .withIndex("byMessage", (q) => q.eq("messageId", messageId))
      .collect();
    for (const report of reports) await ctx.db.delete(report._id);

    // The strike a report may already have written is not touched. It belongs
    // to the ledger, carries its own excerpt, and is the account of a decision
    // rather than a copy of the message. See `convex/schema.ts`.
    await ctx.db.delete(messageId);
  },
});

/**
 * How many rows the search index is asked for before permissions are applied.
 *
 * The index cannot know which conversations the caller is in — see
 * `searchBody` in `convex/schema.ts` — so it answers from every message in
 * the deployment and this handler throws away the ones that are not the
 * caller's. That means over-fetching: the ratio of kept to scanned is worst
 * for someone in nothing but the global room, and this number is what decides
 * whether they get a full palette or three results. Bounded rather than
 * paginated because there is no "next page" in a palette — you refine the
 * query instead.
 */
const SEARCH_SCAN = 96;

/** How many survive into the palette. */
const SEARCH_RESULTS = 6;

/**
 * One message, with enough of its conversation to be named in a list that is
 * mostly not about chat.
 *
 * The conversation is described by the same three fields `conversationName`
 * in `src/lib/chat.ts` takes, so the palette labels a hit with the function
 * the conversation list and the thread header already use rather than a
 * fourth opinion about what a room is called.
 */
export type MessageHit = {
  _id: Id<"messages">;
  _creationTime: number;
  conversationId: Id<"conversations">;
  kind: "global" | "dm" | "group";
  title?: string;
  peerHandle?: string;
  authorHandle: string;
  body: string;
};

/**
 * Full-text search across every message the caller is allowed to read.
 *
 * The permission check is the whole of this function. Convex's search index
 * has no idea who is asking, so a naive handler here would hand back the
 * contents of every direct message on the site to anyone who guessed a word
 * in one — which is the single worst bug this file could have. Three things
 * stand between the index and the reply, and all three run per row:
 *
 * - the caller has to be an *active* member of the conversation. `invited`,
 *   `requested`, `banned` and `left` all fail, so a group somebody was thrown
 *   out of stops being searchable the moment they leave it;
 * - the author must not have blocked them, or be blocked by them, which is
 *   the same set `list` above hides from the thread;
 * - the message has to be `visible`, which the index itself enforces.
 *
 * Membership and conversation naming are cached per conversation for the
 * length of one call. A search that matches forty messages in the global room
 * is one membership read, not forty.
 *
 * Nothing here is paginated and nothing is ordered by time: the index returns
 * rows by relevance, the handler keeps the first `SEARCH_RESULTS` that
 * survive, and a search that wants different results is a search you retype.
 */
export const search = query({
  args: { text: v.string() },
  handler: async (ctx, { text }): Promise<MessageHit[]> => {
    const needle = text.trim();
    // A search index refuses an empty term, and there is nothing to look for
    // anyway — this is the state the palette is in before the first keystroke.
    if (needle === "") return [];

    const profile = await callerProfile(ctx);
    if (profile === null) return [];

    const blocked = await blockedBy(ctx, profile.clerkId);

    const rows = await ctx.db
      .query("messages")
      .withSearchIndex("searchBody", (q) =>
        q.search("body", needle).eq("status", "visible"),
      )
      .take(SEARCH_SCAN);

    // Conversation id to how it should be named, or `null` for "not the
    // caller's". Both answers are worth caching: the misses are what a search
    // matching a busy room the caller is not in costs.
    type Named = Pick<MessageHit, "kind" | "title" | "peerHandle">;
    const known = new Map<string, Named | null>();

    const hits: MessageHit[] = [];

    for (const message of rows) {
      if (hits.length >= SEARCH_RESULTS) break;
      if (blocked.has(message.authorClerkId)) continue;

      let named = known.get(message.conversationId);
      if (named === undefined) {
        named = await nameFor(ctx, message.conversationId, profile.clerkId);
        known.set(message.conversationId, named);
      }
      if (named === null) continue;

      hits.push({
        _id: message._id,
        _creationTime: message._creationTime,
        conversationId: message.conversationId,
        authorHandle: message.authorHandle,
        body: message.body,
        ...named,
      });
    }

    return hits;
  },
});

/**
 * How to label a conversation to this caller, or `null` if it is not theirs.
 *
 * The kind and the other person's id come off the caller's own member row
 * rather than the conversation document, which is the same trick the send path
 * uses: one indexed read answers both "may they see this" and "what is it",
 * and the conversation itself is only fetched for a group's title.
 */
async function nameFor(
  ctx: QueryCtx,
  conversationId: Id<"conversations">,
  clerkId: string,
): Promise<Pick<MessageHit, "kind" | "title" | "peerHandle"> | null> {
  const member = await membership(ctx, conversationId, clerkId);
  if (member === null || member.status !== "active") return null;

  if (member.kind === "dm") {
    const peer =
      member.dmPeer === undefined
        ? null
        : await profileFor(ctx, member.dmPeer);
    return { kind: "dm", peerHandle: peer?.handle };
  }

  if (member.kind === "group") {
    const conversation = await ctx.db.get(conversationId);
    return { kind: "group", title: conversation?.title };
  }

  return { kind: "global" };
}
