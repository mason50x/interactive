import { ConvexError, v } from "convex/values";

import { mutation, query } from "./functions";
import { requireCeo } from "./roles";

/**
 * Remote sound: a CEO presses a button on a row of the Admin user directory
 * and that account's open tabs play a sound. For now the only sound is a
 * beep.
 *
 * ## CEO-gated
 *
 * `play` is the only write and it goes through `requireCeo`, the same gate as
 * every other CEO power on the directory (`adminQuotas.setRole`,
 * `restrictions.set`). Hiding the column from a Head Moderator is a courtesy;
 * the mutation refusing them is the rule. A CEO may target any account,
 * including their own, which is how the feature is tried out without a second
 * person.
 *
 * ## One row per target
 *
 * A send patches the target's row rather than inserting one, so the table
 * holds at most one row per account and nothing has to sweep it. The target's
 * subscription (`mine`) wakes because `sentAt` changed. Two devices signed in
 * as the same account both hear it: nothing acknowledges a ping, since an
 * acknowledgement from one tab would silence the others.
 */

const SOUNDS = v.literal("beep");

export const play = mutation({
  args: { clerkId: v.string(), sound: v.optional(SOUNDS) },
  returns: v.null(),
  handler: async (ctx, { clerkId, sound }) => {
    const caller = await requireCeo(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("byClerkId", (q) => q.eq("clerkId", clerkId))
      .unique();
    if (!user) throw new ConvexError("User not found.");
    const data = {
      clerkId,
      sound: sound ?? ("beep" as const),
      sentBy: caller,
      sentAt: Date.now(),
    };
    const existing = await ctx.db
      .query("soundPings")
      .withIndex("byClerkId", (q) => q.eq("clerkId", clerkId))
      .unique();
    if (existing) await ctx.db.patch(existing._id, data);
    else await ctx.db.insert("soundPings", data);
    return null;
  },
});

/**
 * The caller's latest ping, or `null` if nobody has ever pinged them.
 *
 * `ageMs` is measured on the server so the client never compares its own
 * clock against `sentAt`: the query re-runs whenever the row changes, which is
 * exactly when the age matters. The client plays a ping it sees arrive, and
 * plays the one it finds on subscribing only if it is still fresh
 * (`REMOTE_SOUND_FRESH_MS` in `src/lib/remote-sound.ts`).
 */
export const mine = query({
  args: {},
  returns: v.union(
    v.object({ sound: SOUNDS, sentAt: v.number(), ageMs: v.number() }),
    v.null(),
  ),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const row = await ctx.db
      .query("soundPings")
      .withIndex("byClerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!row) return null;
    return {
      sound: row.sound,
      sentAt: row.sentAt,
      ageMs: Math.max(0, Date.now() - row.sentAt),
    };
  },
});
