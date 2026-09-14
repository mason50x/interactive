"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import { fetchMutation } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { inviteUser } from "./invitations";

/** Reserve with the server's admin check before contacting Clerk. A retry
 * reconciles an existing invitation first, including a lost send response. */
export async function approveNomination(
  nominationId: Id<"nominations">,
): Promise<{ ok: boolean; message: string }> {
  if (process.env.NODE_ENV !== "development") {
    return { ok: false, message: "Voting is not available." };
  }
  const { userId, getToken } = await auth();
  if (!userId) return { ok: false, message: "Sign in to approve invitations." };
  const token = await getToken({ template: "convex" });
  if (!token)
    return { ok: false, message: "Your session is not ready. Try again." };
  let reserved = false;
  let sent = false;
  try {
    const reservation = await fetchMutation(
      api.voting.reserveDelivery,
      { nominationId },
      { token },
    );
    if (reservation.sent)
      return { ok: true, message: "Invitation already sent." };
    reserved = true;
    const client = await clerkClient();
    const existing = await client.invitations.getInvitationList({
      query: reservation.email,
      limit: 100,
    });
    let invitation = existing.data.find(
      (invite) =>
        invite.emailAddress.toLowerCase() === reservation.email &&
        (invite.status === "pending" || invite.status === "accepted"),
    );
    if (!invitation)
      invitation = await inviteUser({
        emailAddress: reservation.email,
        publicMetadata: { invitedBy: userId, nominationId },
      });
    sent = true;
    await fetchMutation(
      api.voting.confirmDelivery,
      { nominationId, clerkInvitationId: invitation.id },
      { token },
    );
    return { ok: true, message: "Invitation sent." };
  } catch (error) {
    // Only release definitive Clerk refusals. A timeout may have sent email:
    // leave a lease, then reconcile on retry instead of firing another email.
    if (
      reserved &&
      !sent &&
      isClerkAPIResponseError(error) &&
      error.status < 500
    ) {
      await fetchMutation(
        api.voting.releaseDelivery,
        { nominationId },
        { token },
      ).catch(() => undefined);
      return {
        ok: false,
        message:
          "Clerk could not invite this address. Check the email or whether they already have an account.",
      };
    }
    return {
      ok: false,
      message: reserved
        ? "Could not confirm delivery. Retry in a minute; an existing invitation will be reused."
        : "Could not approve this nomination. Admin access and an accepted vote are required.",
    };
  }
}
