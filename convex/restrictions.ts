import { ConvexError, v } from "convex/values";

import {
  internalQuery,
  query as rawQuery,
  type QueryCtx,
} from "./_generated/server";
import { mutation, query } from "./functions";
import { requireCeo, resolveStaffRoles } from "./roles";
import { restrictionRow } from "./restrictionState";

/**
 * Account restrictions: a CEO puts an account behind a full-screen page it
 * cannot close — `banned`, which says only that, or `error`, a plain HTML
 * error page with whatever text the CEO wrote.
 *
 * The screen is the visible half. The other half is `functions.ts`: while a
 * row exists here, every public query, mutation and action refuses the
 * account, so there is nothing behind the overlay to reach even with it gone.
 * CEOs cannot be restricted, which also means nobody can restrict themselves
 * out of the page that lifts it.
 */

const kind = v.union(v.literal("banned"), v.literal("error"));
const screen = v.object({
  kind,
  title: v.optional(v.string()),
  heading: v.optional(v.string()),
  message: v.optional(v.string()),
  footer: v.optional(v.string()),
});

/** Bounds one transaction's reads and writes; well past the school's headcount. */
const MAX_ACCOUNTS = 5000;
const LIMITS = { title: 120, heading: 200, message: 4000, footer: 300 } as const;

function clean(value: string | undefined, field: keyof typeof LIMITS) {
  const text = value?.trim();
  if (!text) return undefined;
  if (text.length > LIMITS[field])
    throw new ConvexError(`The ${field} can be at most ${LIMITS[field]} characters.`);
  return text;
}

/**
 * The caller's screen, or `null`. Built on the raw builder on purpose: every
 * guarded function refuses a restricted caller, and this is the one that has
 * to answer them.
 */
export const mine = rawQuery({
  args: {},
  returns: v.union(screen, v.null()),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const row = await restrictionRow(ctx, identity.subject);
    if (!row) return null;
    if (row.kind === "banned") return { kind: "banned" as const };
    return {
      kind: row.kind,
      title: row.title,
      heading: row.heading,
      message: row.message,
      footer: row.footer,
    };
  },
});

/** For `functions.ts`, whose actions have no database of their own. */
export const isRestricted = internalQuery({
  args: { clerkId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { clerkId }) =>
    (await restrictionRow(ctx, clerkId)) !== null,
});

export const list = query({
  args: {},
  returns: v.array(
    v.object({
      clerkId: v.string(),
      username: v.optional(v.string()),
      name: v.optional(v.string()),
      kind,
      title: v.optional(v.string()),
      heading: v.optional(v.string()),
      message: v.optional(v.string()),
      footer: v.optional(v.string()),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    await requireCeo(ctx);
    const rows = await ctx.db.query("accountRestrictions").order("desc").take(MAX_ACCOUNTS);
    return Promise.all(
      rows.map(async (row) => {
        const user = await ctx.db
          .query("users")
          .withIndex("byClerkId", (q) => q.eq("clerkId", row.clerkId))
          .unique();
        return {
          clerkId: row.clerkId,
          username: user?.username,
          name: user?.name,
          kind: row.kind,
          title: row.title,
          heading: row.heading,
          message: row.message,
          footer: row.footer,
          updatedAt: row.updatedAt,
        };
      }),
    );
  },
});

/** Clerk ids of every CEO, env map and table rows both. */
async function ceoIds(ctx: QueryCtx) {
  return new Set(
    (await resolveStaffRoles(ctx))
      .filter((entry) => entry.role === "ceo")
      .map((entry) => entry.clerkId),
  );
}

/** Every account that can be restricted — everybody but the CEOs. */
export const accounts = query({
  args: {},
  returns: v.array(
    v.object({
      clerkId: v.string(),
      username: v.optional(v.string()),
      name: v.optional(v.string()),
      restricted: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    await requireCeo(ctx);
    const ceos = await ceoIds(ctx);
    const restricted = new Set(
      (await ctx.db.query("accountRestrictions").take(MAX_ACCOUNTS)).map(
        (row) => row.clerkId,
      ),
    );
    const users = await ctx.db.query("users").take(MAX_ACCOUNTS);
    return users
      .filter((user) => !ceos.has(user.clerkId) && user.invited !== false)
      .map((user) => ({
        clerkId: user.clerkId,
        username: user.username,
        name: user.name,
        restricted: restricted.has(user.clerkId),
      }))
      .sort((a, b) =>
        (a.username ?? a.name ?? "").localeCompare(b.username ?? b.name ?? ""),
      );
  },
});

/**
 * Put accounts behind a screen, or change the one they are behind. CEOs,
 * the caller included, are refused rather than skipped, so a selection that
 * somehow holds one fails loudly instead of half-applying.
 */
export const set = mutation({
  args: { clerkIds: v.array(v.string()), screen },
  returns: v.number(),
  handler: async (ctx, { clerkIds, screen }) => {
    const caller = await requireCeo(ctx);
    const ids = [...new Set(clerkIds)];
    if (ids.length === 0) throw new ConvexError("Pick at least one account.");
    if (ids.length > MAX_ACCOUNTS)
      throw new ConvexError(`At most ${MAX_ACCOUNTS} accounts at a time.`);
    const ceos = await ceoIds(ctx);
    if (ids.includes(caller)) throw new ConvexError("You can't restrict your own account.");
    if (ids.some((id) => ceos.has(id)))
      throw new ConvexError("A CEO's account can't be restricted.");

    const fields =
      screen.kind === "banned"
        ? {
            kind: "banned" as const,
            title: undefined,
            heading: undefined,
            message: undefined,
            footer: undefined,
          }
        : {
            kind: "error" as const,
            title: clean(screen.title, "title"),
            heading: clean(screen.heading, "heading"),
            message: clean(screen.message, "message"),
            footer: clean(screen.footer, "footer"),
          };
    if (fields.kind === "error" && !fields.heading)
      throw new ConvexError("An error screen needs a heading.");

    const row = { ...fields, updatedAt: Date.now(), updatedBy: caller };
    for (const clerkId of ids) {
      const user = await ctx.db
        .query("users")
        .withIndex("byClerkId", (q) => q.eq("clerkId", clerkId))
        .unique();
      if (!user) throw new ConvexError("One of those accounts doesn't exist.");
      const existing = await restrictionRow(ctx, clerkId);
      if (existing) await ctx.db.patch(existing._id, row);
      else await ctx.db.insert("accountRestrictions", { clerkId, ...row });
    }
    return ids.length;
  },
});

export const lift = mutation({
  args: { clerkIds: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, { clerkIds }) => {
    await requireCeo(ctx);
    for (const clerkId of new Set(clerkIds.slice(0, MAX_ACCOUNTS))) {
      const existing = await restrictionRow(ctx, clerkId);
      if (existing) await ctx.db.delete(existing._id);
    }
    return null;
  },
});
