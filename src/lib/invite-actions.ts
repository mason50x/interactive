"use server";

import { auth } from "@clerk/nextjs/server";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { inviteUser, revokeInvitation } from "./invitations";

/**
 * The two things a signed-in user can do with their invite allowance.
 *
 * The work is split across two systems and neither half can do it alone.
 * Convex owns the accounting — it is the only one of the two that can count
 * five transactionally — and Clerk owns the invitation itself, because
 * `invitations.createInvitation` is a Backend API call and the secret key
 * lives here, in Next.js, not in the browser and not in Convex. So this file
 * is the seam: it authenticates the caller, has Convex reserve a credit, makes
 * the Clerk call, and then tells Convex how it went.
 *
 * Every export is a Server Action, which means every export is a public POST
 * endpoint. Rendering the dialog only for signed-in users is not the check;
 * the `auth()` call at the top of each action is, and the ownership checks in
 * `convex/invites.ts` are the second one — the invite id these actions take
 * has been through the browser.
 */

export type InviteResult = { ok: true } | { ok: false; message: string };

/**
 * Convex needs the caller's identity, and a Server Action is not a Convex
 * client — there is no `ConvexProviderWithClerk` on the server to keep a token
 * fresh. Each action mints one from the same `convex` JWT template the browser
 * client uses, which is what makes `ctx.auth.getUserIdentity()` resolve to
 * this user inside the mutations below.
 *
 * A missing token means the template is not configured on the Clerk instance,
 * which is a deployment fault rather than a user error, so it throws.
 */
async function convexAuth() {
  const { userId, getToken } = await auth();
  if (!userId) return null;

  const token = await getToken({ template: "convex" });
  if (!token) {
    throw new Error(
      'Clerk returned no "convex" JWT. Create the template on this instance.',
    );
  }

  return { userId, token };
}

/** What `reserve` refuses for, in words a person can act on. */
const refusals: Record<string, string> = {
  invalid_email: "That does not look like an email address.",
  self: "That is your own address — you are already here.",
  exhausted: "You have used all of your invites.",
  duplicate: "That address has already been invited.",
};

/**
 * Spends one credit and has Clerk mail the invitation.
 *
 * The order is the whole design: reserve, then send, then confirm. Reserving
 * first is what stops two quick clicks from both passing a five-credit check;
 * confirming last is what keeps a Clerk failure from costing a credit.
 */
export async function sendInvite(email: string): Promise<InviteResult> {
  const session = await convexAuth();
  if (!session) return { ok: false, message: "You are not signed in." };

  const reservation = await fetchMutation(
    api.invites.reserve,
    { email },
    { token: session.token },
  );

  if (!reservation.ok) {
    return {
      ok: false,
      message: refusals[reservation.reason] ?? "That invite could not be sent.",
    };
  }

  try {
    const invitation = await inviteUser({
      emailAddress: reservation.email,
      // Rides the invitation through sign-up and lands on the created user's
      // `publicMetadata`, so an account carries a record of who brought it in
      // even though the invite row is keyed by address.
      publicMetadata: { invitedBy: session.userId },
    });

    await fetchMutation(
      api.invites.confirm,
      { inviteId: reservation.inviteId, clerkInvitationId: invitation.id },
      { token: session.token },
    );

    return { ok: true };
  } catch (error) {
    await fetchMutation(
      api.invites.release,
      { inviteId: reservation.inviteId },
      { token: session.token },
    );

    return { ok: false, message: clerkMessage(error) };
  }
}

/**
 * Takes back an invitation that has not been accepted, and with it the credit.
 *
 * Clerk goes first. Refunding before the link is dead would leave an
 * invitation someone can still act on that this side has stopped counting —
 * a sixth account from a five-invite allowance.
 */
export async function revokeInvite(inviteId: string): Promise<InviteResult> {
  const session = await convexAuth();
  if (!session) return { ok: false, message: "You are not signed in." };

  const invite = await fetchQuery(
    api.invites.revocable,
    { inviteId: inviteId as Id<"invites"> },
    { token: session.token },
  );

  if (!invite) {
    return { ok: false, message: "That invite can no longer be revoked." };
  }

  try {
    // Absent only for a row whose `confirm` never landed. There is nothing at
    // Clerk to revoke, so this falls through to releasing the credit.
    if (invite.clerkInvitationId) {
      await revokeInvitation(invite.clerkInvitationId);
    }
  } catch (error) {
    // Already revoked or already accepted at Clerk's end. An accepted
    // invitation must keep its credit spent, so this cannot fall through.
    return { ok: false, message: clerkMessage(error) };
  }

  await fetchMutation(
    api.invites.markRevoked,
    { inviteId: inviteId as Id<"invites"> },
    { token: session.token },
  );

  return { ok: true };
}

/**
 * Clerk's own wording where it has any. Its messages are written for the
 * person reading them ("duplicate record", "is invalid") and are better than
 * anything this layer could infer from a status code.
 */
function clerkMessage(error: unknown): string {
  if (isClerkAPIResponseError(error)) {
    const first = error.errors[0];
    if (first) return first.longMessage ?? first.message;
  }

  console.error("Clerk invitation call failed:", error);
  return "Something went wrong sending that invite. Try again.";
}
