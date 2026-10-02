import { DAY, RateLimiter } from "@convex-dev/rate-limiter";
import { ROLES } from "../../config/roles";
import { components } from "../_generated/api";
import { resolveRole } from "../roles";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export { BOT_ID, BOT_HANDLE, BOT_NAME, BOT_AVATAR, botWelcomeBody, presentBotBody } from "../../config/bot";

/** Five immediately, then one use returns every 4.8 hours. */
export const BOT_TAGS_PER_DAY = ROLES.member.botTagsPerDay;

/**
 * A compact rolling allowance rather than a row-per-use log. The component
 * keeps one bounded token-bucket state per account, so there are no expired
 * usage records for this app to sweep.
 */
export const botRateLimiter = new RateLimiter(components.rateLimiter, {
  adminBotTags: {
    kind: "token bucket",
    rate: ROLES.moderator.botTagsPerDay,
    period: DAY,
    capacity: ROLES.moderator.botTagsPerDay,
  },
  botTags: {
    kind: "token bucket",
    rate: BOT_TAGS_PER_DAY,
    period: DAY,
    capacity: BOT_TAGS_PER_DAY,
  },
});

export async function botQuotaName(
  ctx: QueryCtx | MutationCtx,
  clerkId: string,
) {
  return (await resolveRole(ctx, clerkId)) !== "member"
    ? "adminBotTags"
    : "botTags";
}

/**
 * After answering a tag, Flame stays in the room conversation for a while:
 * an untagged message inside the window is shown to the model, which answers
 * only when the message is meant for it. Every answer reopens the window, and
 * the two budgets bound what one tag can cost — follow-ups never spend the
 * asker's tags, so these are the only thing keeping them cheap.
 */
export const FOLLOW_UP_WINDOW_MS = 3 * 60_000;
/** Wait for a burst of messages to settle and consider only the last one. */
export const FOLLOW_UP_SETTLE_MS = 4_000;
export const FOLLOW_UP_MAX_CONSIDERED = 8;
export const FOLLOW_UP_MAX_REPLIES = 4;

export function engagementOf(ctx: QueryCtx, conversationId: Id<"conversations">) {
  return ctx.db
    .query("botEngagements")
    .withIndex("byConversation", (q) => q.eq("conversationId", conversationId))
    .unique();
}

/** Whether an untagged room message should be held up to Flame at all. */
export async function isEngaged(
  ctx: QueryCtx,
  conversationId: Id<"conversations">,
): Promise<boolean> {
  const row = await engagementOf(ctx, conversationId);
  return row !== null && row.until > Date.now() && row.considered < FOLLOW_UP_MAX_CONSIDERED;
}
