import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { isChatAdmin } from "../../config/chat-admin";
import { delivery, status, THREE_DAYS } from "./model";

/**
 * How a nomination is closed and how one is shown.
 *
 * `reject` is the one way a nomination fails, whether by a "no" vote, by
 * expiry, or by an account leaving; it also starts the three-day cooldown that
 * keeps the same person from being nominated again straight away. `present`
 * is the one shape the board draws, with the fields an admin may see and a
 * member may not decided in a single place.
 */

export async function reject(
  ctx: MutationCtx,
  nomination: Doc<"nominations">,
  at: number,
) {
  await ctx.db.patch(nomination._id, { status: "rejected", closedAt: at });
  // Keep the cooldown separate so deleting a suggestion cannot erase it.
  const existing = await ctx.db
    .query("nominationCooldowns")
    .withIndex("by_email", (q) => q.eq("email", nomination.email))
    .first();
  const fields = {
    email: nomination.email,
    nameKey: nomination.nameKey,
    until: at + THREE_DAYS,
  };
  if (existing) await ctx.db.patch(existing._id, fields);
  else await ctx.db.insert("nominationCooldowns", fields);
}

/** One nomination as the board draws it. */
export const row = v.object({
  id: v.id("nominations"),
  name: v.string(),
  email: v.union(v.string(), v.null()),
  status,
  yes: v.number(),
  no: v.number(),
  closesAt: v.number(),
  closedAt: v.union(v.number(), v.null()),
  createdAt: v.number(),
  delivery,
  canDelete: v.boolean(),
  myVote: v.union(v.boolean(), v.null()),
});

export async function present(
  ctx: QueryCtx,
  nomination: Doc<"nominations">,
  clerkId: string,
) {
  const ballot = await ctx.db
    .query("nominationVotes")
    .withIndex("by_nominationId_and_clerkId", (q) =>
      q.eq("nominationId", nomination._id).eq("clerkId", clerkId),
    )
    .unique();
  const isAdmin = isChatAdmin(clerkId);
  return {
    id: nomination._id,
    name: nomination.name,
    email: isAdmin ? nomination.email : null,
    status: nomination.status,
    yes: nomination.yes,
    no: nomination.no,
    closesAt: nomination.closesAt,
    closedAt: nomination.closedAt ?? null,
    createdAt: nomination._creationTime,
    delivery: nomination.delivery,
    canDelete: isAdmin || nomination.authorClerkId === clerkId,
    myVote: ballot?.yes ?? null,
  };
}
