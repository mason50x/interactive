import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import catalogue from "../src/lib/activities.catalogue.json";

const slugs = new Set(catalogue.map(game => game.slug));
const DAY = 86_400_000;
const COOLDOWN = 60_000;

/** One atomic update per opening; repeated mounts/reloads within a minute coalesce. */
export const record = mutation({
  args: { slug: v.string() },
  returns: v.null(),
  handler: async (ctx, { slug }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Sign in to record a game view.");
    if (!slugs.has(slug)) throw new ConvexError("Unknown game.");
    const now = Date.now();
    const personal = await ctx.db.query("personalGameViews")
      .withIndex("by_clerkId_and_slug", q => q.eq("clerkId", identity.subject).eq("slug", slug)).unique();
    if (personal && now - personal.lastOpenedAt < COOLDOWN) return null;
    if (personal) await ctx.db.patch(personal._id, { views: personal.views + 1, lastOpenedAt: now });
    else await ctx.db.insert("personalGameViews", { clerkId: identity.subject, slug, views: 1, lastOpenedAt: now });
    const global = await ctx.db.query("globalGameViews").withIndex("by_slug", q => q.eq("slug", slug)).unique();
    const day = Math.floor(now / DAY);
    const days = (global?.days ?? []).filter(bucket => bucket.day > day - 7);
    const today = days.find(bucket => bucket.day === day);
    if (today) today.views++;
    else days.push({ day, views: 1 });
    if (global) await ctx.db.patch(global._id, { views: global.views + 1, days });
    else await ctx.db.insert("globalGameViews", { slug, views: 1, days });
    return null;
  },
});

export const recent = query({
  args: {},
  returns: v.array(v.object({ slug: v.string(), views: v.number(), lastOpenedAt: v.number() })),
  handler: async ctx => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const rows = await ctx.db.query("personalGameViews")
      .withIndex("by_clerkId_and_lastOpenedAt", q => q.eq("clerkId", identity.subject))
      .order("desc").take(catalogue.length);
    return rows.filter(row => slugs.has(row.slug)).slice(0, 10)
      .map(({ slug, views, lastOpenedAt }) => ({ slug, views, lastOpenedAt }));
  },
});

export const popularity = query({
  // The client changes this at UTC midnight so idle subscriptions also age out.
  args: { day: v.number() },
  returns: v.array(v.object({ slug: v.string(), views: v.number(), weeklyViews: v.number() })),
  handler: async (ctx, { day }) => {
    if (!await ctx.auth.getUserIdentity()) return [];
    const today = Math.floor(Date.now() / DAY);
    if (!Number.isInteger(day) || Math.abs(day - today) > 1) return [];
    // Storage and reads are bounded by the catalogue, never by the event count.
    const rows = await ctx.db.query("globalGameViews").withIndex("by_slug").take(catalogue.length);
    return rows.filter(row => slugs.has(row.slug)).map(row => ({
      slug: row.slug, views: row.views,
      weeklyViews: row.days.reduce((total, bucket) => total + (bucket.day > today - 7 && bucket.day <= today ? bucket.views : 0), 0),
    })).sort((a, b) => b.weeklyViews - a.weeklyViews || b.views - a.views || a.slug.localeCompare(b.slug));
  },
});
