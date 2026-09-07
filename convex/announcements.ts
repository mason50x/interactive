import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";

// Keep the newest three documents, matching the retention job below.
export const list = query({
  args: {},
  returns: v.array(v.object({
    _id: v.id("announcements"), title: v.string(), body: v.string(), read: v.boolean(),
  })),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const posts = await ctx.db.query("announcements")
      .order("desc").take(3);
    return await Promise.all(posts.filter(post => post.status === "published").map(async post => {
      const receipt = await ctx.db.query("announcementReads")
        .withIndex("by_clerkId_and_announcementId", q =>
          q.eq("clerkId", identity.subject).eq("announcementId", post._id))
        .unique();
      return { _id: post._id, title: post.title, body: post.body, read: receipt !== null };
    }));
  },
});

export const markRead = mutation({
  args: { announcementId: v.id("announcements") },
  returns: v.null(),
  handler: async (ctx, { announcementId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Sign in to mark announcements as read.");
    const post = await ctx.db.get(announcementId);
    if (!post || post.status !== "published") throw new Error("Announcement unavailable.");
    const existing = await ctx.db.query("announcementReads")
      .withIndex("by_clerkId_and_announcementId", q =>
        q.eq("clerkId", identity.subject).eq("announcementId", announcementId))
      .unique();
    if (!existing) await ctx.db.insert("announcementReads", {
      clerkId: identity.subject, announcementId, readAt: Date.now(),
    });
    return null;
  },
});

// Dashboard edits bypass app mutations, so a cron enforces retention as well.
// Delete receipts before their post, in bounded batches, to avoid orphaning rows.
export const trim = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const posts = await ctx.db.query("announcements").order("desc").take(4);
    const oldest = posts[3];
    if (!oldest) return null;
    const reads = await ctx.db.query("announcementReads")
      .withIndex("by_announcementId", q => q.eq("announcementId", oldest._id))
      .take(200);
    for (const read of reads) await ctx.db.delete(read._id);
    if (reads.length < 200) await ctx.db.delete(oldest._id);
    await ctx.scheduler.runAfter(0, internal.announcements.trim, {});
    return null;
  },
});
