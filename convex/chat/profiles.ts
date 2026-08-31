import { v } from "convex/values";
import { hasAccepted } from "../agreement";
import { handleIsClean } from "../moderation/lexicon";
import {
  AVATAR_HUES,
  GLOBAL_COOLDOWN_MS,
  MAX_HANDLE_CHANGES,
  MAX_INITIALS,
} from "../moderation/limits";
import { prepare } from "../moderation/normalize";
import { mutation, query } from "../_generated/server";
import {
  blockedEitherWay,
  callerId,
  callerProfile,
  ensureGlobalMembership,
  profileFor,
  standingFor,
} from "./shared";

/**
 * Who you are in chat, which is a handle and a record and nothing else.
 *
 * ## The account is not the identity
 *
 * `users` holds a real first name and a real email address, because Clerk
 * collected both at signup. Neither of them appears anywhere in this directory.
 * A thirteen-year-old talking to strangers should be doing it under a name they
 * chose for the purpose, and the way to guarantee that is not to be careful
 * about which fields get returned — it is for the queries that serve chat to
 * have no path to the table those fields are in. They do not.
 *
 * ## Claimed once, changed twice
 *
 * There used to be no rename at all, and it bought two things. `authorHandle`
 * is stored on every message, so a page of messages needs no join and an
 * optimistic send can be built on the client. And somebody who has made
 * themselves unpleasant cannot shed the name people know them by.
 *
 * `renameHandle` gives back the first of those and keeps the second. Old
 * messages are not rewritten — they keep the handle they were sent under, which
 * is both what the denormalisation requires and the honest record — and the
 * allowance is two for the life of the account, counted in `handleChanges` and
 * never reset. Someone can fix a name they typed wrong. Nobody can keep moving.
 *
 * ## The disc is picked, not written
 *
 * `setAvatar` has no limit on it, because a colour and two letters are not a
 * name: nothing points at them, nobody remembers you by them, and there is
 * nothing to escape by changing them. Both are constrained to a fixed wheel and
 * a two-character shape, so what is stored is a choice from a set and never
 * free text — the same rule a group's face already follows.
 */

const MIN_HANDLE = 3;
const MAX_HANDLE = 20;

/**
 * Shape only: lowercase, starts with a letter, no doubled or trailing
 * underscore. Duplicated as a shape check in `src/lib/chat.ts` so the field can
 * complain before a round trip — change one, change the other. The version
 * there is deliberately only the shape; everything below it is server-side.
 */
const SHAPE = /^[a-z][a-z0-9_]{2,19}$/;

/**
 * Names that would let somebody be mistaken for the system.
 *
 * Checked against the folded key rather than the typed handle, so `4dmin` and
 * `а_d_m_i_n` are refused by the same entry that refuses `admin`.
 */
const RESERVED = new Set([
  "admin", "administrator", "mod", "mods", "moderator", "moderators",
  "staff", "team", "system", "official", "support", "help", "helpdesk",
  "root", "owner", "operator", "security", "billing", "noreply",
  "everyone", "here", "all", "channel", "announcement", "announcements",
  "bot", "bots", "null", "undefined", "anonymous", "deleted",
  "interactivelearning", "interactive", "learning",
]);

/**
 * The folded form a handle is unique on.
 *
 * `prepare` is the same pipeline every message goes through, so the fold is the
 * one the rest of the system already agrees with: confusables to ASCII, leet to
 * letters, separators dropped. That is what makes `adm1n`, `а𝖽min` and
 * `a_d_m_i_n` all collide with `admin` instead of sitting next to it.
 */
function keyFor(handle: string): { key: string; clean: boolean } | null {
  const prepared = prepare(handle, MAX_HANDLE);
  if (!prepared.ok) return null;
  return { key: prepared.forms.squashed, clean: handleIsClean(prepared.forms) };
}

/** Why a handle cannot be had. Shared by claiming one and changing one. */
type HandleRefusal = "shape" | "reserved" | "language" | "taken";

/**
 * Everything about a wanted handle that does not depend on who is asking.
 *
 * Pulled out of `claimHandle` when `renameHandle` arrived, because the two
 * checks drifting apart is the failure that matters here: a name refused at
 * signup and allowed at rename is a hole in the reserved list, not a
 * convenience.
 */
async function vet(
  ctx: Parameters<typeof profileFor>[0],
  handle: string,
): Promise<{ ok: true; handle: string; key: string } | { ok: false; reason: HandleRefusal }> {
  const wanted = handle.trim().toLowerCase();
  if (
    wanted.length < MIN_HANDLE ||
    wanted.length > MAX_HANDLE ||
    !SHAPE.test(wanted) ||
    wanted.includes("__") ||
    wanted.endsWith("_")
  ) {
    return { ok: false, reason: "shape" };
  }

  const folded = keyFor(wanted);
  if (folded === null) return { ok: false, reason: "shape" };
  if (RESERVED.has(folded.key)) return { ok: false, reason: "reserved" };
  if (!folded.clean) return { ok: false, reason: "language" };

  const taken = await ctx.db
    .query("chatProfiles")
    .withIndex("byHandleKey", (q) => q.eq("handleKey", folded.key))
    .first();
  if (taken !== null) return { ok: false, reason: "taken" };

  return { ok: true, handle: wanted, key: folded.key };
}

/** Everything the signed-in account is told about itself. */
export type MyProfile = {
  handle: string;
  createdAt: number;
  /**
   * The instant this account may first speak in the global room.
   *
   * Sent as a timestamp rather than as a duration, and always — including long
   * after it has passed — because the client counts down to it against its own
   * clock. A field that went `undefined` once elapsed would only clear when
   * something else made this query re-run, and the one moment it has to be
   * right is the one where nothing else is happening.
   *
   * The length of the wait is not sent, because it does not need to be: it is
   * this minus `createdAt`, which is already here. So the rule stays in
   * `convex/moderation/limits.ts` and the client is handed an instant.
   */
  globalUnlockAt: number;
  dmPolicy: "friends" | "anyone" | "nobody";
  discoverable: boolean;
  /** Renames spent. The allowance itself is `MAX_HANDLE_CHANGES`. */
  handleChanges: number;
  avatarHue?: number;
  avatarInitials?: string;
  standing: number;
  mutedUntil?: number;
  mutedRule?: string;
  bannedAt?: number;
  banRule?: string;
};

/**
 * Everything anybody else is told about you.
 *
 * The disc travels with the handle wherever a profile is read directly, which
 * is every list of people in the app. It does *not* travel onto messages: those
 * carry a denormalised `authorHandle` and nothing else, so a thread draws its
 * discs from the handle the way it always has. See the note at the top.
 */
export type PublicProfile = {
  clerkId: string;
  handle: string;
  avatarHue?: number;
  avatarInitials?: string;
};

export type ClaimResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "shape"
        | "reserved"
        | "language"
        | "taken"
        | "already"
        | "not-agreed";
    };

/**
 * Take a handle, and with it the global room.
 *
 * Both in one transaction because a profile without a room to speak in is a
 * dead end the user has no way out of, and because the global room may not
 * exist yet — the first person to claim a handle is the one who creates it.
 *
 * Throws when signed out rather than returning a refusal: this is a form
 * somebody pressed a button on, and the only way to reach it signed out is a
 * tab that has been open since before a sign-out.
 */
export const claimHandle = mutation({
  args: { handle: v.string() },
  handler: async (ctx, { handle }): Promise<ClaimResult> => {
    const clerkId = await callerId(ctx);
    if (clerkId === null) throw new Error("Not signed in");

    if (!(await hasAccepted(ctx, clerkId))) {
      return { ok: false, reason: "not-agreed" };
    }

    const existing = await profileFor(ctx, clerkId);
    if (existing !== null) return { ok: false, reason: "already" };

    const vetted = await vet(ctx, handle);
    if (!vetted.ok) return { ok: false, reason: vetted.reason };

    await ctx.db.insert("chatProfiles", {
      clerkId,
      handle: vetted.handle,
      handleKey: vetted.key,
      createdAt: Date.now(),
      dmPolicy: "friends",
      discoverable: true,
      messagesSent: 0,
      recent: [],
    });

    await ensureGlobalMembership(ctx, clerkId);
    return { ok: true };
  },
});

/**
 * The caller's own profile, standing included.
 *
 * `null` covers signed out and no-handle-yet, which the client treats the same
 * way — both mean the handle screen, and giving them one shape saves a branch.
 */
export const mine = query({
  args: {},
  handler: async (ctx): Promise<MyProfile | null> => {
    const profile = await callerProfile(ctx);
    if (profile === null) return null;

    const now = Date.now();
    return {
      handle: profile.handle,
      createdAt: profile.createdAt,
      globalUnlockAt: profile.createdAt + GLOBAL_COOLDOWN_MS,
      dmPolicy: profile.dmPolicy,
      discoverable: profile.discoverable,
      handleChanges: profile.handleChanges ?? 0,
      avatarHue: profile.avatarHue,
      avatarInitials: profile.avatarInitials,
      standing: await standingFor(ctx, profile.clerkId, now),
      // A mute that has run out is not a mute. Filtered here rather than left
      // to the sweep so the composer unlocks on the minute it should.
      mutedUntil:
        profile.mutedUntil !== undefined && profile.mutedUntil > now
          ? profile.mutedUntil
          : undefined,
      mutedRule:
        profile.mutedUntil !== undefined && profile.mutedUntil > now
          ? profile.mutedRule
          : undefined,
      bannedAt: profile.bannedAt,
      banRule: profile.banRule,
    };
  },
});

/** One row of the caller's own record. */
export type LedgerEntry = {
  at: number;
  rule: string;
  weight: number;
  excerpt?: string;
  expiresAt: number;
  source: "filter" | "reports" | "rate";
};

/**
 * Everything currently counted against the caller, and why.
 *
 * The most important query in this directory. Enforcement here is automatic and
 * there is nobody to appeal to, which makes this the only thing that separates
 * it from being punished by a machine for reasons you never learn: the rule
 * that fired, what you said, what it cost, and the day it stops counting.
 *
 * Self only. There is no way to read anybody else's.
 */
export const ledger = query({
  args: {},
  handler: async (ctx): Promise<LedgerEntry[]> => {
    const clerkId = await callerId(ctx);
    if (clerkId === null) return [];

    const now = Date.now();
    const rows = await ctx.db
      .query("strikes")
      .withIndex("byUser", (q) => q.eq("clerkId", clerkId).gt("expiresAt", now))
      .collect();

    return rows
      .sort((first, second) => second.at - first.at)
      .map((row) => ({
        at: row.at,
        rule: row.rule,
        weight: row.weight,
        excerpt: row.excerpt,
        expiresAt: row.expiresAt,
        source: row.source,
      }));
  },
});

/**
 * Find somebody by handle.
 *
 * The search index tokenises and prefix-matches the final term, which is
 * exactly a typeahead and nothing more — there is no way to enumerate the table
 * from here, because there is nothing to match against but a handle somebody
 * already has to be most of the way through typing.
 *
 * Filtered afterwards rather than in the index: `discoverable` and the block
 * list are both small reads and the alternative is declaring filter fields for
 * a query that returns at most a dozen rows.
 */
export const search = query({
  args: { term: v.string() },
  handler: async (ctx, { term }): Promise<PublicProfile[]> => {
    const clerkId = await callerId(ctx);
    if (clerkId === null) return [];

    const wanted = term.trim().toLowerCase();
    if (wanted.length < 2) return [];

    const hits = await ctx.db
      .query("chatProfiles")
      .withSearchIndex("searchHandle", (q) => q.search("handle", wanted))
      .take(20);

    const results: PublicProfile[] = [];
    for (const hit of hits) {
      if (hit.clerkId === clerkId) continue;
      if (!hit.discoverable) continue;
      if (hit.bannedAt !== undefined) continue;
      if (await blockedEitherWay(ctx, clerkId, hit.clerkId)) continue;
      results.push({
        clerkId: hit.clerkId,
        handle: hit.handle,
        avatarHue: hit.avatarHue,
        avatarInitials: hit.avatarInitials,
      });
    }
    return results;
  },
});

export type RenameResult =
  | { ok: true; left: number }
  | {
      ok: false;
      reason: HandleRefusal | "limit" | "same" | "no-profile" | "closed";
      left?: number;
    };

/**
 * Change the name people know you by, twice in a lifetime.
 *
 * The allowance is spent on success only: a refused handle costs nothing, or
 * else a typo would be worth as much as a change of mind.
 *
 * `same` is separated from `taken` deliberately. Re-submitting the handle you
 * already have collides with your own row, and telling somebody their own name
 * is taken is the kind of answer that makes an app look broken — so it is
 * checked before the index is, and it costs nothing.
 */
export const renameHandle = mutation({
  args: { handle: v.string() },
  handler: async (ctx, { handle }): Promise<RenameResult> => {
    const profile = await callerProfile(ctx);
    if (profile === null) return { ok: false, reason: "no-profile" };

    // A ban freezes the name with everything else. The whole reason renames
    // are rationed is that a name is what people know an account by, and the
    // account whose conduct ended it is the account with the most to gain
    // from being known by another one.
    if (profile.bannedAt !== undefined) return { ok: false, reason: "closed" };

    const spent = profile.handleChanges ?? 0;
    if (spent >= MAX_HANDLE_CHANGES) {
      return { ok: false, reason: "limit", left: 0 };
    }

    const left = MAX_HANDLE_CHANGES - spent;
    if (handle.trim().toLowerCase() === profile.handle) {
      return { ok: false, reason: "same", left };
    }

    const vetted = await vet(ctx, handle);
    if (!vetted.ok) return { ok: false, reason: vetted.reason, left };

    await ctx.db.patch(profile._id, {
      handle: vetted.handle,
      handleKey: vetted.key,
      handleChanges: spent + 1,
    });

    return { ok: true, left: left - 1 };
  },
});

/**
 * The disc: a colour off the wheel, and up to two letters on it.
 *
 * Either may be cleared by sending nothing for it, which puts that half back to
 * what it was derived as. Nothing here is rate-limited or counted, because
 * there is nothing here to escape by changing.
 */
export const setAvatar = mutation({
  args: {
    hue: v.optional(v.number()),
    initials: v.optional(v.string()),
  },
  handler: async (ctx, { hue, initials }) => {
    const profile = await callerProfile(ctx);
    if (profile === null) return;

    // A value off the wheel is dropped rather than refused: this is a picker,
    // and the only way to send one is to not be using the picker.
    const wheel: readonly number[] = AVATAR_HUES;
    const nextHue = hue !== undefined && wheel.includes(hue) ? hue : undefined;

    const wanted = (initials ?? "").trim();
    const nextInitials =
      wanted.length >= 1 &&
      wanted.length <= MAX_INITIALS &&
      /^[a-z0-9]+$/i.test(wanted)
        ? wanted
        : undefined;

    await ctx.db.patch(profile._id, {
      avatarHue: nextHue,
      avatarInitials: nextInitials,
    });
  },
});

/** Who may open a direct message with you. */
export const setDmPolicy = mutation({
  args: {
    policy: v.union(
      v.literal("friends"),
      v.literal("anyone"),
      v.literal("nobody"),
    ),
  },
  handler: async (ctx, { policy }) => {
    const profile = await callerProfile(ctx);
    if (profile === null) return;
    await ctx.db.patch(profile._id, { dmPolicy: policy });
  },
});

/** Whether handle search returns you at all. */
export const setDiscoverable = mutation({
  args: { discoverable: v.boolean() },
  handler: async (ctx, { discoverable }) => {
    const profile = await callerProfile(ctx);
    if (profile === null) return;
    await ctx.db.patch(profile._id, { discoverable });
  },
});

/**
 * Make sure the caller is in the global room.
 *
 * Called by the provider on mount. Every account that claimed a handle before
 * the room existed, or that was in it and left, lands back in it here — which
 * is cheaper than a migration and correct for accounts that have not signed in
 * since.
 */
export const joinGlobal = mutation({
  args: {},
  handler: async (ctx) => {
    const profile = await callerProfile(ctx);
    if (profile === null) return;
    if (profile.bannedAt !== undefined) return;
    await ensureGlobalMembership(ctx, profile.clerkId);
  },
});
