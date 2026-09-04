import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { MAX_REPORTS_PER_DAY, REPORTS_TO_HIDE } from "../moderation/limits";
import { mutation, type MutationCtx } from "../_generated/server";
import { BOT_ID } from "./botConfig";
import {
  callerProfile,
  clearMentions,
  membership,
  profileFor,
} from "./shared";

/**
 * Telling the system that something was wrong, when there is no one to tell.
 *
 * A report here is not a message to a moderator, because there are none. Enough
 * distinct reports hide a message, and nothing at all happens below that. A
 * report never changes the author's account or ability to send.
 *
 * There are four, and they stack:
 *
 * One report per person per message is enforced by an index rather than by a
 * check that could race. A daily cap per reporter stops a single account from
 * spending an afternoon filing.
 */

/** How many reports on one message are read when tallying. */
const MAX_TALLY = 50;

export type ReportResult =
  | { ok: true; recorded: boolean }
  | {
      ok: false;
      reason: "no-profile" | "self" | "already" | "too-many" | "unknown";
    };

export const report = mutation({
  args: {
    messageId: v.optional(v.id("messages")),
    targetClerkId: v.string(),
    conversationId: v.optional(v.id("conversations")),
    reason: v.union(
      v.literal("abuse"),
      v.literal("harassment"),
      v.literal("sexual"),
      v.literal("self-harm"),
      v.literal("spam"),
      v.literal("contact"),
      v.literal("other"),
    ),
  },
  handler: async (ctx, args): Promise<ReportResult> => {
    const profile = await callerProfile(ctx);
    if (profile === null) return { ok: false, reason: "no-profile" };
    if (args.targetClerkId === profile.clerkId) return { ok: false, reason: "self" };
    // The old man has no profile. A report against him would sit in `byTarget`
    // as an accusation against an account
    // that does not exist — see `convex/chat/bot.ts`.
    if (args.targetClerkId === BOT_ID) return { ok: false, reason: "unknown" };

    // What the row records about a message report is read off the message, not
    // off the arguments. The ids in `args` have been through a browser, and a
    // report whose `targetClerkId` names somebody who never wrote the message
    // would sit in the `byTarget` index as an accusation against the wrong
    // person; a `conversationId` that names the wrong room would dodge the
    // purge that clears reports when a conversation goes.
    let targetClerkId = args.targetClerkId;
    let conversationId = args.conversationId;

    if (args.messageId !== undefined) {
      const message = await ctx.db.get(args.messageId);
      if (message === null) return { ok: false, reason: "unknown" };
      if (message.authorClerkId === BOT_ID) return { ok: false, reason: "unknown" };

      // Only somebody the message was actually shown to may report it. Without
      // this, any id that leaks out of a room reaches the tally from outside
      // it — and the tally may hide messages.
      const member = await membership(ctx, message.conversationId, profile.clerkId);
      if (member === null || member.status !== "active") {
        return { ok: false, reason: "unknown" };
      }

      targetClerkId = message.authorClerkId;
      conversationId = message.conversationId;
      if (targetClerkId === profile.clerkId) return { ok: false, reason: "self" };
    }

    const target = await profileFor(ctx, targetClerkId);
    if (target === null) return { ok: false, reason: "unknown" };

    const now = Date.now();

    if (args.messageId !== undefined) {
      const already = await ctx.db
        .query("reports")
        .withIndex("byReporterMessage", (q) =>
          q.eq("reporterClerkId", profile.clerkId).eq("messageId", args.messageId),
        )
        .unique();
      if (already !== null) return { ok: false, reason: "already" };
    }

    const today = await ctx.db
      .query("reports")
      .withIndex("byReporter", (q) =>
        q.eq("reporterClerkId", profile.clerkId).gt("createdAt", now - 86_400_000),
      )
      .take(MAX_REPORTS_PER_DAY + 1);
    if (today.length >= MAX_REPORTS_PER_DAY) {
      return { ok: false, reason: "too-many" };
    }

    await ctx.db.insert("reports", {
      reporterClerkId: profile.clerkId,
      messageId: args.messageId,
      targetClerkId,
      conversationId,
      reason: args.reason,
      createdAt: now,
    });

    // A report against an account rather than a message is filed and counted
    // and does nothing on its own. There is no text for the system to have an
    // opinion about, and acting on an unsupported accusation is precisely the
    // thing a report system must not do.
    if (args.messageId === undefined) return { ok: true, recorded: true };

    const acted = await tally(ctx, args.messageId);
    return { ok: true, recorded: acted };
  },
});

/**
 * Whether this message has now been reported enough, and what that costs.
 *
 * Only distinct reporters count. Repeated presses are already rejected before
 * a row is written.
 */
async function tally(
  ctx: MutationCtx,
  messageId: Id<"messages">,
): Promise<boolean> {
  const message = await ctx.db.get(messageId);
  if (message === null || message.status !== "visible") return false;

  const reports = await ctx.db
    .query("reports")
    .withIndex("byMessage", (q) => q.eq("messageId", messageId))
    .take(MAX_TALLY);

  const reporters = new Set(reports.map((row) => row.reporterClerkId));
  if (reporters.size < REPORTS_TO_HIDE) {
    return false;
  }

  await ctx.db.patch(messageId, { status: "hidden" });
  // A message nobody can read any more should not be telling anybody's list
  // that it named them. See `clearMentions`.
  await clearMentions(ctx, messageId);

  return true;
}
