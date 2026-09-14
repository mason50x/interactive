import { v } from "convex/values";

/**
 * The validators the chat tables and the chat functions share.
 *
 * Each of these unions was written out in `convex/schema.ts` and again in the
 * mutation that accepts the same value as an argument. Two copies of a union
 * drift: a literal added to the table and not to the argument is a value the
 * schema allows and no client can ever send. Declared once here, both sides
 * read the same list. The doc types the chat modules export keep their own
 * TypeScript unions, so they are unchanged for the browser.
 */

/** What kind of room a conversation is. */
export const conversationKind = v.union(
  v.literal("global"),
  v.literal("dm"),
  v.literal("group"),
);

/** Groups only. `request` is the one that needs an owner to approve. */
export const joinPolicy = v.union(
  v.literal("invite"),
  v.literal("request"),
  v.literal("open"),
);

export const memberRole = v.union(
  v.literal("owner"),
  v.literal("admin"),
  v.literal("member"),
);

export const memberStatus = v.union(
  v.literal("active"),
  v.literal("invited"),
  v.literal("requested"),
  v.literal("banned"),
  v.literal("left"),
);

export const messageStatus = v.union(v.literal("visible"), v.literal("hidden"));

/** Why a message or a person was reported. */
export const reportReason = v.union(
  v.literal("abuse"),
  v.literal("harassment"),
  v.literal("sexual"),
  v.literal("self-harm"),
  v.literal("spam"),
  v.literal("contact"),
  v.literal("other"),
);

/** What an uploaded picture is for. Avatars are refused today; see `uploadUrl`. */
export const attachmentPurpose = v.union(
  v.literal("message"),
  v.literal("avatar"),
);

export const attachmentStatus = v.union(
  v.literal("checking"),
  v.literal("ready"),
  v.literal("sent"),
  v.literal("avatar"),
);

/**
 * One entry of a sender's recent ring — see `chatSenders` in the schema and
 * `RecentSend` in `convex/moderation/rules.ts`, which is the same shape as a
 * type.
 */
export const recentSend = v.object({
  at: v.number(),
  conversationId: v.string(),
  hash: v.string(),
  flagged: v.boolean(),
});
