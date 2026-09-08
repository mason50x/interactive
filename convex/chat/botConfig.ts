import { DAY, RateLimiter } from "@convex-dev/rate-limiter";
import { isChatAdmin } from "../../config/chat-admin";
import { components } from "../_generated/api";

/** A synthetic id. No Clerk account or chat profile may use the reserved handle. */
export const BOT_ID = "bot";
export const BOT_HANDLE = "bot";
export const BOT_NAME = "Bot";

/** Five immediately, then one use returns every 4.8 hours. */
export const BOT_TAGS_PER_DAY = 5;

/**
 * A compact rolling allowance rather than a row-per-use log. The component
 * keeps one bounded token-bucket state per account, so there are no expired
 * usage records for this app to sweep.
 */
export const botRateLimiter = new RateLimiter(components.rateLimiter, {
  adminBotTags: {
    kind: "token bucket",
    rate: 50,
    period: DAY,
    capacity: 50,
  },
  botTags: {
    kind: "token bucket",
    rate: BOT_TAGS_PER_DAY,
    period: DAY,
    capacity: BOT_TAGS_PER_DAY,
  },
});

export function botQuotaName(clerkId: string) {
  return isChatAdmin(clerkId) ? "adminBotTags" : "botTags";
}
