import { syncAccountProfile } from "./chat/account";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";

/** The subset of Clerk's `user.*` webhook payload we care about. */
type ClerkUserJSON = {
  id: string;
  email_addresses?: { id: string; email_address: string }[];
  primary_email_address_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  image_url?: string | null;
  username?: string | null;
  updated_at?: number;
};

type UserFields = {
  email?: string;
  name?: string;
  imageUrl?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  clerkUpdatedAt?: number;
};

/**
 * Single place where a user row is created or updated, so the webhook and the
 * client-side sync can't drift apart.
 */
async function upsertUser(
  ctx: MutationCtx,
  clerkId: string,
  fields: UserFields,
) {
  const existing = await userByClerkId(ctx, clerkId);
  if (existing?.clerkUpdatedAt !== undefined && fields.clerkUpdatedAt !== undefined && fields.clerkUpdatedAt < existing.clerkUpdatedAt) return existing._id;
  const id = existing === null
    ? await ctx.db.insert("users", { clerkId, ...fields })
    : existing._id;
  if (existing !== null) await ctx.db.patch(id, fields);
  if (fields.username) await syncAccountProfile(ctx, clerkId, fields.username, fields.firstName, fields.lastName);
  return id;
}

async function userByClerkId(ctx: QueryCtx, clerkId: string) {
  return await ctx.db
    .query("users")
    .withIndex("byClerkId", (q) => q.eq("clerkId", clerkId))
    .unique();
}

/**
 * Every row for a Clerk id. The delete path uses this rather than
 * `userByClerkId` so a stray duplicate row can't throw and wedge the webhook
 * on retry — a deletion should clear whatever is there.
 */
async function usersByClerkId(ctx: QueryCtx, clerkId: string) {
  return await ctx.db
    .query("users")
    .withIndex("byClerkId", (q) => q.eq("clerkId", clerkId))
    .collect();
}

/** The signed-in user's row, or null when signed out / not synced yet. */
export const current = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return null;
    return await userByClerkId(ctx, identity.subject);
  },
});

/**
 * Called from the client right after sign-in so a row exists even before the
 * Clerk webhook is wired up. Reads everything from the verified JWT — never
 * from client-supplied arguments.
 */
export const store = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Called users.store without authentication");
    }
    const existing = await userByClerkId(ctx, identity.subject);
    if (existing !== null) return existing._id;
    return await upsertUser(ctx, identity.subject, {
      email: identity.email,
      name: identity.name,
      imageUrl: identity.pictureUrl,
    });
  },
});

/** Called by the Clerk webhook on `user.created` / `user.updated`. */
export const upsertFromClerk = internalMutation({
  args: { data: v.any() },
  handler: async (ctx, { data }: { data: ClerkUserJSON }) => {
    const primary = data.email_addresses?.find(
      (address) => address.id === data.primary_email_address_id,
    );
    const name = [data.first_name, data.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();

    await upsertUser(ctx, data.id, {
      email: primary?.email_address ?? data.email_addresses?.[0]?.email_address,
      name: name === "" ? undefined : name,
      imageUrl: data.image_url ?? undefined,
      username: data.username ?? undefined,
      firstName: data.first_name ?? undefined,
      lastName: data.last_name ?? undefined,
      clerkUpdatedAt: data.updated_at,
    });
  },
});

/**
 * Called by the Clerk webhook on `user.deleted`.
 *
 * This is the single cascade point for erasing a user from Convex: when a new
 * table holds user-owned rows, delete them here too, otherwise they outlive
 * the account. Deleting an unknown user is a no-op so Svix retries and replays
 * stay safe to apply twice.
 */
export const deleteFromClerk = internalMutation({
  args: { clerkId: v.string() },
  handler: async (ctx, { clerkId }) => {
    const users = await usersByClerkId(ctx, clerkId);
    for (const user of users) {
      await ctx.db.delete(user._id);
    }

    // The invitations this user spent their allowance on. Their own pending
    // invitations stay live at Clerk — an invitation already in someone's
    // inbox is addressed to that person, not to the account that sent it, and
    // there is no signed-in caller here to revoke them as.
    const invites = await ctx.db
      .query("invites")
      .withIndex("byInviter", (q) => q.eq("inviterClerkId", clerkId))
      .collect();
    for (const invite of invites) {
      await ctx.db.delete(invite._id);
    }

    // Their accent, panic key, and the rest. Nothing else erases this row —
    // it is keyed by the Clerk id rather than owned by the `users` document,
    // so deleting the user above leaves it behind.
    const preferences = await ctx.db
      .query("preferences")
      .withIndex("byClerkId", (q) => q.eq("clerkId", clerkId))
      .collect();
    for (const row of preferences) {
      await ctx.db.delete(row._id);
    }

    // What they opened, and how long for. Both are keyed by the Clerk id
    // rather than owned by the user document, so neither goes with it.
    //
    // `activityDays` is deliberately *not* swept. It is the global board, and
    // a row in it is a count with nobody's name on it — there is no per-account
    // contribution recorded there to subtract, and decrementing it from the
    // rows below would be inventing one. What leaves with the account is
    // everything that says *who*, which is these two tables.
    const views = await ctx.db
      .query("views")
      .withIndex("byUserCount", (q) => q.eq("clerkId", clerkId))
      .collect();
    for (const row of views) {
      await ctx.db.delete(row._id);
    }

    const days = await ctx.db
      .query("userDays")
      .withIndex("byUserDay", (q) => q.eq("clerkId", clerkId))
      .collect();
    for (const row of days) {
      await ctx.db.delete(row._id);
    }

    // Everything they said, everyone they blocked, and the record of both.
    //
    // Scheduled rather than done here. This handler is a webhook with a timeout
    // on it and a Convex mutation has one second; the number of messages an
    // account has sent is bounded by nothing at all. A scheduled mutation runs
    // exactly once, so booking it is not a weaker guarantee than doing it —
    // only a later one. See `purgeAuthor` in `convex/chat/sweep.ts`.
    await ctx.scheduler.runAfter(0, internal.chat.sweep.purgeAuthor, { clerkId });

    await ctx.scheduler.runAfter(0, internal.simulator.cleanup.purgeOwner, { clerkId });

    // Add deletes for any other table keyed by this user above this line.

    return {
      deleted: users.length,
      invites: invites.length,
      preferences: preferences.length,
      views: views.length,
      days: days.length,
    };
  },
});
