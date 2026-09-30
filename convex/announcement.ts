import { ConvexError, v } from "convex/values";

import { internalQuery, query as rawQuery } from "./_generated/server";
import { mutation, query } from "./functions";
import { requireAnnouncementManager } from "./roles";
import { lockedOut, managesAnnouncement } from "./announcementLock";
import { announcementRow, type ReadCtx } from "./announcementState";

/**
 * The site-wide announcement: one notice, in the app's own design, that is
 * either live for everyone or off. There is no per-account version of it.
 *
 * Two ways to show it. `screen` takes the whole viewport in place of the app,
 * for maintenance and anything else that should stop people using the site
 * while it is up; `banner` is a card over the app that can be dismissed, for
 * news. While a `screen` announcement is live, `functions.ts` refuses every
 * public call from an account that is not an admin, so the
 * screen is the server's and not an overlay a client could delete.
 *
 * Every admin manages it, with the same guards: the heading
 * is required before it can go live, the row records who turned it on and
 * when, and they are exempt from the lockout so nobody can shut themselves out
 * of the page that turns it off.
 */

const display = v.union(v.literal("screen"), v.literal("banner"));
const LIMITS = { heading: 120, message: 2000 } as const;

const live = v.object({
  heading: v.string(),
  message: v.optional(v.string()),
  display,
  updatedAt: v.number(),
  /** Whether the caller can turn it off: the client shows them the app. */
  manages: v.boolean(),
});

function clean(value: string | undefined, field: keyof typeof LIMITS) {
  const text = value?.trim();
  if (!text) return undefined;
  if (text.length > LIMITS[field])
    throw new ConvexError(
      `The ${field} can be at most ${LIMITS[field]} characters.`,
    );
  return text;
}

async function label(ctx: ReadCtx, clerkId: string | undefined) {
  if (!clerkId) return undefined;
  const user = await ctx.db
    .query("users")
    .withIndex("byClerkId", (q) => q.eq("clerkId", clerkId))
    .unique();
  return user?.username ? `@${user.username}` : (user?.name ?? clerkId);
}

/**
 * The live announcement as the caller should see it, or `null`. Built on the
 * raw builder on purpose: every guarded function refuses a locked-out caller,
 * and this is the one that has to answer them.
 */
export const mine = rawQuery({
  args: {},
  returns: v.union(live, v.null()),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const row = await announcementRow(ctx);
    if (!row?.enabled) return null;
    return {
      heading: row.heading,
      message: row.message,
      display: row.display,
      updatedAt: row.updatedAt,
      manages: await managesAnnouncement(ctx, identity.subject),
    };
  },
});

/** For `functions.ts`, whose actions have no database of their own. */
export const isLockedOut = internalQuery({
  args: { clerkId: v.string() },
  returns: v.boolean(),
  handler: (ctx, { clerkId }) => lockedOut(ctx, clerkId),
});

/** Everything the admin console needs, for every admin. */
export const get = query({
  args: {},
  returns: v.object({
    enabled: v.boolean(),
    heading: v.string(),
    message: v.string(),
    display,
    updatedAt: v.optional(v.number()),
    updatedBy: v.optional(v.string()),
    enabledAt: v.optional(v.number()),
    enabledBy: v.optional(v.string()),
  }),
  handler: async (ctx) => {
    await requireAnnouncementManager(ctx);
    const row = await announcementRow(ctx);
    if (!row)
      return { enabled: false, heading: "", message: "", display: "screen" as const };
    return {
      enabled: row.enabled,
      heading: row.heading,
      message: row.message ?? "",
      display: row.display,
      updatedAt: row.updatedAt,
      updatedBy: await label(ctx, row.updatedBy),
      enabledAt: row.enabledAt,
      enabledBy: await label(ctx, row.enabledBy),
    };
  },
});

/**
 * Write the announcement: its content, and optionally whether it is live, in
 * one step, so "save and go live" never shows anyone the old text for a beat.
 * A heading is required while it is live; the empty state is saveable while
 * it stays off.
 */
export const save = mutation({
  args: {
    heading: v.string(),
    message: v.optional(v.string()),
    display,
    /** Omitted keeps whatever it is; a plain save never flips it either way. */
    enabled: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { clerkId } = await requireAnnouncementManager(ctx);
    const heading = clean(args.heading, "heading");
    const message = clean(args.message, "message");
    const existing = await announcementRow(ctx);
    const enabled = args.enabled ?? existing?.enabled ?? false;
    if (enabled && !heading)
      throw new ConvexError("Give the announcement a heading before it goes live.");

    const now = Date.now();
    const turningOn = enabled && !existing?.enabled;
    const fields = {
      enabled,
      heading: heading ?? "",
      message,
      display: args.display,
      updatedAt: now,
      updatedBy: clerkId,
      ...(turningOn ? { enabledAt: now, enabledBy: clerkId } : {}),
    };
    if (existing) await ctx.db.patch(existing._id, fields);
    else await ctx.db.insert("siteAnnouncement", fields);
    return null;
  },
});

/**
 * Take it down, from anywhere: the admin console, or the card a manager sees
 * over the app while a screen announcement is live. Turning it off is the safe
 * direction, so there is no confirmation in front of it and no content to
 * send; the text stays for next time.
 */
export const turnOff = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const { clerkId } = await requireAnnouncementManager(ctx);
    const existing = await announcementRow(ctx);
    if (existing?.enabled)
      await ctx.db.patch(existing._id, {
        enabled: false,
        updatedAt: Date.now(),
        updatedBy: clerkId,
      });
    return null;
  },
});
