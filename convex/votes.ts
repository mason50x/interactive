import { ConvexError, v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { type QueryCtx } from "./_generated/server";
import { mutation, query } from "./functions";
import { requireAdmin } from "./roles";
import { requireNotTimedOut } from "./timeoutState";

/**
 * Votes: an admin (a CEO or Head Moderator) raises a topic in the admin
 * console, and every member answers
 * it yes or no from the rail. A `forced` topic holds the member's playtime
 * until they have answered — `experience.acquire` asks `voteRequired` before
 * granting a lease, so the hold is the server's and not a hidden button.
 *
 * A ballot is final. There is no changing it, so the tallies on the topic
 * only ever go up and the results never need a recount.
 */

const TITLE_MAX = 120;
const DESCRIPTION_MAX = 1000;
/** Open topics are few; this caps what one member's check can read. */
const OPEN_MAX = 50;

async function openTopics(ctx: QueryCtx) {
  return ctx.db
    .query("voteTopics")
    .withIndex("byClosed", (q) => q.eq("closed", false))
    .take(OPEN_MAX);
}

async function hasVoted(
  ctx: QueryCtx,
  clerkId: string,
  topicId: Id<"voteTopics">,
) {
  return (
    (await ctx.db
      .query("votes")
      .withIndex("byClerkIdAndTopicId", (q) =>
        q.eq("clerkId", clerkId).eq("topicId", topicId),
      )
      .unique()) !== null
  );
}

async function pendingFor(ctx: QueryCtx, clerkId: string) {
  const pending = [];
  for (const topic of await openTopics(ctx)) {
    if (!(await hasVoted(ctx, clerkId, topic._id))) pending.push(topic);
  }
  return pending;
}

/** Whether an open, forced topic is still waiting on this account. */
export async function voteRequired(ctx: QueryCtx, clerkId: string) {
  for (const topic of await openTopics(ctx)) {
    if (topic.forced && !(await hasVoted(ctx, clerkId, topic._id))) return true;
  }
  return false;
}

/** The signed-in member's unanswered topics: forced first, then oldest. */
export const pending = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("voteTopics"),
      title: v.string(),
      description: v.string(),
      forced: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const pending = await pendingFor(ctx, identity.subject);
    // Stable sort, so each group keeps the index's oldest-first order.
    pending.sort((a, b) => Number(b.forced) - Number(a.forced));
    return pending.map(
      ({ _id, title, description, forced }) => ({
        _id,
        title,
        description,
        forced,
      }),
    );
  },
});

export const cast = mutation({
  args: {
    topicId: v.id("voteTopics"),
    choice: v.union(v.literal("yes"), v.literal("no")),
  },
  returns: v.null(),
  handler: async (ctx, { topicId, choice }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Sign in to vote.");
    await requireNotTimedOut(ctx, identity.subject);
    const topic = await ctx.db.get(topicId);
    if (!topic || topic.closed) throw new ConvexError("This vote has closed.");
    // A second tap, or a second tab, is not a second ballot.
    if (await hasVoted(ctx, identity.subject, topicId)) return null;
    await ctx.db.insert("votes", {
      topicId,
      clerkId: identity.subject,
      choice,
    });
    await ctx.db.patch(topicId, { [choice]: topic[choice] + 1 });
    return null;
  },
});

const topicRow = v.object({
  _id: v.id("voteTopics"),
  _creationTime: v.number(),
  title: v.string(),
  description: v.string(),
  forced: v.boolean(),
  closed: v.boolean(),
  yes: v.number(),
  no: v.number(),
  createdBy: v.string(),
});

/** Newest first, with their tallies. */
export const list = query({
  args: {},
  returns: v.array(topicRow),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return ctx.db.query("voteTopics").order("desc").take(200);
  },
});

/**
 * One topic's ballots as a timeline, for the charts. Times only — who voted
 * which way stays out of the console.
 */
export const results = query({
  args: { topicId: v.id("voteTopics") },
  returns: v.union(
    v.null(),
    v.object({
      eligible: v.number(),
      ballots: v.array(
        v.object({
          at: v.number(),
          choice: v.union(v.literal("yes"), v.literal("no")),
        }),
      ),
    }),
  ),
  handler: async (ctx, { topicId }) => {
    await requireAdmin(ctx);
    if (!(await ctx.db.get(topicId))) return null;
    const ballots = await ctx.db
      .query("votes")
      .withIndex("byTopicId", (q) => q.eq("topicId", topicId))
      .take(10_000);
    // Everyone past the invite gate; absent `invited` is a pre-invite row.
    const users = await ctx.db.query("users").take(10_000);
    return {
      eligible: users.filter((user) => user.invited !== false).length,
      ballots: ballots.map((ballot) => ({
        at: ballot._creationTime,
        choice: ballot.choice,
      })),
    };
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    forced: v.boolean(),
  },
  returns: v.id("voteTopics"),
  handler: async (ctx, args) => {
    const { clerkId } = await requireAdmin(ctx);
    const title = args.title.trim();
    const description = args.description.trim();
    if (!title) throw new ConvexError("A topic needs a title.");
    if (title.length > TITLE_MAX)
      throw new ConvexError(`Keep the title under ${TITLE_MAX} characters.`);
    if (description.length > DESCRIPTION_MAX)
      throw new ConvexError(
        `Keep the description under ${DESCRIPTION_MAX} characters.`,
      );
    if ((await openTopics(ctx)).length >= OPEN_MAX)
      throw new ConvexError("Close an open vote before raising another.");
    return ctx.db.insert("voteTopics", {
      title,
      description,
      forced: args.forced,
      closed: false,
      yes: 0,
      no: 0,
      createdBy: clerkId,
    });
  },
});

export const setForced = mutation({
  args: { id: v.id("voteTopics"), forced: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { id, forced }) => {
    await requireAdmin(ctx);
    if (!(await ctx.db.get(id))) throw new ConvexError("Topic not found.");
    await ctx.db.patch(id, { forced });
    return null;
  },
});

/** Closing stops new ballots and lifts any hold; the results stay. */
export const setClosed = mutation({
  args: { id: v.id("voteTopics"), closed: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { id, closed }) => {
    await requireAdmin(ctx);
    if (!(await ctx.db.get(id))) throw new ConvexError("Topic not found.");
    if (!closed && (await openTopics(ctx)).length >= OPEN_MAX)
      throw new ConvexError("Close an open vote before reopening this one.");
    await ctx.db.patch(id, { closed });
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id("voteTopics") },
  /** False when there were too many ballots for one go; delete again. */
  returns: v.boolean(),
  handler: async (ctx, { id }) => {
    await requireAdmin(ctx);
    const ballots = await ctx.db
      .query("votes")
      .withIndex("byTopicId", (q) => q.eq("topicId", id))
      .take(4_000);
    for (const ballot of ballots) await ctx.db.delete(ballot._id);
    // Past one transaction's worth, close it rather than leave ballots
    // pointing at nothing. Returned, not thrown: a throw would undo the
    // deletes above.
    if (ballots.length === 4_000) {
      await ctx.db.patch(id, { closed: true });
      return false;
    }
    if (await ctx.db.get(id)) await ctx.db.delete(id);
    return true;
  },
});
