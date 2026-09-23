import { RateLimiter } from "@convex-dev/rate-limiter";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

const BATCH = 100;
const limiter = new RateLimiter(components.rateLimiter);

/** Drain every account-owned table after the Clerk deletion webhook. */
export const purge = internalMutation({
  args: { clerkId: v.string(), stage: v.optional(v.number()), cursor: v.optional(v.string()) },
  returns: v.object({ stage: v.number(), changed: v.number(), done: v.boolean() }),
  handler: async (ctx, { clerkId, stage = 0, cursor }) => {
    let changed = 0;
    if (stage === 0) {
      const rows = await ctx.db.query("personalGameViews")
        .withIndex("by_clerkId_and_slug", q => q.eq("clerkId", clerkId)).take(BATCH);
      for (const row of rows) await ctx.db.delete(row._id);
      changed = rows.length;
    } else if (stage === 1) {
      const rows = await ctx.db.query("experienceLeases")
        .withIndex("by_clerkId_and_day", q => q.eq("clerkId", clerkId)).take(BATCH);
      for (const row of rows) {
        await limiter.reset(ctx, "experienceSeconds", { key: `${clerkId}:${row.day}` });
        await ctx.db.delete(row._id);
      }
      changed = rows.length;
    } else if (stage === 2) {
      const rows = await ctx.db.query("staffRoles")
        .withIndex("byClerkId", q => q.eq("clerkId", clerkId)).take(BATCH);
      for (const row of rows) await ctx.db.delete(row._id);
      changed = rows.length;
    } else if (stage === 3) {
      const rows = await ctx.db.query("userTimeouts")
        .withIndex("byClerkId", q => q.eq("clerkId", clerkId)).take(BATCH);
      for (const row of rows) await ctx.db.delete(row._id);
      changed = rows.length;
    } else if (stage === 4) {
      const rows = await ctx.db.query("timeoutAudit")
        .withIndex("byClerkId", q => q.eq("clerkId", clerkId)).take(BATCH);
      for (const row of rows) await ctx.db.delete(row._id);
      changed = rows.length;
    } else if (stage === 5) {
      // Keep other accounts' seven-day history, without the deleted actor ID.
      const rows = await ctx.db.query("timeoutAudit")
        .withIndex("byActor", q => q.eq("actor", clerkId)).take(BATCH);
      for (const row of rows) await ctx.db.patch(row._id, { actor: "deleted-account" });
      changed = rows.length;
    } else if (stage === 6) {
      const rows = await ctx.db.query("presence")
        .withIndex("byClerkId", q => q.eq("clerkId", clerkId)).take(BATCH);
      for (const row of rows) await ctx.db.delete(row._id);
      changed = rows.length;
    } else if (stage === 7) {
      const rows = await ctx.db.query("typing")
        .withIndex("byClerkId", q => q.eq("clerkId", clerkId)).take(BATCH);
      for (const row of rows) await ctx.db.delete(row._id);
      changed = rows.length;
    } else if (stage === 8) {
      const rows = await ctx.db.query("publishedHtmlSimulators")
        .withIndex("by_createdBy", q => q.eq("createdBy", clerkId)).take(BATCH);
      for (const row of rows) await ctx.db.patch(row._id, {
        createdBy: "", publishKey: `deleted:${row._id}`,
        lastOperationId: row.lastOperationId.startsWith(`${clerkId}:`) ? "deleted" : row.lastOperationId,
      });
      changed = rows.length;
    } else if (stage === 9) {
      const rows = await ctx.db.query("publishedHtmlSimulators")
        .withIndex("by_updatedBy", q => q.eq("updatedBy", clerkId)).take(BATCH);
      for (const row of rows) await ctx.db.patch(row._id, {
        updatedBy: "",
        lastOperationId: row.lastOperationId.startsWith(`${clerkId}:`) ? "deleted" : row.lastOperationId,
      });
      changed = rows.length;
    } else if (stage === 10) {
      const rows = await ctx.db.query("staffRoles")
        .withIndex("byUpdatedBy", q => q.eq("updatedBy", clerkId)).take(BATCH);
      for (const row of rows) await ctx.db.patch(row._id, { updatedBy: "deleted-account" });
      changed = rows.length;
    } else if (stage === 11) {
      const rows = await ctx.db.query("userTimeouts")
        .withIndex("byIssuedBy", q => q.eq("issuedBy", clerkId)).take(BATCH);
      for (const row of rows) await ctx.db.patch(row._id, { issuedBy: "deleted-account" });
      changed = rows.length;
    } else if (stage === 12) {
      const rows = await ctx.db.query("conversations")
        .withIndex("byCreatedBy", q => q.eq("createdBy", clerkId)).take(BATCH);
      for (const row of rows) await ctx.db.patch(row._id, { createdBy: "" });
      changed = rows.length;
    } else if (stage === 13) {
      const page = await ctx.db.query("messages")
        .paginate({ numItems: BATCH, cursor: cursor ?? null });
      for (const message of page.page) {
        if (message.authorClerkId === clerkId) continue;
        const mentions = message.mentions?.filter(mention => mention.clerkId !== clerkId);
        const reactions = message.reactions?.map(reaction => ({
          ...reaction, by: reaction.by.filter(id => id !== clerkId),
        }));
        const poll = message.poll && { ...message.poll,
          votes: message.poll.votes.filter(vote => vote.clerkId !== clerkId),
        };
        if (mentions?.length === message.mentions?.length &&
            reactions?.every((reaction, i) => reaction.by.length === message.reactions?.[i].by.length) !== false &&
            poll?.votes.length === message.poll?.votes.length) continue;
        await ctx.db.patch(message._id, { mentions, reactions, poll });
        changed++;
      }
      await ctx.scheduler.runAfter(0, internal.accountCleanup.purge, {
        clerkId, stage: page.isDone ? stage + 1 : stage,
        ...(page.isDone ? {} : { cursor: page.continueCursor }),
      });
      return { stage, changed, done: false };
    } else if (stage === 14) {
      for (const name of ["botTags", "adminBotTags", "activityRequests", "imageUploadUrl", "publishedHtml", "simulatorLibrary", "simulatorSave"]) {
        await limiter.reset(ctx, name, { key: clerkId });
      }
    } else {
      return { stage, changed: 0, done: true };
    }

    await ctx.scheduler.runAfter(0, internal.accountCleanup.purge, {
      clerkId, stage: changed === BATCH ? stage : stage + 1,
    });
    return { stage, changed, done: false };
  },
});
