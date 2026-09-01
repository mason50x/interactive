import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { RECENT_RING } from "../moderation/limits";
import type { RecentSend } from "../moderation/rules";
import { activeStanding, expiryFor, muteUntil } from "../moderation/standing";
import type { StrikeSpec } from "../moderation/verdict";

/**
 * The pieces every chat module needs, so none of them keeps its own copy.
 *
 * The same argument as `convex/days.ts`: five modules were about to grow their
 * own way of finding the caller, their own idea of what a pair of user ids
 * sorts to, and their own version of what happens after a strike. Three copies
 * of the last one is how a system ends up muting people it did not mean to.
 */

/** The caller's Clerk id, or `null` when signed out. */
export async function callerId(ctx: QueryCtx): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity();
  return identity?.subject ?? null;
}

export async function profileFor(
  ctx: QueryCtx,
  clerkId: string,
): Promise<Doc<"chatProfiles"> | null> {
  return await ctx.db
    .query("chatProfiles")
    .withIndex("byClerkId", (q) => q.eq("clerkId", clerkId))
    .unique();
}

/**
 * The caller's profile, or `null` if they are signed out or have never claimed
 * a handle. Both cases read the same to every caller: no handle, no chat.
 */
export async function callerProfile(
  ctx: QueryCtx,
): Promise<Doc<"chatProfiles"> | null> {
  const clerkId = await callerId(ctx);
  if (clerkId === null) return null;
  return await profileFor(ctx, clerkId);
}

/**
 * The sender state for an account, and the seed for the row that holds it.
 *
 * `messagesSent` and `recent` used to live on the profile, and moved off it
 * because they are written on every send while everything else on a profile is
 * written almost never — see `chatSenders` in `convex/schema.ts` for what that
 * was costing every query that joins a profile to get a handle.
 *
 * `senderState` is the read half, and it is what makes the move need no
 * backfill: an account with no row yet falls back to the two fields still
 * sitting on its profile, which is exactly where its totals were left. The
 * first send writes the row and the profile's copies are never read again.
 */
export type SenderState = { messagesSent: number; recent: RecentSend[] };

export async function senderRow(
  ctx: QueryCtx,
  clerkId: string,
): Promise<Doc<"chatSenders"> | null> {
  return await ctx.db
    .query("chatSenders")
    .withIndex("byClerkId", (q) => q.eq("clerkId", clerkId))
    .unique();
}

export function senderState(
  row: Doc<"chatSenders"> | null,
  profile: Doc<"chatProfiles">,
): SenderState {
  if (row !== null) return { messagesSent: row.messagesSent, recent: row.recent };
  return {
    messagesSent: profile.messagesSent ?? 0,
    recent: profile.recent ?? [],
  };
}

/**
 * Drop the sender row, if there is one.
 *
 * Called wherever a profile is deleted or emptied. The two are one identity and
 * they end together: a ring left behind is a rate limit applied to whoever
 * claims the handle next, and a surviving `messagesSent` is the trust tier of an
 * account that no longer exists.
 */
export async function clearSender(
  ctx: MutationCtx,
  clerkId: string,
): Promise<void> {
  const row = await senderRow(ctx, clerkId);
  if (row !== null) await ctx.db.delete(row._id);
}

/**
 * Unexpired strike weight.
 *
 * The `> now` bound is applied here rather than trusted to the nightly sweep,
 * because the sweep runs once a day and somebody whose mute expired at four in
 * the morning should not be waiting on a cron job to find out.
 */
export async function standingFor(
  ctx: QueryCtx,
  clerkId: string,
  now: number,
): Promise<number> {
  const rows = await ctx.db
    .query("strikes")
    .withIndex("byUser", (q) => q.eq("clerkId", clerkId).gt("expiresAt", now))
    .collect();
  return activeStanding(rows, now);
}

/**
 * What the surviving ledger already carries, for a profile about to be made.
 *
 * This is the one thing standing between `chat.erase.eraseMine` and a mute you
 * can walk out of. Erasing your chat deletes the profile, and the mute is a
 * field *on* the profile — so without this, claiming a new handle a second
 * later would hand back a clean composer to somebody the system had just
 * stopped. The strikes are deliberately not deleted by that path, and this is
 * what makes keeping them mean anything.
 *
 * The mute is measured from the strike rather than from now. A mute that has
 * already been running for fifty minutes of its hour has ten minutes left, and
 * re-deriving it as `now + duration` would restart it — which would turn this
 * from a guard into a punishment for claiming a handle.
 *
 * A ban cannot normally be reached from here: `applyStrike` writes `bannedAt`
 * the moment one is earned, and a banned profile is kept rather than deleted
 * precisely so the ban survives. It is handled anyway, because "cannot be
 * reached" is a claim about today's callers.
 */
export async function carriedConsequence(
  ctx: QueryCtx,
  clerkId: string,
  now: number,
): Promise<{
  mutedUntil?: number;
  mutedRule?: string;
  bannedAt?: number;
  banRule?: string;
}> {
  const rows = await ctx.db
    .query("strikes")
    .withIndex("byUser", (q) => q.eq("clerkId", clerkId).gt("expiresAt", now))
    .collect();
  if (rows.length === 0) return {};

  // The rule shown is the one from the most recent strike, which is the same
  // one `applyStrike` would have written had this standing been reached there.
  const newest = rows.reduce((latest, row) => (row.at > latest.at ? row : latest));
  const until = muteUntil(activeStanding(rows, now), now);

  if (until === null) return { bannedAt: newest.at, banRule: newest.rule };
  if (until === undefined) return {};

  const ends = newest.at + (until - now);
  return ends > now ? { mutedUntil: ends, mutedRule: newest.rule } : {};
}

/**
 * Write a strike and apply whatever it now adds up to.
 *
 * The single place standing turns into a consequence. Every refusal that costs
 * something goes through here, so there is exactly one implementation of the
 * ladder and exactly one place a ban can be issued from.
 */
export async function applyStrike(
  ctx: MutationCtx,
  profile: Doc<"chatProfiles">,
  spec: StrikeSpec,
  source: "filter" | "reports" | "rate",
  conversationId?: Id<"conversations">,
): Promise<void> {
  const now = Date.now();

  await ctx.db.insert("strikes", {
    clerkId: profile.clerkId,
    at: now,
    weight: spec.weight,
    rule: spec.rule,
    source,
    conversationId,
    excerpt: spec.excerpt,
    expiresAt: expiryFor(now),
  });

  // The short list of rules that do not wait for a total. See `banOnSight` in
  // `convex/moderation/lexicon.ts` for which they are and why.
  if (spec.banOnSight) {
    await ctx.db.patch(profile._id, { bannedAt: now, banRule: spec.rule });
    return;
  }

  const standing = await standingFor(ctx, profile.clerkId, now);
  const until = muteUntil(standing, now);

  if (until === null) {
    // A ban is the one thing a pile of reports may never cause. The weight of
    // report-sourced strikes is already capped below the ban rung, but a
    // reported account that was also close to it on its own would otherwise be
    // pushed over by the crowd rather than by anything it said. So a report
    // that lands on the ban rung is served the heaviest mute instead, and only
    // the filter — which read the actual message — can end an account.
    if (source === "reports") {
      await ctx.db.patch(profile._id, {
        mutedUntil: now + LONGEST_MUTE_MS,
        mutedRule: spec.rule,
      });
      return;
    }
    await ctx.db.patch(profile._id, { bannedAt: now, banRule: spec.rule });
    return;
  }
  if (until !== undefined) {
    await ctx.db.patch(profile._id, { mutedUntil: until, mutedRule: spec.rule });
  }
}

/** The heaviest rung that is not a ban, which is where reports top out. */
const LONGEST_MUTE_MS = 24 * 60 * 60 * 1000;

/**
 * Push one send onto the ring, dropping the oldest.
 *
 * Twenty entries, oldest first out. Every cross-message rule in
 * `convex/moderation/rules.ts` reads this array and none of them looks further
 * back than ten minutes, so twenty is generous even for somebody sending as
 * fast as the rate limit allows.
 */
export function pushRecent(
  recent: RecentSend[],
  send: RecentSend,
): RecentSend[] {
  const next = [...recent, send];
  return next.length <= RECENT_RING ? next : next.slice(next.length - RECENT_RING);
}

/** The two ids in a stable order, which is what makes a pair one row. */
export function pairOf(a: string, b: string): { userA: string; userB: string } {
  return a < b ? { userA: a, userB: b } : { userA: b, userB: a };
}

export function dmKeyFor(a: string, b: string): string {
  const { userA, userB } = pairOf(a, b);
  return `${userA}|${userB}`;
}

export async function membership(
  ctx: QueryCtx,
  conversationId: Id<"conversations">,
  clerkId: string,
): Promise<Doc<"conversationMembers"> | null> {
  return await ctx.db
    .query("conversationMembers")
    .withIndex("byConversationUser", (q) =>
      q.eq("conversationId", conversationId).eq("clerkId", clerkId),
    )
    .unique();
}

export async function friendship(
  ctx: QueryCtx,
  a: string,
  b: string,
): Promise<Doc<"friendships"> | null> {
  const { userA, userB } = pairOf(a, b);
  return await ctx.db
    .query("friendships")
    .withIndex("byPair", (q) => q.eq("userA", userA).eq("userB", userB))
    .unique();
}

/** Whether `blocker` has blocked `blocked`. One direction only. */
export async function hasBlocked(
  ctx: QueryCtx,
  blocker: string,
  blocked: string,
): Promise<boolean> {
  const row = await ctx.db
    .query("blocks")
    .withIndex("byBlocker", (q) =>
      q.eq("blocker", blocker).eq("blocked", blocked),
    )
    .unique();
  return row !== null;
}

/** Either direction. A block stops the conversation both ways. */
export async function blockedEitherWay(
  ctx: QueryCtx,
  a: string,
  b: string,
): Promise<boolean> {
  return (await hasBlocked(ctx, a, b)) || (await hasBlocked(ctx, b, a));
}

/** Everyone the caller has blocked, for filtering a thread in one read. */
export async function blockedBy(
  ctx: QueryCtx,
  clerkId: string,
): Promise<Set<string>> {
  const rows = await ctx.db
    .query("blocks")
    .withIndex("byBlocker", (q) => q.eq("blocker", clerkId))
    .collect();
  return new Set(rows.map((row) => row.blocked));
}

/**
 * The one global room, created if it is not there yet.
 *
 * Lazily rather than seeded, because a seed is a migration and this is a row
 * that either exists or is one insert away from existing. The `byKind` index
 * makes finding it a single lookup, which is why there is no table holding its
 * id.
 */
export async function ensureGlobalRoom(
  ctx: MutationCtx,
  clerkId: string,
): Promise<Id<"conversations">> {
  const existing = await ctx.db
    .query("conversations")
    .withIndex("byKind", (q) => q.eq("kind", "global"))
    .first();
  if (existing !== null) return existing._id;

  return await ctx.db.insert("conversations", {
    kind: "global",
    createdBy: clerkId,
    createdAt: Date.now(),
  });
}

/** Idempotent: joining the global room twice is joining it once. */
export async function ensureGlobalMembership(
  ctx: MutationCtx,
  clerkId: string,
): Promise<Id<"conversations">> {
  const conversationId = await ensureGlobalRoom(ctx, clerkId);
  const existing = await membership(ctx, conversationId, clerkId);
  if (existing !== null) {
    if (existing.status !== "active") {
      await ctx.db.patch(existing._id, { status: "active" });
    }
    return conversationId;
  }

  await ctx.db.insert("conversationMembers", {
    conversationId,
    clerkId,
    kind: "global",
    role: "member",
    status: "active",
    joinedAt: Date.now(),
    lastReadAt: 0,
  });
  return conversationId;
}

/**
 * The direct message thread for a pair, created if it is not there yet.
 *
 * Idempotent on `dmKey`, which is what lets more than one caller reach for it:
 * `openDm` when somebody presses the button, and `chat/friends.ts` the moment a
 * request is accepted. Two people arriving at the same instant land on the same
 * row rather than on two half-built conversations, because the key is derived
 * from the pair rather than from who asked first.
 *
 * It decides nothing about whether the pair may talk. Every caller settles that
 * first — see `openDm` for the full set of bars.
 */
export async function ensureDm(
  ctx: MutationCtx,
  clerkId: string,
  peerClerkId: string,
): Promise<Id<"conversations">> {
  const dmKey = dmKeyFor(clerkId, peerClerkId);
  const now = Date.now();

  const existing = await ctx.db
    .query("conversations")
    .withIndex("byDmKey", (q) => q.eq("dmKey", dmKey))
    .unique();

  const conversationId =
    existing?._id ??
    (await ctx.db.insert("conversations", {
      kind: "dm",
      dmKey,
      createdBy: clerkId,
      createdAt: now,
      lastMessageAt: now,
    }));

  // Either side may have left; opening it again puts them back.
  for (const [who, other] of [
    [clerkId, peerClerkId],
    [peerClerkId, clerkId],
  ]) {
    const member = await membership(ctx, conversationId, who);
    if (member === null) {
      await ctx.db.insert("conversationMembers", {
        conversationId,
        clerkId: who,
        kind: "dm",
        role: "member",
        status: "active",
        joinedAt: now,
        lastReadAt: 0,
        dmPeer: other,
      });
    } else if (member.status !== "active") {
      await ctx.db.patch(member._id, { status: "active" });
    }
  }

  return conversationId;
}
