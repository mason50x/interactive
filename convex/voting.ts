import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { privilegesFor } from "../config/roles";
import { votingEnabled } from "./features";
import { delivery, matchesOwnName, MIN_VOTES, nameKey, status, THREE_DAYS } from "./voting/model";

async function member(ctx: QueryCtx) {
  if (!votingEnabled()) throw new ConvexError("Voting is not available.");
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Sign in to participate.");
  const user = await ctx.db.query("users").withIndex("byClerkId", q => q.eq("clerkId", identity.subject)).unique();
  if (!user) throw new ConvexError("Your account is still syncing. Please try again.");
  return user;
}

async function admin(ctx: QueryCtx) {
  const user = await member(ctx);
  if (!privilegesFor(user.clerkId).manageVoting) throw new ConvexError("Admin access required.");
  return user;
}

async function reject(ctx: MutationCtx, nomination: Doc<"nominations">, at: number) {
  await ctx.db.patch(nomination._id, { status: "rejected", closedAt: at });
  // Keep the cooldown separate so deleting a suggestion cannot erase it.
  const existing = await ctx.db.query("nominationCooldowns").withIndex("by_email", q => q.eq("email", nomination.email)).first();
  const fields = { email: nomination.email, nameKey: nomination.nameKey, until: at + THREE_DAYS };
  if (existing) await ctx.db.patch(existing._id, fields);
  else await ctx.db.insert("nominationCooldowns", fields);
}

const row = v.object({
  id: v.id("nominations"), name: v.string(), email: v.union(v.string(), v.null()),
  status, yes: v.number(), no: v.number(), closesAt: v.number(),
  closedAt: v.union(v.number(), v.null()), createdAt: v.number(),
  delivery, canDelete: v.boolean(), myVote: v.union(v.boolean(), v.null()),
});

async function present(ctx: QueryCtx, nomination: Doc<"nominations">, clerkId: string) {
  const ballot = await ctx.db.query("nominationVotes").withIndex("by_nominationId_and_clerkId", q => q.eq("nominationId", nomination._id).eq("clerkId", clerkId)).unique();
  const isAdmin = privilegesFor(clerkId).manageVoting;
  return {
    id: nomination._id, name: nomination.name, email: isAdmin ? nomination.email : null,
    status: nomination.status, yes: nomination.yes, no: nomination.no,
    closesAt: nomination.closesAt, closedAt: nomination.closedAt ?? null,
    createdAt: nomination._creationTime, delivery: nomination.delivery,
    canDelete: isAdmin || nomination.authorClerkId === clerkId, myVote: ballot?.yes ?? null,
  };
}

export const list = query({
  args: { status, paginationOpts: paginationOptsValidator },
  returns: v.object({ page: v.array(row), isDone: v.boolean(), continueCursor: v.string() }),
  handler: async (ctx, args) => {
    const user = await member(ctx);
    const result = await ctx.db.query("nominations").withIndex("by_status", q => q.eq("status", args.status)).order("desc").paginate({ ...args.paginationOpts, numItems: Math.min(args.paginationOpts.numItems, 30) });
    return { page: await Promise.all(result.page.map(n => present(ctx, n, user.clerkId))), isDone: result.isDone, continueCursor: result.continueCursor };
  },
});

export const approvals = query({
  args: {}, returns: v.array(row),
  handler: async ctx => {
    const user = await member(ctx);
    if (!privilegesFor(user.clerkId).manageVoting) return [];
    const pending = await ctx.db.query("nominations").withIndex("by_status_and_delivery", q => q.eq("status", "accepted").eq("delivery", "pending")).take(30);
    const sending = await ctx.db.query("nominations").withIndex("by_status_and_delivery", q => q.eq("status", "accepted").eq("delivery", "sending")).take(30);
    return await Promise.all([...pending, ...sending].map(n => present(ctx, n, user.clerkId)));
  },
});

export const voters = query({
  args: { nominationId: v.id("nominations"), paginationOpts: paginationOptsValidator },
  returns: v.object({ page: v.array(v.object({ id: v.id("nominationVotes"), name: v.string(), yes: v.boolean() })), isDone: v.boolean(), continueCursor: v.string() }),
  handler: async (ctx, { nominationId, paginationOpts }) => {
    await member(ctx);
    if (!await ctx.db.get(nominationId)) return { page: [], isDone: true, continueCursor: "" };
    const result = await ctx.db.query("nominationVotes").withIndex("by_nominationId_and_clerkId", q => q.eq("nominationId", nominationId)).paginate({ ...paginationOpts, numItems: Math.min(paginationOpts.numItems, 30) });
    const page = await Promise.all(result.page.map(async ballot => {
      const profile = await ctx.db.query("chatProfiles").withIndex("byClerkId", q => q.eq("clerkId", ballot.clerkId)).unique();
      return { id: ballot._id, name: profile?.displayName ?? profile?.handle ?? "Member", yes: ballot.yes };
    }));
    return { page, isDone: result.isDone, continueCursor: result.continueCursor };
  },
});

export const create = mutation({
  args: { name: v.string(), email: v.string() }, returns: v.id("nominations"),
  handler: async (ctx, args) => {
    const user = await member(ctx);
    const name = args.name.normalize("NFC").trim().replace(/\s+/gu, " ");
    const email = args.email.trim().toLowerCase();
    const key = nameKey(name);
    if (name.length < 2 || name.length > 100 || !/\p{L}/u.test(name) || /[\p{Cc}\p{Cf}<>]/u.test(name)) throw new ConvexError("Enter a name between 2 and 100 characters.");
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ConvexError("Enter a valid email address.");
    if (email === user.email?.trim().toLowerCase() || matchesOwnName(name, [user.name, user.username, [user.firstName, user.lastName].filter(Boolean).join(" ")])) throw new ConvexError("You cannot nominate yourself.");
    const now = Date.now();
    // Duplicate identity checks also serialize simultaneous submissions.
    for (const candidate of [
      await ctx.db.query("nominations").withIndex("by_email", q => q.eq("email", email)).order("desc").first(),
      await ctx.db.query("nominations").withIndex("by_nameKey", q => q.eq("nameKey", key)).order("desc").first(),
    ]) {
      if (candidate && candidate.status !== "rejected") throw new ConvexError("This person already has a nomination.");
    }
    for (const cooldown of [
      await ctx.db.query("nominationCooldowns").withIndex("by_email", q => q.eq("email", email)).first(),
      await ctx.db.query("nominationCooldowns").withIndex("by_nameKey_and_until", q => q.eq("nameKey", key)).order("desc").first(),
    ]) if (cooldown && now < cooldown.until) throw new ConvexError("Wait three days after rejection before nominating this person again.");
    const nominationId = await ctx.db.insert("nominations", { name, nameKey: key, email, authorClerkId: user.clerkId, status: "open", yes: 1, no: 0, closesAt: now + THREE_DAYS, delivery: "pending" });
    await ctx.db.insert("nominationVotes", { nominationId, clerkId: user.clerkId, yes: true });
    await ctx.scheduler.runAt(now + THREE_DAYS, internal.voting.expire, { nominationId });
    return nominationId;
  },
});

export const vote = mutation({
  args: { nominationId: v.id("nominations"), yes: v.boolean() }, returns: v.null(),
  handler: async (ctx, { nominationId, yes }) => {
    const user = await member(ctx);
    const nomination = await ctx.db.get(nominationId);
    if (!nomination || nomination.status !== "open") throw new ConvexError("This vote is closed.");
    if (Date.now() >= nomination.closesAt) {
      await reject(ctx, nomination, nomination.closesAt);
      return null;
    }
    const existing = await ctx.db.query("nominationVotes").withIndex("by_nominationId_and_clerkId", q => q.eq("nominationId", nominationId).eq("clerkId", user.clerkId)).unique();
    if (existing) throw new ConvexError("You have already voted. Votes are final.");
    await ctx.db.insert("nominationVotes", { nominationId, clerkId: user.clerkId, yes });
    const count = nomination.yes + Number(yes);
    await ctx.db.patch(nominationId, { yes: count, no: nomination.no + Number(!yes) });
    if (!yes) await reject(ctx, nomination, Date.now());
    else if (count >= MIN_VOTES && nomination.no === 0) await ctx.db.patch(nominationId, { status: "accepted", closedAt: Date.now() });
    return null;
  },
});

export const expire = internalMutation({
  args: { nominationId: v.id("nominations") }, returns: v.null(),
  handler: async (ctx, { nominationId }) => {
    if (!votingEnabled()) return null;
    const nomination = await ctx.db.get(nominationId);
    if (nomination?.status === "open" && Date.now() >= nomination.closesAt) await reject(ctx, nomination, nomination.closesAt);
    return null;
  },
});

export const clearVotes = internalMutation({
  args: { nominationId: v.id("nominations") }, returns: v.null(),
  handler: async (ctx, { nominationId }) => {
    const ballots = await ctx.db.query("nominationVotes").withIndex("by_nominationId_and_clerkId", q => q.eq("nominationId", nominationId)).take(100);
    for (const ballot of ballots) await ctx.db.delete(ballot._id);
    if (ballots.length === 100) await ctx.scheduler.runAfter(0, internal.voting.clearVotes, { nominationId });
    return null;
  },
});

export const remove = mutation({
  args: { nominationId: v.id("nominations") }, returns: v.null(),
  handler: async (ctx, { nominationId }) => {
    const user = await member(ctx);
    const nomination = await ctx.db.get(nominationId);
    if (!nomination) return null;
    if (nomination.authorClerkId !== user.clerkId && !privilegesFor(user.clerkId).manageVoting) throw new ConvexError("Only the author or an admin can delete this suggestion.");
    if (nomination.status === "open" && Date.now() >= nomination.closesAt) await reject(ctx, nomination, nomination.closesAt);
    await ctx.db.delete(nominationId);
    await ctx.scheduler.runAfter(0, internal.voting.clearVotes, { nominationId });
    return null;
  },
});

export const unread = query({
  args: {}, returns: v.boolean(),
  handler: async ctx => {
    if (!votingEnabled()) return false;
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return false;
    const seen = await ctx.db.query("votingReads").withIndex("by_clerkId", q => q.eq("clerkId", identity.subject)).unique();
    const latest = await ctx.db.query("nominations").order("desc").first();
    return Boolean(latest && latest._creationTime > (seen?.seenAt ?? 0));
  },
});

export const markRead = mutation({
  args: { through: v.number() }, returns: v.null(),
  handler: async (ctx, { through }) => {
    const user = await member(ctx);
    if (!Number.isFinite(through)) throw new ConvexError("Invalid reading position.");
    const existing = await ctx.db.query("votingReads").withIndex("by_clerkId", q => q.eq("clerkId", user.clerkId)).unique();
    const latest = await ctx.db.query("nominations").order("desc").first();
    const seenAt = Math.max(existing?.seenAt ?? 0, Math.min(through, Math.max(Date.now(), latest?._creationTime ?? 0)));
    if (existing) await ctx.db.patch(existing._id, { seenAt });
    else await ctx.db.insert("votingReads", { clerkId: user.clerkId, seenAt });
    return null;
  },
});

// Only admins may reserve or settle delivery. The server action uses the
// existing Clerk invite helper; member invite allowances remain independent.
export const reserveDelivery = mutation({
  args: { nominationId: v.id("nominations") },
  returns: v.object({ email: v.string(), sent: v.boolean() }),
  handler: async (ctx, { nominationId }) => {
    const user = await admin(ctx);
    const nomination = await ctx.db.get(nominationId);
    if (!nomination || nomination.status !== "accepted" || nomination.yes < MIN_VOTES || nomination.no !== 0) throw new ConvexError("This nomination has not passed.");
    if (nomination.delivery === "sent") return { email: nomination.email, sent: true };
    if (nomination.delivery === "sending" && Date.now() - (nomination.sendingAt ?? 0) < 60000) throw new ConvexError("An invitation is already being sent. Try again in a minute.");
    await ctx.db.patch(nominationId, { delivery: "sending", sendingAt: Date.now(), approvedBy: user.clerkId });
    return { email: nomination.email, sent: false };
  },
});

export const confirmDelivery = mutation({
  args: { nominationId: v.id("nominations"), clerkInvitationId: v.string() }, returns: v.null(),
  handler: async (ctx, { nominationId, clerkInvitationId }) => {
    await admin(ctx);
    const nomination = await ctx.db.get(nominationId);
    if (nomination?.status === "accepted" && nomination.delivery === "sending") await ctx.db.patch(nominationId, { delivery: "sent", clerkInvitationId });
    return null;
  },
});

export const releaseDelivery = mutation({
  args: { nominationId: v.id("nominations") }, returns: v.null(),
  handler: async (ctx, { nominationId }) => {
    await admin(ctx);
    const nomination = await ctx.db.get(nominationId);
    if (nomination?.delivery === "sending") await ctx.db.patch(nominationId, { delivery: "pending", sendingAt: undefined });
    return null;
  },
});

export const purgeAccount = internalMutation({
  args: { clerkId: v.string() }, returns: v.null(),
  handler: async (ctx, { clerkId }) => {
    const nominations = await ctx.db.query("nominations").withIndex("by_authorClerkId", q => q.eq("authorClerkId", clerkId)).take(50);
    for (const nomination of nominations) {
      if (nomination.status === "open" && Date.now() >= nomination.closesAt) await reject(ctx, nomination, nomination.closesAt);
      await ctx.db.delete(nomination._id);
      await ctx.scheduler.runAfter(0, internal.voting.clearVotes, { nominationId: nomination._id });
    }
    const ballots = await ctx.db.query("nominationVotes").withIndex("by_clerkId", q => q.eq("clerkId", clerkId)).take(100);
    for (const ballot of ballots) {
      const nomination = await ctx.db.get(ballot.nominationId);
      // Closed results are historical facts; deleting an account does not
      // revoke an accepted result. Open votes only count existing accounts.
      if (nomination?.status === "open") await ctx.db.patch(nomination._id, { yes: nomination.yes - Number(ballot.yes), no: nomination.no - Number(!ballot.yes) });
      await ctx.db.delete(ballot._id);
    }
    const read = await ctx.db.query("votingReads").withIndex("by_clerkId", q => q.eq("clerkId", clerkId)).unique();
    if (read) await ctx.db.delete(read._id);
    if (nominations.length === 50 || ballots.length === 100) await ctx.scheduler.runAfter(0, internal.voting.purgeAccount, { clerkId });
    return null;
  },
});
