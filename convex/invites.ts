import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";

/**
 * The per-account allowance, and the only place it is written down.
 *
 * Everyone gets the same allowance, invited accounts included: a user's budget
 * is this number minus the rows they own, and a brand new user owns none.
 * There is deliberately no grant step and no counter to seed — being a user
 * *is* the grant, so nothing has to run at sign-up for the tenth generation of
 * invitee to get the same allowance as the first.
 *
 * Because the budget is derived rather than stored, lowering this number does
 * not disturb invitations already sent: a user holding more live rows than the
 * new limit simply has nothing remaining (`mine` floors the subtraction at
 * zero) and their outstanding invitations stay valid.
 *
 * Not exported: Convex modules are function modules, and the UI has no
 * business hardcoding this anyway. `mine` hands it out.
 */
const INVITE_LIMIT = 2;

/**
 * Why the quota lives here and the sending lives in Next.js.
 *
 * Clerk's application invitations are Backend API only — they need the secret
 * key, so a browser can never create one directly, and Clerk itself has no
 * per-user allowance to enforce. That splits the job in two: this module owns
 * the accounting, transactionally, and `src/lib/invite-actions.ts` owns the
 * Clerk call. The handshake between them is `reserve` -> Clerk -> `confirm`,
 * with `release` for the failure leg.
 *
 * Reserving first is what makes the count trustworthy. A check-then-send would
 * let two clicks a few milliseconds apart both read four-used and both send;
 * here the reservation is a row written inside the same transaction as the
 * count that allowed it, so the second attempt reads five and is refused.
 */

/** Rows in any state but `revoked` are spent credits. */
function isLive(invite: Doc<"invites">): boolean {
  return invite.status !== "revoked";
}

/**
 * Addresses are compared, not just stored: this is the key the duplicate check
 * and the `user.created` webhook both look rows up by, so an invitation to
 * `Sam@Example.com` has to be the same row Clerk later reports as
 * `sam@example.com`.
 */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Enough to catch a typo before spending a round trip on Clerk, which does
 *  the authoritative validation and would reject a malformed address anyway. */
function looksLikeEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function invitesByInviter(ctx: QueryCtx, inviterClerkId: string) {
  return await ctx.db
    .query("invites")
    .withIndex("byInviter", (q) => q.eq("inviterClerkId", inviterClerkId))
    .collect();
}

async function requireIdentity(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    throw new Error("Not signed in");
  }
  return identity;
}

/**
 * The caller's own invite, or `null`. Every mutation below goes through this
 * rather than trusting the id it was handed: the id round-trips through the
 * browser, and a Convex id is guessable enough that ownership has to be
 * re-established on the way back in.
 */
async function ownedInvite(
  ctx: MutationCtx,
  inviteId: Id<"invites">,
  inviterClerkId: string,
) {
  const invite = await ctx.db.get(inviteId);
  if (invite === null || invite.inviterClerkId !== inviterClerkId) return null;
  return invite;
}

/**
 * What the account menu renders: the allowance, what is left of it, and who
 * the credits went to.
 *
 * Revoked rows are left out entirely — they are refunded, so showing them
 * would put invitations in the list that do not count against anything.
 * `sending` collapses into `pending` because the reservation is an internal
 * step of one click, not a state a person should have to read about, and the
 * Clerk invitation id never leaves this function: it is the handle that can
 * revoke an invitation, and the client only ever needs the Convex id.
 */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return null;

    const live = (await invitesByInviter(ctx, identity.subject)).filter(isLive);

    return {
      limit: INVITE_LIMIT,
      remaining: Math.max(0, INVITE_LIMIT - live.length),
      invites: live
        .sort((a, b) => b._creationTime - a._creationTime)
        .map((invite) => ({
          id: invite._id,
          email: invite.email,
          status: invite.status === "accepted" ? "accepted" : "pending",
          sentAt: invite._creationTime,
        })),
    };
  },
});

/**
 * Spends a credit, before Clerk is called.
 *
 * Returns a reason rather than throwing for the outcomes a person can act on
 * — a typo, a used-up allowance, an address already invited — so the dialog
 * can say what happened. Anything else really is exceptional and throws.
 */
export const reserve = mutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const identity = await requireIdentity(ctx);
    const address = normalizeEmail(email);

    if (!looksLikeEmail(address)) {
      return { ok: false, reason: "invalid_email" } as const;
    }

    // Clerk would refuse this anyway — the address already has an account —
    // but it is worth its own message, because "already invited" reads like
    // an accusation when the address is your own.
    if (identity.email && normalizeEmail(identity.email) === address) {
      return { ok: false, reason: "self" } as const;
    }

    const live = (await invitesByInviter(ctx, identity.subject)).filter(isLive);
    if (live.length >= INVITE_LIMIT) {
      return { ok: false, reason: "exhausted" } as const;
    }

    // Across every inviter, not just this one. Clerk enforces the same thing
    // (a second pending invitation for one address is a 400), so without this
    // the caller would lose the round trip and get Clerk's wording for it.
    const forAddress = await ctx.db
      .query("invites")
      .withIndex("byEmail", (q) => q.eq("email", address))
      .collect();
    if (forAddress.some(isLive)) {
      return { ok: false, reason: "duplicate" } as const;
    }

    const inviteId = await ctx.db.insert("invites", {
      inviterClerkId: identity.subject,
      email: address,
      status: "sending",
    });

    return { ok: true, inviteId, email: address } as const;
  },
});

/** Clerk has the invitation: the reservation becomes a spent credit. */
export const confirm = mutation({
  args: { inviteId: v.id("invites"), clerkInvitationId: v.string() },
  handler: async (ctx, { inviteId, clerkInvitationId }) => {
    const identity = await requireIdentity(ctx);
    const invite = await ownedInvite(ctx, inviteId, identity.subject);
    if (invite === null || invite.status !== "sending") return null;

    await ctx.db.patch(invite._id, { status: "sent", clerkInvitationId });
    return null;
  },
});

/**
 * Clerk refused, so the credit was never really spent.
 *
 * The row is deleted rather than marked revoked: nothing was ever sent, so
 * there is nothing to keep a record of, and leaving it would block the address
 * from being invited on the retry that usually follows.
 *
 * This is the one place the two systems can drift. If Clerk created the
 * invitation and the *response* was lost, this hands back a credit for an
 * invitation that is live in Clerk. That way round is the right one to fail:
 * an unrecorded invitation still works for its recipient, where the opposite
 * would burn a credit on nothing.
 */
export const release = mutation({
  args: { inviteId: v.id("invites") },
  handler: async (ctx, { inviteId }) => {
    const identity = await requireIdentity(ctx);
    const invite = await ownedInvite(ctx, inviteId, identity.subject);
    if (invite === null || invite.status !== "sending") return null;

    await ctx.db.delete(invite._id);
    return null;
  },
});

/**
 * The Clerk handle for an invite the caller owns and could still revoke.
 *
 * Reading it out separately, rather than returning it from the revoke
 * mutation, is what lets the credit come back *after* Clerk has killed the
 * link. Refunding first would leave a live invitation in someone's inbox that
 * this side has already stopped counting.
 */
export const revocable = query({
  args: { inviteId: v.id("invites") },
  handler: async (ctx, { inviteId }) => {
    const identity = await requireIdentity(ctx);
    const invite = await ctx.db.get(inviteId);
    if (invite === null || invite.inviterClerkId !== identity.subject) {
      return null;
    }
    if (invite.status !== "sent") return null;

    return { clerkInvitationId: invite.clerkInvitationId ?? null };
  },
});

/** The link is dead at Clerk; give the credit back. */
export const markRevoked = mutation({
  args: { inviteId: v.id("invites") },
  handler: async (ctx, { inviteId }) => {
    const identity = await requireIdentity(ctx);
    const invite = await ownedInvite(ctx, inviteId, identity.subject);
    if (invite === null) return null;
    // An accepted invitation cannot be taken back — the account exists.
    if (invite.status === "accepted") return null;

    await ctx.db.patch(invite._id, { status: "revoked" });
    return null;
  },
});

/**
 * Called from the `user.created` webhook, which is the only moment either
 * system learns that an invitation was actually taken up.
 *
 * Matching on the address rather than on the `invitedBy` metadata is
 * deliberate: the address is what Clerk mailed the invitation to and cannot be
 * changed on the way through sign-up, and `reserve` has already made it unique
 * among live rows. The metadata is still carried (see `inviteUser`) so the
 * created user records who brought them in, but it is not the join key.
 */
export const markAccepted = internalMutation({
  args: { email: v.string(), clerkId: v.string() },
  handler: async (ctx, { email, clerkId }) => {
    const address = normalizeEmail(email);
    const forAddress = await ctx.db
      .query("invites")
      .withIndex("byEmail", (q) => q.eq("email", address))
      .collect();

    let accepted = 0;
    for (const invite of forAddress) {
      if (invite.status !== "sending" && invite.status !== "sent") continue;
      await ctx.db.patch(invite._id, {
        status: "accepted",
        acceptedClerkId: clerkId,
        acceptedAt: Date.now(),
      });
      accepted += 1;
    }

    return { accepted };
  },
});
