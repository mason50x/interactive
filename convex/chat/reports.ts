import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import {
  MAX_REPORTS_PER_DAY,
  MAX_REPORT_STANDING,
  REPORTS_TO_HIDE,
  REPORT_STRIKE_WEIGHT,
  reporterWeight,
} from "../moderation/limits";
import { mutation, type MutationCtx } from "../_generated/server";
import { BOT_ID } from "./bot";
import {
  applyStrike,
  callerProfile,
  clearMentions,
  membership,
  profileFor,
  standingFor,
} from "./shared";

/**
 * Telling the system that something was wrong, when there is no one to tell.
 *
 * A report here is not a message to a moderator, because there are none. It is
 * an input to the same arithmetic as everything else: enough weight from enough
 * distinct people hides the message and puts a strike on whoever wrote it, and
 * nothing at all happens below that. Which makes the interesting part of this
 * file not the reporting but the defences against it, because a report button
 * wired directly to enforcement is a weapon handed to whoever organises fastest.
 *
 * There are four, and they stack:
 *
 * One report per person per message, enforced by an index rather than by a
 * check that could race. A daily cap per reporter, so a single account cannot
 * spend an afternoon filing. A weight that falls to a quarter for anybody
 * carrying strikes and to zero for anybody currently muted — the accounts most
 * motivated to retaliate are exactly the ones that just got struck. And a hard
 * ceiling on how much of anybody's standing can ever come from reports at all,
 * set below the ban rung so that a crowd can cost somebody a day and can never
 * cost them the account.
 *
 * The last one is the important one. Everything else makes brigading expensive;
 * that one makes it survivable.
 */

/** How many reports on one message are read when tallying. */
const MAX_TALLY = 50;

export type ReportResult =
  | { ok: true; recorded: boolean }
  | {
      ok: false;
      reason: "no-profile" | "self" | "already" | "too-many" | "unknown" | "closed";
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
    // A closed account keeps no say in anyone else's standing. Its reports
    // would be weightless anyway only if it also happened to be muted;
    // `reporterWeight` never sees the ban, so the ban has to refuse here.
    if (profile.bannedAt !== undefined) return { ok: false, reason: "closed" };
    if (args.targetClerkId === profile.clerkId) return { ok: false, reason: "self" };
    // The old man has no standing to lose and no ledger to write to. A report
    // against him would sit in `byTarget` as an accusation against an account
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
      // it — and the tally hides messages and writes strikes.
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

    const standing = await standingFor(ctx, profile.clerkId, now);
    const muted = profile.mutedUntil !== undefined && profile.mutedUntil > now;
    const weight = reporterWeight(standing, muted);

    await ctx.db.insert("reports", {
      reporterClerkId: profile.clerkId,
      messageId: args.messageId,
      targetClerkId,
      conversationId,
      reason: args.reason,
      createdAt: now,
      weight,
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
 * Both thresholds have to be met. Summed weight alone would let three accounts
 * in good standing act as one; a count of distinct people alone would ignore
 * that some of those people are currently muted for doing the same thing.
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
  const weight = reports.reduce((sum, row) => sum + row.weight, 0);

  if (
    weight < REPORTS_TO_HIDE.weight ||
    reporters.size < REPORTS_TO_HIDE.distinct
  ) {
    return false;
  }

  await ctx.db.patch(messageId, { status: "hidden" });
  // A message nobody can read any more should not be telling anybody's list
  // that it named them. See `clearMentions`.
  await clearMentions(ctx, messageId);

  const author = await profileFor(ctx, message.authorClerkId);
  if (author === null) return true;

  // What is left of this account's report allowance. Past the ceiling the
  // message is still hidden — the crowd is right about the message often
  // enough — but nothing further is charged for it.
  const now = Date.now();
  const strikes = await ctx.db
    .query("strikes")
    .withIndex("byUser", (q) =>
      q.eq("clerkId", author.clerkId).gt("expiresAt", now),
    )
    .collect();
  const fromReports = strikes
    .filter((row) => row.source === "reports")
    .reduce((sum, row) => sum + row.weight, 0);

  const remaining = Math.max(0, MAX_REPORT_STANDING - fromReports);

  await applyStrike(
    ctx,
    author,
    {
      rule: "harassment",
      weight: Math.min(REPORT_STRIKE_WEIGHT, remaining),
      banOnSight: false,
      excerpt: message.body.slice(0, 120),
    },
    "reports",
    message.conversationId,
  );

  return true;
}
