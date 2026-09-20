import { DAY, RateLimiter } from "@convex-dev/rate-limiter";
import { ROLES } from "../../config/roles";
import { components } from "../_generated/api";
import { resolveRole } from "../roles";
import type { QueryCtx, MutationCtx } from "../_generated/server";

export { BOT_ID, BOT_HANDLE, BOT_NAME, BOT_AVATAR } from "../../config/bot";

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
