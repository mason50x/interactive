import { MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { ConvexError, v } from "convex/values";

import { components } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./functions";
import { requireCeo } from "./roles";

/**
 * Invite codes: anyone can make an account, but the app stays covered until
 * the account redeems a code a CEO made in the admin console.
 *
 * Codes are six digits, so guessing is held off by the attempt limit rather
 * than by the size of the space: five tries, then one more every three
 * minutes, per account.
 */
const limiter = new RateLimiter(components.rateLimiter, {
  inviteAttempts: {
    kind: "token bucket",
    rate: 1,
    period: 3 * MINUTE,
    capacity: 5,
  },
});

const CODE = /^\d{6}$/;

type Status = "active" | "disabled" | "expired" | "used_up";

function statusOf(
  code: Pick<Doc<"inviteCodes">, "disabled" | "expiresAt" | "maxUses" | "uses">,
  now: number,
): Status {
  if (code.disabled) return "disabled";
  if (code.expiresAt !== undefined && code.expiresAt <= now) return "expired";
  if (code.maxUses !== undefined && code.uses >= code.maxUses) return "used_up";
  return "active";
}

/**
 * Redeems a code for the signed-in account.
 *
 * Every refusal is a returned result, never a throw: a throw would roll back
 * the attempt the limiter just counted, and the limit would count nothing.
 */
export const redeem = mutation({
  args: { code: v.string() },
  returns: v.union(
    v.object({ ok: v.literal(true) }),
    v.object({ ok: v.literal(false), message: v.string() }),
  ),
  handler: async (ctx, { code }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Sign in to use an invite code.");
    const user = await ctx.db
      .query("users")
      .withIndex("byClerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) throw new ConvexError("Your account is still being created.");
    if (user.invited !== false) return { ok: true as const };

    const attempt = await limiter.limit(ctx, "inviteAttempts", {
      key: identity.subject,
    });
    if (!attempt.ok) {
      const minutes = Math.max(1, Math.ceil(attempt.retryAfter / MINUTE));
      return {
        ok: false as const,
        message: `Too many tries. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      };
    }

    const invite = CODE.test(code)
      ? await ctx.db
          .query("inviteCodes")
          .withIndex("byCode", (q) => q.eq("code", code))
          .unique()
      : null;
    // One answer for missing, disabled, expired, and used up, so the field
    // tells a guesser nothing about which codes exist.
    if (!invite || statusOf(invite, Date.now()) !== "active") {
      return { ok: false as const, message: "That code doesn't work." };
    }

    await ctx.db.patch(invite._id, { uses: invite.uses + 1 });
    await ctx.db.patch(user._id, { invited: true, inviteCodeId: invite._id });
    return { ok: true as const };
  },
});

const inviteRow = v.object({
  _id: v.id("inviteCodes"),
  _creationTime: v.number(),
  code: v.string(),
  note: v.optional(v.string()),
  maxUses: v.optional(v.number()),
  uses: v.number(),
  expiresAt: v.optional(v.number()),
  disabled: v.boolean(),
  createdBy: v.string(),
  status: v.union(
    v.literal("active"),
    v.literal("disabled"),
    v.literal("expired"),
    v.literal("used_up"),
  ),
});

/** Newest first. `now` comes from the client so the query stays cacheable. */
export const list = query({
  args: { now: v.number() },
  returns: v.array(inviteRow),
  handler: async (ctx, { now }) => {
    await requireCeo(ctx);
    const codes = await ctx.db.query("inviteCodes").order("desc").take(200);
    return codes.map((code) => ({ ...code, status: statusOf(code, now) }));
  },
});

export const create = mutation({
  args: {
    /** Six digits, or omitted for a random one. */
    code: v.optional(v.string()),
    note: v.optional(v.string()),
    maxUses: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const clerkId = await requireCeo(ctx);
    const note = args.note?.trim().slice(0, 80) || undefined;
    if (
      args.maxUses !== undefined &&
      (!Number.isInteger(args.maxUses) || args.maxUses < 1 || args.maxUses > 100_000)
    ) {
      throw new ConvexError("Uses must be a whole number from 1 to 100,000.");
    }
    if (args.expiresAt !== undefined && args.expiresAt <= Date.now()) {
      throw new ConvexError("The expiry has to be in the future.");
    }

    const taken = async (code: string) =>
      (await ctx.db
        .query("inviteCodes")
        .withIndex("byCode", (q) => q.eq("code", code))
        .unique()) !== null;

    let code = args.code?.trim();
    if (code !== undefined && code !== "") {
      if (!CODE.test(code)) throw new ConvexError("A code is six digits.");
      if (await taken(code)) throw new ConvexError("That code already exists.");
    } else {
      code = undefined;
      for (let tries = 0; tries < 20 && code === undefined; tries++) {
        const candidate = String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
        if (!(await taken(candidate))) code = candidate;
      }
      if (code === undefined) throw new ConvexError("Couldn't find a free code. Try again.");
    }

    await ctx.db.insert("inviteCodes", {
      code,
      note,
      maxUses: args.maxUses,
      uses: 0,
      expiresAt: args.expiresAt,
      disabled: false,
      createdBy: clerkId,
    });
    return code;
  },
});

export const setDisabled = mutation({
  args: { id: v.id("inviteCodes"), disabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { id, disabled }) => {
    await requireCeo(ctx);
    if (!(await ctx.db.get(id))) throw new ConvexError("Code not found.");
    await ctx.db.patch(id, { disabled });
    return null;
  },
});

/** Accounts that redeemed it stay in; only the code stops working. */
export const remove = mutation({
  args: { id: v.id("inviteCodes") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await requireCeo(ctx);
    if (await ctx.db.get(id)) await ctx.db.delete(id);
    return null;
  },
});
