import { DAY, RateLimiter } from "@convex-dev/rate-limiter";
import { ConvexError, v } from "convex/values";
import { components, internal } from "./_generated/api";
import { action, internalMutation } from "./_generated/server";

const limiter = new RateLimiter(components.rateLimiter, {
  activityRequests: { kind: "fixed window", rate: 2, capacity: 2, period: DAY, start: 0 },
});

export const reserve = internalMutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Sign in to request an activity.");
    const result = await limiter.limit(ctx, "activityRequests", { key: identity.subject });
    if (!result.ok) throw new ConvexError("You've used your two requests today. Try again after midnight UTC.");
    // Schedule in the same transaction as consumption. At most two jobs per day.
    await ctx.scheduler.runAt((Math.floor(Date.now() / DAY) + 1) * DAY,
      internal.activityRequests.prune, { key: identity.subject });
    const user = await ctx.db.query("users").withIndex("byClerkId", q => q.eq("clerkId", identity.subject)).unique();
    return user?.name || identity.name || user?.username || identity.nickname || identity.subject;
  },
});

/** A delayed cleanup must never erase a newer day's allowance. */
export const prune = internalMutation({
  args: { key: v.string() },
  returns: v.null(),
  handler: async (ctx, { key }) => {
    const state = await limiter.getValue(ctx, "activityRequests", { key });
    const today = Math.floor(Date.now() / DAY) * DAY;
    if (state.ts < today) await limiter.reset(ctx, "activityRequests", { key });
    return null;
  },
});

function clean(value: string, label: string, max: number, required = true) {
  const text = value.trim();
  if ((required && !text) || text.length > max) {
    throw new ConvexError(`${label} must be ${required ? "1" : "0"}–${max} characters.`);
  }
  return text;
}

export const submit = action({
  args: { activity: v.string(), url: v.string(), reason: v.string(), details: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Sign in to request an activity.");
    const payload = {
      activity: clean(args.activity, "Activity name", 200),
      url: clean(args.url, "URL", 2000, false),
      reason: clean(args.reason, "Reason", 3000),
      details: clean(args.details, "Additional details", 3000, false),
    };
    if (payload.url) {
      try {
        const url = new URL(payload.url);
        if (!["http:", "https:"].includes(url.protocol)) throw new Error();
      } catch {
        throw new ConvexError("Enter a valid http:// or https:// URL.");
      }
    }
    // Reserve atomically before delivery so simultaneous tabs cannot exceed two.
    // Attempts count even on ambiguous network failures to avoid duplicate delivery.
    const name = await ctx.runMutation(internal.activityRequests.reserve, {});
    try {
      const response = await fetch("https://submit-form.com/rq5T5RXYM", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ name, ...payload }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error("Submission rejected");
    } catch {
      throw new ConvexError("We couldn't confirm delivery. This attempt counts toward today's limit. Please try again later.");
    }
    return null;
  },
});
