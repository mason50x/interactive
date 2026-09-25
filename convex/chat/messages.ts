import { addScore } from "../leaderboard";
import { rewardChatPlaytime } from "../experience";
import type { ChatAccount } from "./shared";
import { announcementPublisherId, staffId } from "./admin";
import { BOT_MENTION_HANDLES } from "../../config/bot";
import { DM_REWARD_SECONDS } from "../../config/playtime";
import { botQuotaName } from "./botConfig";
import { lockedFor, roomControlRefusal } from "./roomControls";
import { paginationOptsValidator, type PaginationResult } from "convex/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { imagesEnabled } from "../features";
import type { Doc, Id } from "../_generated/dataModel";
import {
  DELETE_WINDOW_MS,
  MAX_IMAGES_PER_MESSAGE,
  MAX_MENTIONS,
  MAX_REACTION_KINDS,
  MAX_REACTORS,
  REACTIONS,
} from "../moderation/limits";
import { EVERYONE, findMentionTokens } from "../moderation/mentions";
import type { Refusal } from "../moderation/rules";
import { screen, screenStatic, type SendContext } from "../moderation/verdict";
import { mutation, query, type QueryCtx } from "../_generated/server";
import { BOT_HANDLE, BOT_ID, BOT_NAME, botRateLimiter, presentBotBody } from "./botConfig";
import {
  avatarAppearance,
  callerAccount,
  clearTyping,
  deleteMessage,
  membership,
  accountByHandle,
  accountFor,
  pushRecent,
  senderRow,
  senderState,
} from "./shared";

/** Rooms whose messages earn playtime. See `rewardChatPlaytime`. */
const REWARDED_ROOMS: ReadonlySet<string> = new Set(["global", "announcements", "admins"]);

/**
 * Saying something, and reading what was said.
 *
 * ## A refused message is not stored
 *
 * There is no row for it, no id, nothing hidden behind a flag. The filter runs
 * before the insert and the insert does not happen, which means a message that
 * broke a rule cannot be recovered, cannot leak through a query that forgot to
 * exclude it, and never existed to be replicated to anybody's client.
 *
 * `status` retains compatibility with legacy hidden messages. New messages are
 * visible; `remove` deletes the row when its author takes it back.
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
  { ok: true } | { ok: false; refusal: Refusal };

/** One message, exactly as it goes to the client. */
export type ChatMessage = {
  _id: Id<"messages">;
  _creationTime: number;
  authorClerkId: string;
  authorHandle: string;
  /** The author's display name when it was sent, if they had one. */
  authorName?: string;
  /** The author's current chat-owned picture or fallback disc. */
  authorAvatarUrl?: string;
  authorAvatarHue?: number;
  authorAvatarEmoji?: string;
  authorAvatarInitials?: string;
  body: string;
  editedAt?: number;
  poll?: ChatPoll;
  replyTo?: ChatReply;
  /**
   * Who the body names, as the server resolved them — see `mentions` in
   * `convex/schema.ts`. The thread finds each `@handle` in the body and draws
   * it as a chip; an optimistic send fills these from the people it offered.
   */
  mentions: ChatMention[];
  mentionsEveryone: boolean;
  status: "visible" | "hidden";
  reactions: ChatReaction[];
  /**
   * The pictures, as URLs. Resolved from storage ids by `list`, so the
   * client never sees an id it could hand back — and the optimistic send
   * fills these with its own object URLs, which is why they are URLs and
   * nothing more structured.
   */
  images: ChatImage[];
};

/** One person a message names: the card to open, and the handle to find. */
export type ChatMention = { clerkId: string; handle: string };

/** The safe, current preview of the message a reply points to. */
export type ChatReply = {
  messageId: Id<"messages">;
  unavailable: boolean;
  authorClerkId?: string;
  authorHandle?: string;
  authorName?: string;
  preview?: string;
};

/** One reaction pill in the thread. Identities are fetched only on hover. */
export type ChatReaction = {
  emoji: string;
  count: number;
  mine: boolean;
};

/** Only aggregate counts and the reader's own choice leave the server. */
export type ChatPoll = {
  options: { text: string; votes: number }[];
  myVote: number | null;
  totalVotes: number;
};

export const EDIT_WINDOW_MS = 15 * 60_000;
const MAX_POLL_VOTERS = 1000;
const sendResultValidator = v.union(
  v.object({ ok: v.literal(true) }),
  v.object({ ok: v.literal(false), refusal: v.string() }),
);
const chatMessageValidator = v.object({
  _id: v.id("messages"), _creationTime: v.number(), authorClerkId: v.string(),
  authorHandle: v.string(), authorName: v.optional(v.string()),
  authorAvatarUrl: v.optional(v.string()), authorAvatarHue: v.optional(v.number()),
  authorAvatarEmoji: v.optional(v.string()), authorAvatarInitials: v.optional(v.string()),
  body: v.string(), editedAt: v.optional(v.number()),
  poll: v.optional(v.object({
    options: v.array(v.object({ text: v.string(), votes: v.number() })),
    myVote: v.union(v.number(), v.null()), totalVotes: v.number(),
  })),
  replyTo: v.optional(v.object({
    messageId: v.id("messages"), unavailable: v.boolean(),
    authorClerkId: v.optional(v.string()), authorHandle: v.optional(v.string()),
    authorName: v.optional(v.string()), preview: v.optional(v.string()),
  })),
  mentions: v.array(v.object({ clerkId: v.string(), handle: v.string() })),
  mentionsEveryone: v.boolean(), status: v.union(v.literal("visible"), v.literal("hidden")),
  reactions: v.array(v.object({ emoji: v.string(), count: v.number(), mine: v.boolean() })),
  images: v.array(v.object({ attachmentId: v.id("attachments"), url: v.string(), width: v.number(), height: v.number() })),
});

/** A person named inside a reaction tooltip. */
export type ReactionPerson = {
  clerkId: string;
  handle: string;
  displayName?: string;
};

/**
 * `attachmentId` is here for the sender's own browser, which keeps the
 * preview it uploaded under that id and draws it instead of fetching the
 * same pixels back — see `previewFor` in `src/lib/images.ts`. It is of no
 * use to anybody else: a `sent` row cannot be named by a send, so the id
 * grants nothing.
 */
export type ChatImage = {
  attachmentId: Id<"attachments">;
  url: string;
  width: number;
  height: number;
};

/**
 * Send a message, if it survives.
 *
 * Everything it reads belongs to the sender: their profile, their membership
 * row, and now their pictures — an `attachments` row is the sender's own,
 * written by nobody else. Nothing shared is read at all, which
 * is what keeps two people talking at once from conflicting over a document
 * neither of them is writing — see the note on `dmPeer` in `convex/schema.ts`.
 *
 * ## Pictures are proven, not passed
 *
 * `attachmentIds` names rows, and every row has to be this caller's and in
 * `ready` — the state a picture only reaches after the classifier has said
 * yes, see `convex/chat/attachments.ts`. A bare storage id is never accepted
 * here, because a storage id proves nothing about who uploaded it or whether
 * anybody looked. A message with a picture that fails this check is refused
 * whole, with `image`: the client's copy is stale and it should start over.
 */
export const send = mutation({
  args: {
    conversationId: v.id("conversations"),
    body: v.string(),
    attachmentIds: v.optional(v.array(v.id("attachments"))),
    replyToId: v.optional(v.id("messages")),
    poll: v.optional(v.object({ options: v.array(v.string()) })),
    clientNonce: v.optional(v.string()),
    expectedAuthorClerkId: v.optional(v.string()),
  },
  returns: sendResultValidator,
  handler: async (
    ctx,
    { conversationId, body, attachmentIds, replyToId, poll, clientNonce, expectedAuthorClerkId },
  ): Promise<SendResult> => {
    const profile = await callerAccount(ctx);
    if (profile === null) return { ok: false, refusal: "not-a-member" };
    if (expectedAuthorClerkId !== undefined && expectedAuthorClerkId !== profile.clerkId) return { ok: false, refusal: "not-a-member" };


    const member = await membership(ctx, conversationId, profile.clerkId);
    if (member === null || member.status !== "active") {
      return { ok: false, refusal: "not-a-member" };
    }

    if (member.kind === "announcements" && (await announcementPublisherId(ctx)) === null) {
      return { ok: false, refusal: "read-only" };
    }

    // A retry may arrive after the original transaction committed. Check before
    // attachment ownership and rate limits, since the first send consumed both.
    let clientRequestHash: string | undefined;
    if (clientNonce !== undefined) {
      if (clientNonce.length < 1 || clientNonce.length > 128) return { ok: false, refusal: "too-long" };
      const payload = JSON.stringify([conversationId, body, attachmentIds ?? [], replyToId ?? null, poll?.options ?? null]);
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
      clientRequestHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
      const existing = await ctx.db.query("messages")
        .withIndex("byAuthorNonce", q => q.eq("authorClerkId", profile.clerkId).eq("clientNonce", clientNonce))
        .unique();
      if (existing !== null) return existing.conversationId === conversationId && existing.clientRequestHash === clientRequestHash
        ? { ok: true } : { ok: false, refusal: "duplicate" };
    }

    let pollOptions: string[] | undefined;
    if (poll !== undefined) {
      if (poll.options.length < 2) return { ok: false, refusal: "empty" };
      if (poll.options.length > 6) return { ok: false, refusal: "too-long" };
      // The question is screened by the normal send pipeline below. Every
      // choice receives the same static moderation as a public group title.
      pollOptions = [];
      for (const option of poll.options) {
        const screened = screenStatic(option, 80);
        if (!screened.ok) return { ok: false, refusal: screened.refusal };
        if (pollOptions.some(text => text.toLowerCase() === screened.text.toLowerCase())) return { ok: false, refusal: "duplicate" };
        pollOptions.push(screened.text);
      }
      if (body.trim() === "") return { ok: false, refusal: "empty" };
    }

    // A reply is a relationship the server proves, not a client-authored
    // quote. It must still be visible, in this conversation, and between
    // people who may see each other. If it changes while the composer is open,
    // the words are handed back with a specific, free refusal.
    if (replyToId !== undefined) {
      const target = await ctx.db.get(replyToId);
      if (
        target === null ||
        target.conversationId !== conversationId ||
        target.status !== "visible" ||
        target.authorClerkId === profile.clerkId
      ) {
        return { ok: false, refusal: "reply-unavailable" };
      }
    }

    // Who the body names, settled before the filter reads it — the filter
    // has to be told which `@words` are people in the room, or it refuses
    // every one of them as contact details. A refusal here is free and the
    // words come back to be changed. See `resolveMentions`.
    const named = await resolveMentions(ctx, profile, member, body);
    if (!named.ok) return { ok: false, refusal: named.refusal };

    // The pictures, before anything is judged. Deduplicated so a client that
    // names one twice does not get it drawn twice, and read in full so that
    // a refusal here costs the sender nothing — the rows stay `ready`, and a
    // message that fails on its text can be sent again with the same ones.
    const ids = [...new Set(attachmentIds ?? [])];
    if (ids.length > MAX_IMAGES_PER_MESSAGE) {
      return { ok: false, refusal: "too-many-images" };
    }
    // Pictures switched off between the upload and the send, or a client
    // that never looked at the switch. Either way none may go out.
    if (ids.length > 0 && !imagesEnabled()) {
      return { ok: false, refusal: "image" };
    }
    const attached: Doc<"attachments">[] = [];
    for (const id of ids) {
      const row = await ctx.db.get(id);
      if (
        row === null ||
        row.ownerClerkId !== profile.clerkId ||
        row.status !== "ready" ||
        (row.purpose ?? "message") !== "message"
      ) {
        return { ok: false, refusal: "image" };
      }
      attached.push(row);
    }

    const now = Date.now();

    // The counter and the ring, which are the sender's own row rather than
    // their profile — see `chatSenders` in `convex/schema.ts`. `null` is an
    // account that has not sent anything since the two fields moved, and
    const sender = await senderRow(ctx, profile.clerkId);
    const state = senderState(sender);

    // The Everyone room's lock and slow mode. Staff are exempt, and nothing
    // more is read while both are off. See `convex/chat/roomControls.ts`.
    if (member.kind === "global") {
      const held = await roomControlRefusal(
        ctx, conversationId, profile.clerkId, state.recent, now,
      );
      if (held !== null) return { ok: false, refusal: held };
    }

    const context: SendContext = {
      surface: member.kind === "announcements" ? "global" : member.kind === "admins" ? "group" : member.kind,
      conversationId,
      now,
      createdAt: profile.createdAt,
      messagesSent: state.messagesSent,
      recent: state.recent,
      attachmentKey: attached.length > 0 ? ids.join(",") : undefined,
      mentions: named.tokens,
      // `@bot` is reserved syntax rather than user-authored text. Keep every
      // word around it under the normal lexicon and pattern scans, but do not
      // let the handle itself turn into a leetspeak match when `@` folds to
      // `a` during normalisation.
      lexiconExemptMentions: named.bot
        ? BOT_MENTION_HANDLES
        : undefined,
    };

    const verdict = screen(body, context);

    if (!verdict.allow) {
      return { ok: false, refusal: verdict.refusal };
    }

    const messageId = await ctx.db.insert("messages", {
      conversationId,
      authorClerkId: profile.clerkId,
      authorHandle: profile.handle,
      authorName: profile.displayName,
      body: verdict.body,
      clientNonce,
      clientRequestHash,
      poll: pollOptions === undefined ? undefined : { options: pollOptions, votes: [] },
      replyToId,
      mentions: named.people.length === 0 ? undefined : named.people,
      mentionsEveryone: named.everyone ? true : undefined,
      status: "visible",
      // Always empty now that tier three is refused rather than allowed — see
      // `flags` in `convex/schema.ts` for why the column stays anyway.
      flags: [],
      images:
        attached.length === 0
          ? undefined
          : attached.map((row) => ({
              attachmentId: row._id,
              storageId: row.storageId,
              width: row.width,
              height: row.height,
            })),
    });

    // Shared rooms earn full playtime and direct messages half. Group chats,
    // and anything addressed to the bot, would let one person farm time alone.
    if (!named.bot) {
      if (REWARDED_ROOMS.has(member.kind)) {
        await rewardChatPlaytime(ctx, profile.clerkId, verdict.body);
      } else if (member.kind === "dm") {
        await rewardChatPlaytime(ctx, profile.clerkId, verdict.body, DM_REWARD_SECONDS);
      }
    }
    await addScore(ctx, profile.clerkId, "chat", 1, now);

    // The dots go with the words, in the same transaction, so nobody ever
    // sees the message and "still typing" on one screen at once. See
    // `convex/chat/typing.ts`.
    await clearTyping(ctx, conversationId, profile.clerkId);

    // From here the pictures are the message's. `sent` is what keeps the
    // sweep off them and what stops the same row being named by a second
    // send — see `attachments` in `convex/schema.ts`.
    for (const row of attached) {
      await ctx.db.patch(row._id, { status: "sent", messageId });
    }

    // One row per person named, for their conversation list to find — see
    // `mentions` in `convex/schema.ts`. Not for the sender naming themself,
    // which is a chip and not a ping.
    for (const person of named.people) {
      if (person.clerkId === profile.clerkId || person.clerkId === BOT_ID)
        continue;
      await ctx.db.insert("mentions", {
        conversationId,
        messageId,
        target: person.clerkId,
        authorClerkId: profile.clerkId,
      });
    }
    if (named.everyone) {
      await ctx.db.insert("mentions", {
        conversationId,
        messageId,
        target: EVERYONE,
        authorClerkId: profile.clerkId,
      });
    }

    const moved = {
      messagesSent: state.messagesSent + 1,
      recent: pushRecent(state.recent, {
        at: now,
        conversationId,
        hash: verdict.hash,
        // Likewise: nothing that reaches this line carries a tier-three word.
        flagged: false,
      }),
    };

    // Rolling daily allowance: 50 for the verified admin, five for everyone else. This lives in the
    // rate-limiter component rather than growing a row-per-tag usage log.
    // Missing configuration is free so setup never burns a real allowance.
    const botReady = Boolean(process.env.GEMINI_API_KEY);
    const quotaName = await botQuotaName(ctx, profile.clerkId);
    const botLimit =
      named.bot && botReady
        ? await botRateLimiter.limit(ctx, quotaName, { key: profile.clerkId })
        : null;
    const botExhausted = botLimit?.ok === false;

    // The one document a send writes that anybody else's query could have
    // read is now not written at all: this is the sender's own row, and the
    // invitation joins for a handle — is left alone.
    if (sender === null) {
      await ctx.db.insert("chatSenders", {
        clerkId: profile.clerkId,
        ...moved,
      });
    } else {
      await ctx.db.patch(sender._id, moved);
    }

    // Everything the old man does happens after this mutation has returned:
    // the dots, the model, the pause, the reply. The sender's own message is
    // already stored, so a slow answer costs them nothing.
    if (named.bot) {
      await ctx.scheduler.runAfter(0, internal.chat.bot.ask, {
        conversationId,
        messageId,
        askerClerkId: profile.clerkId,
        askerHandle: profile.handle,
        exhausted: botExhausted,
        retryAfter: botLimit?.retryAfter,
        metered: botLimit?.ok === true,
        quotaName,
      });
    }

    // Your own message is read. Written on your own row, so it conflicts with
    // nothing.
    //
    // Read up to the message's own `_creationTime` rather than to `now`. The
    // two are not the same number: `now` is the instant this mutation began,
    // and the row is stamped a fraction of a millisecond after it — so a
    // reading position set to `now` sits *before* the message it was meant
    // to cover, and `conversations.list` counted the sender's own words as
    // one unread. The sender saw that as their row and the rail's dot
    // lighting for the beat it took the open thread to write `markRead`, and
    // then going out again.
    const inserted = await ctx.db.get(messageId);
    await ctx.db.patch(member._id, {
      lastReadAt: inserted?._creationTime ?? now,
    });

    // Deliberately not the global room. See `lastMessageAt` in
    // `convex/schema.ts` for why one shared counter is worse than no counter.
    if (member.kind !== "global") {
      await ctx.db.patch(conversationId, { lastMessageAt: now });
    }

    return { ok: true };
  },
});

type ResolvedMentions =
  | {
      ok: true;
      /** The people named, deduplicated, in the order they appear. */
      people: ChatMention[];
      everyone: boolean;
      /**
       * The `@words` as typed (lowercased) that turned out to be people, for
       * the filter to look past. Not the same set as the handles in `people`:
       * `@al1ce` resolves to alice, and it is `al1ce` the body says.
       */
      tokens: Set<string>;
      /** An Everyone tag or any message in the caller’s private bot DM. */
      bot: boolean;
    }
  | { ok: false; refusal: Refusal };

/**
 * Which of the `@words` in a body are people in this conversation.
 *
 * Nowhere, in a direct message. Either side is one person away already, so
 * there is nobody to pick out of a crowd — every `@word` there is plain
 * text: no chips, no pings, no refusals. The bot's own direct message still
 * answers every message, with or without `@bot` in it.
 *
 * The server reads the body and decides, rather than trusting a list from the
 * client — see `convex/moderation/mentions.ts` for why. Each word is looked
 * up by its folded handle, and a word that is nobody's handle is left alone:
 * it is not a mention, and whether it is contact details is the filter's
 * question, which is asked next.
 *
 * A word that *is* somebody's handle has to be somebody in the room. Naming a
 * person who is not — not a member — is
 * refused with `mention`, and refused rather than quietly left as text: text
 * that says `@name` goes on to the contact rule and would return the wrong
 * reason. The refusal hands the words back.
 *
 * `@everyone` is the Everyone room's alone, and staff's alone there.
 * Anywhere else it is refused the same way, for the same reason: `everyone`
 * is a reserved handle, so it resolves to nobody, and the contact rule would
 * take it from there.
 *
 * ## What this reads
 *
 * A membership row per person named, which is a row that person writes on
 * every message they read. That is the one thing the send path otherwise
 * never touches — see `dmPeer` in `convex/schema.ts` — and it is accepted
 * here because it is bounded by `MAX_MENTIONS`, paid only by messages that
 * name somebody, and the alternative is trusting the client about who is in
 * the room. A conflict with the named person marking the thread read is a
 * retry, not a wrong answer.
 */
async function resolveMentions(
  ctx: QueryCtx,
  profile: ChatAccount,
  member: Doc<"conversationMembers">,
  body: string,
): Promise<ResolvedMentions> {
  const people: ChatMention[] = [];
  const tokens = new Set<string>();
  const seen = new Set<string>();
  let everyone = false;
  let bot = member.kind === "dm" && member.dmPeer === BOT_ID;

  // A direct message is two people. `@alice` there is not naming somebody
  // out of a crowd, so there is nothing to resolve and nothing to refuse.
  // Return every `@word` as a token anyway, so the filter reads them as the
  // plain text they are rather than as contact details. The bot flag above
  // is what still sends every bot-DM message to `ask`.
  if (member.kind === "dm") {
    for (const token of findMentionTokens(body)) tokens.add(token.handle);
    return { ok: true, people, everyone, tokens, bot };
  }

  for (const token of findMentionTokens(body)) {
    if (tokens.has(token.handle)) continue;

    // The assistant's handles are reserved. Add its identity so the thread
    // draws a chip; `send` knows not to write a mention row for it.
    if (BOT_MENTION_HANDLES.has(token.handle)) {
      if (member.kind !== "global" && member.dmPeer !== BOT_ID) return { ok: false, refusal: "mention" };
      bot = true;
      tokens.add(token.handle);
      if (!seen.has(BOT_ID)) {
        seen.add(BOT_ID);
        people.push({ clerkId: BOT_ID, handle: BOT_HANDLE });
      }
      continue;
    }

    if (token.handle === EVERYONE) {
      if (member.kind !== "global") {
        return { ok: false, refusal: "mention-everyone" };
      }
      if ((await staffId(ctx)) === null) {
        return { ok: false, refusal: "mention-everyone" };
      }
      everyone = true;
      tokens.add(token.handle);
      continue;
    }

    const theirs = await accountByHandle(ctx, token.handle);
    if (theirs === null) continue;

    if (seen.size >= MAX_MENTIONS) return { ok: false, refusal: "mention" };

    // Two spellings that fold to the same person are one person.
    if (!seen.has(theirs.clerkId)) {
      if (theirs.clerkId !== profile.clerkId) {
        const seat = await membership(
          ctx,
          member.conversationId,
          theirs.clerkId,
        );
        if (seat === null || seat.status !== "active") {
          return { ok: false, refusal: "mention" };
        }
      }
      seen.add(theirs.clerkId);
      people.push({ clerkId: theirs.clerkId, handle: theirs.handle });
    }
    tokens.add(token.handle);
  }

  return { ok: true, people, everyone, tokens, bot };
}

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

const REPLY_PREVIEW_CHARS = 160;


async function replyOf(
  ctx: QueryCtx,
  message: Doc<"messages">,
  originals: Map<Id<"messages">, Doc<"messages"> | null>,
  accounts: Map<string, ChatAccount | null>,
): Promise<ChatReply | undefined> {
  if (message.replyToId === undefined) return undefined;

  if (!originals.has(message.replyToId)) {
    originals.set(message.replyToId, await ctx.db.get(message.replyToId));
  }
  const target = originals.get(message.replyToId) ?? null;
  if (
    target === null ||
    target.status !== "visible" ||
    target.conversationId !== message.conversationId
  ) {
    return { messageId: message.replyToId, unavailable: true };
  }

  const body = presentBotBody(target.body, target.authorClerkId).replace(/\s+/g, " ").trim();
  const pictures = target.images?.length ?? 0;
  const preview =
    body !== ""
      ? body.slice(0, REPLY_PREVIEW_CHARS)
      : pictures === 1
        ? "Photo"
        : pictures > 1
          ? `${pictures} photos`
          : "Message";

  const author = await accountForMessage(ctx, target.authorClerkId, accounts);
  return {
    messageId: target._id,
    unavailable: false,
    authorClerkId: target.authorClerkId,
    authorHandle: target.authorClerkId === BOT_ID ? BOT_HANDLE : author?.handle ?? target.authorHandle,
    authorName: target.authorClerkId === BOT_ID ? BOT_NAME : author ? author.displayName : target.authorName,
    preview,
  };
}


export const list = query({
  args: {
    conversationId: v.id("conversations"),
    /**
     * The reader's local-day bounds. Only the global room uses them; direct
     * messages and groups remain continuous conversations. The browser owns
     * the boundary because it is the only place that knows the reader's
     * timezone (and the DST offset of an archived day).
     */
    dayStart: v.number(),
    dayEnd: v.number(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (
    ctx,
    { conversationId, dayStart, dayEnd, paginationOpts },
  ): Promise<PaginationResult<ChatMessage>> => {
    const profile = await callerAccount(ctx);
    if (profile === null) {
      return { page: [], isDone: true, continueCursor: "" };
    }

    const member = await membership(ctx, conversationId, profile.clerkId);
    if (member === null || member.status !== "active") {
      return { page: [], isDone: true, continueCursor: "" };
    }


    const result = await ((member.kind === "global" || member.kind === "announcements")
      ? ctx.db
          .query("messages")
          .withIndex("byConversation", (q) =>
            q
              .eq("conversationId", conversationId)
              .gte("_creationTime", dayStart)
              .lt("_creationTime", dayEnd),
          )
      : ctx.db
          .query("messages")
          .withIndex("byConversation", (q) =>
            q.eq("conversationId", conversationId),
          ))
      .order("desc")
      .paginate(paginationOpts);

    const page = await presentMessages(ctx, result.page, profile);
    return { ...result, page };
  },
});

async function accountForMessage(ctx: QueryCtx, clerkId: string, accounts: Map<string, ChatAccount | null>): Promise<ChatAccount | null> {
  if (!accounts.has(clerkId)) accounts.set(clerkId, await accountFor(ctx, clerkId));
  return accounts.get(clerkId) ?? null;
}

async function presentMessages(ctx: QueryCtx, rows: Doc<"messages">[], profile: ChatAccount): Promise<ChatMessage[]> {
    const clerkId = profile.clerkId;
    // A repeated quoted author and a row author share the same profile read.
    const accounts = new Map<string, ChatAccount | null>([[clerkId, profile]]);
    const page: ChatMessage[] = [];
    // replyOf still applies every visibility check before exposing a preview.
    const originals = new Map<Id<"messages">, Doc<"messages"> | null>(
      rows.map((message) => [message._id, message]),
    );
    const appearances = new Map<
      string,
      Awaited<ReturnType<typeof avatarAppearance>> & { handle?: string; displayName?: string }
    >();
    for (const message of rows) {
      const gone = message.status !== "visible";
      let avatar = appearances.get(message.authorClerkId);
      if (avatar === undefined) {
        const author = await accountForMessage(ctx, message.authorClerkId, accounts);
        avatar = author === null ? {} : { ...(await avatarAppearance(ctx, author)), handle: author.handle, displayName: author.displayName };
        appearances.set(message.authorClerkId, avatar);
      }
      page.push({
        _id: message._id,
        _creationTime: message._creationTime,
        authorClerkId: message.authorClerkId,
        authorHandle: message.authorClerkId === BOT_ID ? BOT_HANDLE : avatar.handle ?? message.authorHandle,
        authorName: message.authorClerkId === BOT_ID ? BOT_NAME : avatar.handle === undefined ? message.authorName : avatar.displayName,
        authorAvatarUrl: avatar.avatarUrl,
        authorAvatarHue: avatar.avatarHue,
        authorAvatarEmoji: avatar.avatarEmoji,
        authorAvatarInitials: avatar.avatarInitials,
        body: gone ? "" : presentBotBody(message.body, message.authorClerkId),
        editedAt: gone ? undefined : message.editedAt,
        poll: gone ? undefined : pollOf(message, clerkId),
        replyTo: gone ? undefined : await replyOf(ctx, message, originals, accounts),
        mentions: gone ? [] : (message.mentions ?? []),
        mentionsEveryone: gone ? false : (message.mentionsEveryone ?? false),
        status: message.status,
        reactions: gone ? [] : readReactions(message, clerkId),
        images: gone ? [] : await imagesOf(ctx, message),
      });
    }

    return page;
}

function pollOf(message: Doc<"messages">, clerkId: string): ChatPoll | undefined {
  if (message.poll === undefined) return undefined;
  return {
    options: message.poll.options.map((text, option) => ({ text, votes: message.poll!.votes.filter(vote => vote.option === option).length })),
    myVote: message.poll.votes.find(vote => vote.clerkId === clerkId)?.option ?? null,
    totalVotes: message.poll.votes.length,
  };
}

/**
 * A message's pictures as something a browser can draw.
 *
 * One storage lookup per picture and no table reads: the dimensions ride on
 * the message — see `images` in `convex/schema.ts`. A picture whose file has
 * gone is dropped rather than drawn broken, which cannot happen through any
 * path in this codebase and is handled because storage is the one table here
 * that can be edited from a dashboard.
 */
async function imagesOf(
  ctx: QueryCtx,
  message: Doc<"messages">,
): Promise<ChatImage[]> {
  if (message.images === undefined) return [];
  const images: ChatImage[] = [];
  for (const image of message.images) {
    const url = await ctx.storage.getUrl(image.storageId);
    if (url === null) continue;
    images.push({
      attachmentId: image.attachmentId,
      url,
      width: image.width,
      height: image.height,
    });
  }
  return images;
}

/**
 * Add or remove one of the available reactions.
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
    const profile = await callerAccount(ctx);
    if (profile === null) return;
    if (!(REACTIONS as readonly string[]).includes(emoji)) return;

    const message = await ctx.db.get(messageId);
    if (message === null || message.status !== "visible") return;

    const member = await membership(
      ctx,
      message.conversationId,
      profile.clerkId,
    );
    if (member === null || member.status !== "active") return;
    if (member.kind === "announcements" && (await announcementPublisherId(ctx)) === null) return;

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

/** A vote is a single choice; selecting the current choice removes it. */
export const vote = mutation({
  args: { messageId: v.id("messages"), option: v.number() },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, { messageId, option }) => {
    const profile = await callerAccount(ctx);
    if (profile === null) return { ok: false };
    const message = await ctx.db.get(messageId);
    if (message === null || message.status !== "visible" || message.poll === undefined) return { ok: false };
    const member = await membership(ctx, message.conversationId, profile.clerkId);
    if (member?.status !== "active") return { ok: false };
    if (member.kind === "announcements" && (await announcementPublisherId(ctx)) === null) return { ok: false };
    if (!Number.isInteger(option) || option < 0 || option >= message.poll.options.length) return { ok: false };
    const previous = message.poll.votes.find(vote => vote.clerkId === profile.clerkId);
    if (previous === undefined && message.poll.votes.length >= MAX_POLL_VOTERS) return { ok: false };
    const votes = message.poll.votes.filter(vote => vote.clerkId !== profile.clerkId);
    if (previous?.option !== option) votes.push({ clerkId: profile.clerkId, option });
    await ctx.db.patch(messageId, { poll: { ...message.poll, votes } });
    return { ok: true };
  },
});

/** Edits preserve identity, attachments and replies, and rerun moderation. */
export const edit = mutation({
  args: { messageId: v.id("messages"), body: v.string() },
  returns: sendResultValidator,
  handler: async (ctx, { messageId, body }): Promise<SendResult> => {
    const profile = await callerAccount(ctx);
    if (profile === null) return { ok: false, refusal: "not-a-member" };
    const message = await ctx.db.get(messageId);
    if (message === null || message.authorClerkId !== profile.clerkId || message.status !== "visible") return { ok: false, refusal: "read-only" };
    const member = await membership(ctx, message.conversationId, profile.clerkId);
    if (member?.status !== "active") return { ok: false, refusal: "not-a-member" };
    const now = Date.now();
    // Poll wording stays fixed so earlier votes cannot acquire a new meaning.
    if (message.poll !== undefined || now - message._creationTime > EDIT_WINDOW_MS || (member.kind === "announcements" && await announcementPublisherId(ctx) === null)) return { ok: false, refusal: "read-only" };
    if (member.kind === "global" && await lockedFor(ctx, message.conversationId, profile.clerkId)) return { ok: false, refusal: "read-only" };
    if (body === message.body) return { ok: true };
    const named = await resolveMentions(ctx, profile, member, body);
    if (!named.ok) return { ok: false, refusal: named.refusal };
    const sender = await senderRow(ctx, profile.clerkId);
    const state = senderState(sender);
    const verdict = screen(body, {
      surface: member.kind === "announcements" ? "global" : member.kind === "admins" ? "group" : member.kind,
      conversationId: message.conversationId, now, createdAt: profile.createdAt,
      messagesSent: state.messagesSent, recent: state.recent,
      attachmentKey: message.images?.length ? message.images.map(image => image.attachmentId).join(",") : undefined,
      mentions: named.tokens, lexiconExemptMentions: named.bot ? BOT_MENTION_HANDLES : undefined,
    });
    if (!verdict.allow) return { ok: false, refusal: verdict.refusal };
    await ctx.db.patch(messageId, {
      body: verdict.body, editedAt: now,
      mentions: named.people.length === 0 ? undefined : named.people,
      mentionsEveryone: named.everyone ? true : undefined,
    });
    const oldMentions = await ctx.db.query("mentions").withIndex("byMessage", q => q.eq("messageId", messageId)).take(MAX_MENTIONS + 1);
    for (const mention of oldMentions) await ctx.db.delete(mention._id);
    for (const person of named.people) {
      if (person.clerkId === profile.clerkId || person.clerkId === BOT_ID) continue;
      await ctx.db.insert("mentions", { conversationId: message.conversationId, messageId, target: person.clerkId, authorClerkId: profile.clerkId });
    }
    if (named.everyone) await ctx.db.insert("mentions", { conversationId: message.conversationId, messageId, target: EVERYONE, authorClerkId: profile.clerkId });
    const recent = pushRecent(state.recent, { at: now, conversationId: message.conversationId, hash: verdict.hash, flagged: false });
    // Edits count against rate limits without increasing the account's trust tier.
    if (sender === null) await ctx.db.insert("chatSenders", { clerkId: profile.clerkId, messagesSent: state.messagesSent, recent });
    else await ctx.db.patch(sender._id, { recent });
    return { ok: true };
  },
});

/** Locate a message in the normal day timeline without creating a second feed. */
export const location = query({
  args: { messageId: v.string(), conversationId: v.id("conversations") },
  returns: v.union(v.null(), v.object({ createdAt: v.number() })),
  handler: async (ctx, { messageId, conversationId }) => {
    const profile = await callerAccount(ctx);
    if (profile === null) return null;
    const member = await membership(ctx, conversationId, profile.clerkId);
    if (member?.status !== "active") return null;
    const id = ctx.db.normalizeId("messages", messageId);
    const message = id === null ? null : await ctx.db.get(id);
    if (message?.conversationId !== conversationId || message.status !== "visible") return null;
    return { createdAt: message._creationTime };
  },
});

/** Legacy context query retained for older clients. New clients use location and list. */
export const context = query({
  args: { messageId: v.string() },
  returns: v.union(v.null(), v.object({ conversationId: v.id("conversations"), messages: v.array(chatMessageValidator) })),
  handler: async (ctx, { messageId }) => {
    const profile = await callerAccount(ctx);
    if (profile === null) return null;
    const id = ctx.db.normalizeId("messages", messageId);
    if (id === null) return null;
    const target = await ctx.db.get(id);
    if (target === null || target.status !== "visible") return null;
    const member = await membership(ctx, target.conversationId, profile.clerkId);
    if (member?.status !== "active") return null;
    const before = await ctx.db.query("messages").withIndex("byConversation", q => q.eq("conversationId", target.conversationId).lt("_creationTime", target._creationTime)).order("desc").take(20);
    const after = await ctx.db.query("messages").withIndex("byConversation", q => q.eq("conversationId", target.conversationId).gt("_creationTime", target._creationTime)).take(20);
    return { conversationId: target.conversationId, messages: await presentMessages(ctx, [...before.reverse(), target, ...after], profile) };
  },
});

/**
 * Name the people behind one reaction when its tooltip is opened.
 *
 * Kept out of `list` so a page of messages remains one bounded range read.
 * This query reads at most `MAX_REACTORS` indexed profiles, and repeats the
 * conversation membership check before returning any identity.
 */
export const reactors = query({
  args: { messageId: v.id("messages"), emoji: v.string() },
  returns: v.array(
    v.object({
      clerkId: v.string(),
      handle: v.string(),
      displayName: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, { messageId, emoji }): Promise<ReactionPerson[]> => {
    const profile = await callerAccount(ctx);
    if (profile === null) return [];
    if (!(REACTIONS as readonly string[]).includes(emoji)) return [];

    const message = await ctx.db.get(messageId);
    if (message === null || message.status !== "visible") return [];

    const member = await membership(
      ctx,
      message.conversationId,
      profile.clerkId,
    );
    if (member === null || member.status !== "active") return [];

    const reaction = message.reactions?.find((entry) => entry.emoji === emoji);
    if (reaction === undefined) return [];

    const people: ReactionPerson[] = [];
    for (const clerkId of reaction.by.slice(0, MAX_REACTORS)) {
      const reactor = await accountFor(ctx, clerkId);
      if (reactor === null) continue;
      people.push({
        clerkId,
        handle: reactor.handle,
        displayName: reactor.displayName,
      });
    }
    return people;
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
    const profile = await callerAccount(ctx);
    if (profile === null) return;

    const message = await ctx.db.get(messageId);
    if (message === null) return;
    if (message.authorClerkId !== profile.clerkId) return;
    if (Date.now() - message._creationTime > DELETE_WINDOW_MS) return;

    // The pictures go with it — the row alone would leave their files in
    // storage with nothing pointing at them. See `deleteMessage`.
    await deleteMessage(ctx, message);
  },
});
