import { ConvexError } from "convex/values";
import type { QueryCtx } from "../_generated/server";
import { isChatAdmin } from "../../config/chat-admin";
import { votingEnabled } from "../features";
import { callerId, userByClerkId } from "../identity";

/**
 * Who may take part in voting, and who may settle it.
 *
 * Voting is a development-only feature, so the first gate is the deployment
 * switch and not the caller. Behind it, a member is any synced account and an
 * admin is a member the deployment names in `CHAT_ADMIN_CLERK_IDS`.
 */

/** The caller's account, if voting is on and they are signed in and synced. */
export async function member(ctx: QueryCtx) {
  if (!votingEnabled()) throw new ConvexError("Voting is not available.");
  const clerkId = await callerId(ctx);
  if (clerkId === null) throw new ConvexError("Sign in to participate.");
  const user = await userByClerkId(ctx, clerkId);
  if (!user)
    throw new ConvexError("Your account is still syncing. Please try again.");
  return user;
}

/** A member the deployment also lists as an admin. */
export async function admin(ctx: QueryCtx) {
  const user = await member(ctx);
  if (!isChatAdmin(user.clerkId))
    throw new ConvexError("Admin access required.");
  return user;
}
