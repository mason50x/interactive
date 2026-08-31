import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  GROUP_EMOJI,
  GROUP_HUES,
  MAX_INITIALS,
  MAX_TITLE,
} from "../moderation/limits";
import { screenStatic } from "../moderation/verdict";
import { mutation, query, type MutationCtx } from "../_generated/server";
import { blockedEitherWay, callerProfile, membership, profileFor } from "./shared";

/**
 * Groups, and the three ways into one.
 *
 * `invite` puts the decision with the people already inside; `request` puts it
 * with the owner; `open` puts it with nobody. All three exist because a group
 * is the one place on this site where a person can build a room and choose who
 * is in it, and taking that choice away would leave only the global room, which
 * is everybody.
 *
 * ## Roles here are not moderator powers
 *
 * An owner can remove somebody from their own group. That is the entire scope:
 * it does not touch the person's standing, does not follow them anywhere else,
 * and cannot be escalated into anything that reaches another conversation. The
 * automated system in `convex/moderation/` is the only thing that acts across
 * the site, and it takes instructions from nobody.
 *
 * ## Everybody arrives as a member
 *
 * Every way in writes `role: "member"` — invited, invitation accepted, asked
 * and admitted, walked into an open group — and so do the paths that reuse a
 * membership row somebody already had. Rank is granted by an owner through
 * `setRole` and by nothing else; a row that outlived a departure is not a
 * grant. `leave` clears the role on the way out too, which makes this the
 * second of two locks on the same door rather than the only one.
 */

/** The most people one group may hold. */
const MAX_MEMBERS = 100;

const MAX_PENDING = 100;

type Role = "owner" | "admin" | "member";

/** Whether a role may admit, remove, and invite. */
function canAdminister(role: Role): boolean {
  return role === "owner" || role === "admin";
}

/**
 * The caller's membership, if it is a group they may administer.
 *
 * Ownership is re-established from the conversation every time rather than
 * trusted from the argument, for the reason `ownedInvite` gives in
 * `convex/invites.ts`: an id that has been through a browser is an id anybody
 * could have sent back.
 */
async function asAdmin(
  ctx: MutationCtx,
  conversationId: Id<"conversations">,
  clerkId: string,
) {
  const member = await membership(ctx, conversationId, clerkId);
  if (member === null || member.status !== "active") return null;
  if (member.kind !== "group") return null;
  if (!canAdminister(member.role)) return null;
  return member;
}

export type GroupResult =
  | { ok: true }
  | {
      ok: false;
      reason: "not-allowed" | "unknown" | "full" | "already" | "blocked" | "closed";
    };

async function memberCount(
  ctx: MutationCtx,
  conversationId: Id<"conversations">,
): Promise<number> {
  const rows = await ctx.db
    .query("conversationMembers")
    .withIndex("byConversation", (q) => q.eq("conversationId", conversationId))
    .take(MAX_MEMBERS + 1);
  return rows.filter(
    (row) => row.status === "active" || row.status === "invited",
  ).length;
}

/** Ask somebody to join. They still have to say yes. */
export const invite = mutation({
  args: { conversationId: v.id("conversations"), peerClerkId: v.string() },
  handler: async (ctx, { conversationId, peerClerkId }): Promise<GroupResult> => {
    const profile = await callerProfile(ctx);
    if (profile === null) return { ok: false, reason: "closed" };

    const me = await asAdmin(ctx, conversationId, profile.clerkId);
    if (me === null) return { ok: false, reason: "not-allowed" };

    const peer = await profileFor(ctx, peerClerkId);
    if (peer === null || peer.bannedAt !== undefined) {
      return { ok: false, reason: "unknown" };
    }
    if (await blockedEitherWay(ctx, profile.clerkId, peerClerkId)) {
      return { ok: false, reason: "blocked" };
    }
    if ((await memberCount(ctx, conversationId)) >= MAX_MEMBERS) {
      return { ok: false, reason: "full" };
    }

    const existing = await membership(ctx, conversationId, peerClerkId);
    if (existing !== null) {
      // Somebody the owner removed does not come back through an invitation
      // from an admin who disagreed with the removal.
      if (existing.status === "banned") return { ok: false, reason: "not-allowed" };
      if (existing.status === "active" || existing.status === "invited") {
        return { ok: false, reason: "already" };
      }
      await ctx.db.patch(existing._id, {
        status: existing.status === "requested" ? "active" : "invited",
        // Whatever the row said last time. See the top of this file.
        role: "member",
        invitedBy: profile.clerkId,
      });
      return { ok: true };
    }

    await ctx.db.insert("conversationMembers", {
      conversationId,
      clerkId: peerClerkId,
      kind: "group",
      role: "member",
      status: "invited",
      joinedAt: Date.now(),
      lastReadAt: 0,
      invitedBy: profile.clerkId,
    });
    return { ok: true };
  },
});

/** Accept or decline an invitation addressed to you. */
export const respondToInvite = mutation({
  args: { conversationId: v.id("conversations"), accept: v.boolean() },
  handler: async (ctx, { conversationId, accept }) => {
    const profile = await callerProfile(ctx);
    if (profile === null) return;

    const member = await membership(ctx, conversationId, profile.clerkId);
    if (member === null || member.status !== "invited") return;

    if (!accept) {
      await ctx.db.delete(member._id);
      return;
    }
    await ctx.db.patch(member._id, {
      status: "active",
      role: "member",
      joinedAt: Date.now(),
    });
  },
});

/**
 * Ask to be let in.
 *
 * On an `open` group this is the whole of joining. On a `request` group it
 * leaves a row for the owner to approve. On an `invite` group it is refused,
 * because being able to knock on a door that says do not knock is not a policy.
 */
export const requestJoin = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }): Promise<GroupResult> => {
    const profile = await callerProfile(ctx);
    if (profile === null) return { ok: false, reason: "closed" };
    if (profile.bannedAt !== undefined) return { ok: false, reason: "closed" };

    const conversation = await ctx.db.get(conversationId);
    if (conversation === null || conversation.kind !== "group") {
      return { ok: false, reason: "unknown" };
    }
    if (conversation.joinPolicy === "invite") {
      return { ok: false, reason: "not-allowed" };
    }
    if ((await memberCount(ctx, conversationId)) >= MAX_MEMBERS) {
      return { ok: false, reason: "full" };
    }

    const status = conversation.joinPolicy === "open" ? "active" : "requested";
    const existing = await membership(ctx, conversationId, profile.clerkId);
    if (existing !== null) {
      if (existing.status === "banned") return { ok: false, reason: "not-allowed" };
      if (existing.status === "active" || existing.status === "requested") {
        return { ok: false, reason: "already" };
      }
      await ctx.db.patch(existing._id, {
        status,
        role: "member",
        joinedAt: Date.now(),
      });
      return { ok: true };
    }

    await ctx.db.insert("conversationMembers", {
      conversationId,
      clerkId: profile.clerkId,
      kind: "group",
      role: "member",
      status,
      joinedAt: Date.now(),
      lastReadAt: 0,
    });
    return { ok: true };
  },
});

/** Let a waiting request in, or turn it away. */
export const decide = mutation({
  args: {
    conversationId: v.id("conversations"),
    clerkId: v.string(),
    approve: v.boolean(),
  },
  handler: async (ctx, { conversationId, clerkId, approve }) => {
    const profile = await callerProfile(ctx);
    if (profile === null) return;
    if ((await asAdmin(ctx, conversationId, profile.clerkId)) === null) return;

    const member = await membership(ctx, conversationId, clerkId);
    if (member === null || member.status !== "requested") return;

    if (!approve) {
      await ctx.db.delete(member._id);
      return;
    }
    if ((await memberCount(ctx, conversationId)) >= MAX_MEMBERS) return;
    await ctx.db.patch(member._id, {
      status: "active",
      role: "member",
      joinedAt: Date.now(),
    });
  },
});

/**
 * Remove somebody, and keep them out.
 *
 * `banned` rather than deleting the row, so that an `open` group cannot be
 * rejoined the second after somebody is removed from it. Scoped to this group
 * and invisible everywhere else.
 */
export const kick = mutation({
  args: { conversationId: v.id("conversations"), clerkId: v.string() },
  handler: async (ctx, { conversationId, clerkId }) => {
    const profile = await callerProfile(ctx);
    if (profile === null) return;
    if (clerkId === profile.clerkId) return;

    const me = await asAdmin(ctx, conversationId, profile.clerkId);
    if (me === null) return;

    const them = await membership(ctx, conversationId, clerkId);
    if (them === null) return;
    // An admin cannot remove the owner, and cannot remove another admin. Only
    // the owner outranks an admin.
    if (them.role === "owner") return;
    if (them.role === "admin" && me.role !== "owner") return;

    await ctx.db.patch(them._id, { status: "banned" });
  },
});

/** Promote or demote. Owners only, and the owner cannot demote themselves. */
export const setRole = mutation({
  args: {
    conversationId: v.id("conversations"),
    clerkId: v.string(),
    role: v.union(v.literal("admin"), v.literal("member")),
  },
  handler: async (ctx, { conversationId, clerkId, role }) => {
    const profile = await callerProfile(ctx);
    if (profile === null) return;
    if (clerkId === profile.clerkId) return;

    const me = await membership(ctx, conversationId, profile.clerkId);
    if (me === null || me.role !== "owner" || me.status !== "active") return;

    const them = await membership(ctx, conversationId, clerkId);
    if (them === null || them.status !== "active") return;
    if (them.role === "owner") return;

    await ctx.db.patch(them._id, { role });
  },
});

/**
 * Go, and take the group with you if you were the last one in it.
 *
 * Three outcomes, and which one happens is decided by who is left rather than
 * by what role the leaver held:
 *
 * Nobody is left, and the group is over. The row, every message ever sent in
 * it, every report filed inside it, and any invitation still outstanding are
 * all deleted — see `purgeConversation` in `convex/chat/sweep.ts` for why that
 * is scheduled rather than done here. Keeping an empty group would be keeping a
 * room that nothing can ever reach again and that no one can ever close, and
 * its messages would outlive every person who could have read them.
 *
 * Somebody is left and the leaver was the owner: the group goes to the oldest
 * remaining admin, or failing that the oldest remaining member. A group with
 * nobody able to administer it is the same dead end by a slower route.
 *
 * Otherwise the membership row is kept and marked `left`, so that coming back
 * remembers where you had read up to.
 *
 * The check is on who remains and not on the role, deliberately. Reasoning "the
 * last person out must be the owner, because ownership is handed over" is true
 * today and is exactly the kind of true that stops being true when somebody
 * adds a fourth way to leave a group.
 */
export const leave = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const profile = await callerProfile(ctx);
    if (profile === null) return;

    const member = await membership(ctx, conversationId, profile.clerkId);
    if (member === null || member.kind !== "group") return;
    if (member.status !== "active") return;

    const rest = (await activeMembers(ctx, conversationId)).filter(
      (row) => row.clerkId !== profile.clerkId,
    );

    if (rest.length === 0) {
      await ctx.scheduler.runAfter(0, internal.chat.sweep.purgeConversation, {
        conversationId,
      });
      return;
    }

    if (member.role === "owner") {
      const heir = [...rest].sort((first, second) => {
        if (first.role !== second.role) return first.role === "admin" ? -1 : 1;
        return first.joinedAt - second.joinedAt;
      })[0];
      await ctx.db.patch(heir._id, { role: "owner" });
    }

    await ctx.db.patch(member._id, { status: "left", role: "member" });
  },
});

async function activeMembers(
  ctx: MutationCtx,
  conversationId: Id<"conversations">,
) {
  return await ctx.db
    .query("conversationMembers")
    .withIndex("byConversation", (q) =>
      q.eq("conversationId", conversationId).eq("status", "active"),
    )
    .take(MAX_MEMBERS);
}

export const setJoinPolicy = mutation({
  args: {
    conversationId: v.id("conversations"),
    joinPolicy: v.union(
      v.literal("invite"),
      v.literal("request"),
      v.literal("open"),
    ),
  },
  handler: async (ctx, { conversationId, joinPolicy }) => {
    const profile = await callerProfile(ctx);
    if (profile === null) return;

    const me = await membership(ctx, conversationId, profile.clerkId);
    if (me === null || me.role !== "owner" || me.status !== "active") return;
    await ctx.db.patch(conversationId, { joinPolicy });
  },
});

/**
 * Rename a group.
 *
 * Through the same `screenStatic` the group was made under, so a name that
 * would have been refused at creation cannot be arrived at afterwards. Admins
 * as well as the owner: renaming is running the group, and an admin who abuses
 * it is a person the owner can demote.
 */
export const rename = mutation({
  args: { conversationId: v.id("conversations"), title: v.string() },
  handler: async (ctx, { conversationId, title }): Promise<GroupResult> => {
    const profile = await callerProfile(ctx);
    if (profile === null) return { ok: false, reason: "closed" };
    if ((await asAdmin(ctx, conversationId, profile.clerkId)) === null) {
      return { ok: false, reason: "not-allowed" };
    }

    const screened = screenStatic(title, MAX_TITLE);
    if (!screened.ok) return { ok: false, reason: "not-allowed" };

    await ctx.db.patch(conversationId, { title: screened.text });
    return { ok: true };
  },
});

/**
 * Give a group a face, or take it back.
 *
 * The whole face every time, the same shape as `setAvatar` in
 * `convex/chat/profiles.ts`: what arrives is what the group ends up with, and
 * anything not sent is cleared. So resetting is this mutation with nothing in
 * it, and there is no second mutation, no `clear` flag, and no way to end up
 * having changed a half somebody did not mean to touch.
 *
 * Every part is checked against the fixed sets in
 * `convex/moderation/limits.ts` and a value outside them is dropped rather than
 * refused — this is a picker, and the only way to send something else is to not
 * be using it. That check is the whole reason a group may have a face at all on
 * a site with nobody reviewing what its users put on screen: there is nothing
 * here that was not already in the app before anybody typed anything.
 */
export const setLook = mutation({
  args: {
    conversationId: v.id("conversations"),
    emoji: v.optional(v.string()),
    initials: v.optional(v.string()),
    hue: v.optional(v.number()),
  },
  handler: async (ctx, { conversationId, emoji, initials, hue }) => {
    const profile = await callerProfile(ctx);
    if (profile === null) return;
    if ((await asAdmin(ctx, conversationId, profile.clerkId)) === null) return;

    const wheel: readonly number[] = GROUP_HUES;
    const nextHue = hue !== undefined && wheel.includes(hue) ? hue : undefined;

    const faces: readonly string[] = GROUP_EMOJI;
    const nextEmoji =
      emoji !== undefined && faces.includes(emoji) ? emoji : undefined;

    // Only when there is no emoji: the disc has room for one thing, and an
    // emoji is the more deliberate of the two to have chosen.
    const wanted = (initials ?? "").trim();
    const nextInitials =
      nextEmoji === undefined &&
      wanted.length >= 1 &&
      wanted.length <= MAX_INITIALS &&
      /^[a-z0-9]+$/i.test(wanted)
        ? wanted
        : undefined;

    await ctx.db.patch(conversationId, {
      emoji: nextEmoji,
      initials: nextInitials,
      hue: nextHue,
    });
  },
});

export type GroupInvitation = {
  conversationId: Id<"conversations">;
  title: string;
  invitedBy?: string;
};

/** Group invitations waiting on the caller. */
export const invitations = query({
  args: {},
  handler: async (ctx): Promise<GroupInvitation[]> => {
    const profile = await callerProfile(ctx);
    if (profile === null) return [];

    const rows = await ctx.db
      .query("conversationMembers")
      .withIndex("byUser", (q) =>
        q.eq("clerkId", profile.clerkId).eq("status", "invited"),
      )
      .take(MAX_PENDING);

    const waiting: GroupInvitation[] = [];
    for (const row of rows) {
      const conversation = await ctx.db.get(row.conversationId);
      if (conversation === null || conversation.kind !== "group") continue;
      const inviter =
        row.invitedBy === undefined ? null : await profileFor(ctx, row.invitedBy);
      waiting.push({
        conversationId: row.conversationId,
        title: conversation.title ?? "Group",
        invitedBy: inviter?.handle,
      });
    }
    return waiting;
  },
});

export type JoinRequest = { clerkId: string; handle: string; at: number };

/** People waiting to be let into a group the caller administers. */
export const requests = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }): Promise<JoinRequest[]> => {
    const profile = await callerProfile(ctx);
    if (profile === null) return [];

    const me = await membership(ctx, conversationId, profile.clerkId);
    if (me === null || me.status !== "active" || !canAdminister(me.role)) return [];

    const rows = await ctx.db
      .query("conversationMembers")
      .withIndex("byConversation", (q) =>
        q.eq("conversationId", conversationId).eq("status", "requested"),
      )
      .take(MAX_PENDING);

    const waiting: JoinRequest[] = [];
    for (const row of rows) {
      const theirs = await profileFor(ctx, row.clerkId);
      if (theirs === null) continue;
      waiting.push({ clerkId: row.clerkId, handle: theirs.handle, at: row.joinedAt });
    }
    return waiting;
  },
});
