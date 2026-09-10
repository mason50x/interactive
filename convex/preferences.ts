import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * The account's copy of the settings in the account menu's sheet.
 *
 * The browser is what reads these — `src/lib/preferences.ts` keeps a mirror in
 * `localStorage` so an accent is on the page before the first paint and the
 * panic key works on a tab that has not finished loading. This module is the
 * durable half: it is what makes those choices survive a new browser, and it
 * is the side that wins when the two disagree.
 *
 * Nothing here trusts the caller for anything but the values. The row is
 * always found by the caller's own identity, never by an id from the client,
 * so there is no row to address but your own.
 */

/** No identity, no preferences. Signed-out visitors run on the defaults. */
async function callerId(ctx: {
  auth: { getUserIdentity: () => Promise<{ subject: string } | null> };
}) {
  const identity = await ctx.auth.getUserIdentity();
  return identity?.subject ?? null;
}

/**
 * `null` for a signed-out caller *and* for a signed-in one who has never
 * changed a setting. Both mean the same thing to the client — use the defaults
 * — and giving them one shape keeps that from being two branches everywhere.
 */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const clerkId = await callerId(ctx);
    if (!clerkId) return null;

    const row = await ctx.db
      .query("preferences")
      .withIndex("byClerkId", (q) => q.eq("clerkId", clerkId))
      .unique();

    if (!row) return null;

    // Deliberately not the raw document. `_id` and `_creationTime` are of no
    // use to the client and would only invite it to send one back.
    return {
      constellation: row.constellation,
      accent: row.accent,
      panicEnabled: row.panicEnabled,
      panicKey: row.panicKey,
      panicUrl: row.panicUrl,
      tabMask: row.tabMask,
    };
  },
});

/**
 * Writes whatever the caller passed and leaves the rest alone.
 *
 * A patch rather than a whole row: the sheet changes one control at a time,
 * and sending the full set on every toggle would let a client that is behind —
 * a second tab, say — undo a change it never saw.
 *
 * The values are checked for shape, not for meaning. `accent` and `tabMask`
 * are ids the client resolves against its own tables and falls back on if they
 * are unknown,
 * and `panicUrl` is required to be `about:blank` or an ordinary http(s) URL:
 * this is the only value in the table that later becomes a navigation, so it
 * is the only one where a bad string would do something rather than be
 * ignored.
 */
export const save = mutation({
  args: {
    constellation: v.optional(v.boolean()),
    accent: v.optional(v.string()),
    panicEnabled: v.optional(v.boolean()),
    panicKey: v.optional(v.string()),
    panicUrl: v.optional(v.string()),
    tabMask: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const clerkId = await callerId(ctx);
    if (!clerkId) return;

    const patch = {
      ...args,
      ...(args.accent === undefined
        ? {}
        : { accent: args.accent.slice(0, 32) }),
      ...(args.panicKey === undefined
        ? {}
        : { panicKey: args.panicKey.slice(0, 64) }),
      ...(args.panicUrl === undefined
        ? {}
        : { panicUrl: safeUrl(args.panicUrl) }),
      ...(args.tabMask === undefined
        ? {}
        : { tabMask: args.tabMask.slice(0, 32) }),
    };

    const existing = await ctx.db
      .query("preferences")
      .withIndex("byClerkId", (q) => q.eq("clerkId", clerkId))
      .unique();

    if (existing) await ctx.db.patch(existing._id, patch);
    else await ctx.db.insert("preferences", { clerkId, ...patch });
  },
});

/**
 * A destination has to be a page, not a scheme. `javascript:` and `data:` are
 * the ones that matter — this string is handed to `location.replace` on the
 * app's own origin, which would run them as us — and an unparseable string is
 * refused for the same reason: whatever it is, it is not somewhere to go.
 *
 * `about:blank` — the default, and the fastest of the destinations, since the
 * browser has it already — is the one exception, matched as a whole string so
 * that the rest of the `about:` family stays out.
 */
function safeUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed === "about:blank") return trimmed;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return parsed.toString().slice(0, 512);
  } catch {
    return "";
  }
}
