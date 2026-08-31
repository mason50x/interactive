import { v } from "convex/values";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";

/**
 * The terms every account has to accept before it can open anything.
 *
 * This module is the whole gate. The rail's card reads `mine` to decide what
 * to draw, `ActivityCard` reads it to decide whether a tile is a link, and the
 * activity route reads it on the server before it hands out a bundle URL — but
 * only the last of those is load-bearing. A client that lies to itself about
 * having agreed gets a locked page from the server anyway.
 *
 * ## Why a version rather than a boolean
 *
 * The terms are going to be reworded. A boolean would leave everyone who
 * agreed to the old wording marked as having agreed to the new, which is the
 * one thing an agreement cannot do. A row below `AGREEMENT_VERSION` reads as
 * not agreed, so changing the wording and bumping this number is the entire
 * migration: every account is asked again, and the row that recorded the old
 * acceptance is still there with the version it was given.
 *
 * Bump it only when the *terms* change. Fixing a typo in the card is not a new
 * agreement.
 */
/**
 * Two, as of chat.
 *
 * Version one said nothing about talking to other people, because until chat
 * there was nobody to talk to — the terms covered what you did with the
 * activities and that was the whole surface. Chat adds a fifth clause and adds
 * a section to the privacy policy about messages being stored, and neither of
 * those is something anybody can be held to on the strength of having accepted
 * the previous wording.
 *
 * So everybody accepts again. That is what the version is for, and it is the
 * entire migration: a row below this number reads as not agreed.
 */
const AGREEMENT_VERSION = 2;

/**
 * The phrase the person has to type out, normalized the way `accept` compares
 * it. There is a copy of this in `src/lib/agreement.ts`, which is what the
 * card enables its button on; this one is the check that decides.
 *
 * Duplicated rather than imported because a Convex function module bundles
 * from `convex/`, and reaching into `src/` for a string is a coupling that
 * costs more than the string does. If you change one, change the other — the
 * failure mode is a button that enables on a phrase the server then refuses,
 * which the card reports rather than swallows.
 */
const PHRASE = "i understand";

/**
 * Case and spacing are not the point. Somebody typing "I  understand" or
 * "i understand" has done exactly what was asked; refusing them would be
 * testing their shift key rather than their attention. The words themselves,
 * in that order, are the part that has to be right.
 */
function matchesPhrase(typed: string): boolean {
  return typed.trim().replace(/\s+/g, " ").toLowerCase() === PHRASE;
}

async function agreementFor(ctx: QueryCtx, clerkId: string) {
  return await ctx.db
    .query("agreements")
    .withIndex("byClerkId", (q) => q.eq("clerkId", clerkId))
    .unique();
}

async function userFor(ctx: QueryCtx, clerkId: string) {
  return await ctx.db
    .query("users")
    .withIndex("byClerkId", (q) => q.eq("clerkId", clerkId))
    .unique();
}

/**
 * Whether this account has accepted the terms currently in force.
 *
 * Exported because chat needs the same answer and must not get it from the
 * browser. The activity routes can gate in Next, because what they are
 * protecting is a URL that Next hands out; a message is written by a Convex
 * mutation the browser calls directly, so the only place that gate can live is
 * inside the mutation.
 *
 * It matters more than it did. Version two of the terms is the version that
 * says anything about how you speak to other people — enforcing the rules
 * against somebody who never accepted them would be the one part of this system
 * that could not be defended.
 */
export async function hasAccepted(
  ctx: QueryCtx,
  clerkId: string,
): Promise<boolean> {
  const row = await agreementFor(ctx, clerkId);
  return row !== null && row.version >= AGREEMENT_VERSION;
}

/**
 * What the rail's card draws, and what the activity routes gate on.
 *
 * `null` for a signed-out caller. Everyone else gets an answer, including the
 * account that has never agreed — `agreed: false` with no date is a state the
 * card has to render, and collapsing it into `null` would make "signed out"
 * and "has not agreed" the same branch everywhere.
 *
 * The version is deliberately not returned. The client has no use for a number
 * whose only meaning is "compare me to a constant you cannot see"; `agreed` is
 * that comparison, already made, on the side that owns the constant.
 */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return null;

    const row = await agreementFor(ctx, identity.subject);

    return {
      agreed: row !== null && row.version >= AGREEMENT_VERSION,
      /** When the terms currently on file were accepted, if they were. */
      agreedAt: row?.agreedAt ?? null,
      /** True when this account agreed to an older wording and has to again. */
      superseded: row !== null && row.version < AGREEMENT_VERSION,
    };
  },
});

/**
 * Accepts the terms for the calling account.
 *
 * The typed phrase is checked here and not only in the card. The card's copy
 * of it enables a button; this one is the reason a POST from somewhere else
 * cannot agree on someone's behalf without at least saying the words.
 *
 * Idempotent by version: agreeing twice patches the same row to the same
 * version with a fresh timestamp rather than accumulating acceptances. The row
 * is a statement of what this account has agreed to, not a log of the clicks
 * that got it there.
 */
export const accept = mutation({
  args: { typed: v.string() },
  handler: async (ctx, { typed }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return { ok: false as const, reason: "signed-out" };

    if (!matchesPhrase(typed)) {
      return { ok: false as const, reason: "phrase" };
    }

    const clerkId = identity.subject;
    const agreedAt = Date.now();

    const existing = await agreementFor(ctx, clerkId);
    if (existing) {
      await ctx.db.patch(existing._id, {
        version: AGREEMENT_VERSION,
        agreedAt,
      });
    } else {
      await ctx.db.insert("agreements", {
        clerkId,
        version: AGREEMENT_VERSION,
        agreedAt,
      });
    }

    await mirrorOntoUser(ctx, clerkId, agreedAt);

    return { ok: true as const };
  },
});

/**
 * The same acceptance, written onto the user row.
 *
 * Nothing gates on these two fields — see the note in `convex/schema.ts`. They
 * are there so that looking up an account answers "has this person agreed, and
 * when" without a second lookup, which is the question every support thread
 * about a takedown starts with.
 *
 * A missing user row is inserted rather than skipped. `users.store` runs on
 * sign-in and the Clerk webhook runs on sign-up, so by the time anyone can
 * reach the card there is normally a row here already — but if there is not,
 * dropping the fact on the floor is worse than a row carrying nothing but an
 * id and an acceptance. Both writers upsert by `clerkId`, so the name and
 * email land on this same row the moment either of them next runs.
 */
async function mirrorOntoUser(
  ctx: MutationCtx,
  clerkId: string,
  agreedAt: number,
) {
  const fields = { agreementVersion: AGREEMENT_VERSION, agreedAt };
  const user = await userFor(ctx, clerkId);

  if (user) await ctx.db.patch(user._id, fields);
  else await ctx.db.insert("users", { clerkId, ...fields });
}
