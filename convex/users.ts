import { v } from "convex/values";
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
};

type UserFields = {
  email?: string;
  name?: string;
  imageUrl?: string;
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
  if (existing === null) {
    return await ctx.db.insert("users", { clerkId, ...fields });
  }
  await ctx.db.patch(existing._id, fields);
  return existing._id;
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

    // Add deletes for any other table keyed by this user above this line.

    return { deleted: users.length };
  },
});
