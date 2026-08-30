import { clerkClient } from "@clerk/nextjs/server";
import { siteUrl } from "./site-url";

/**
 * Sending and inspecting Clerk application invitations.
 *
 * Server only — it imports `@clerk/nextjs/server` and talks to the Clerk
 * Backend API with the instance's secret key. Never import this from a
 * `"use client"` module.
 *
 * The instance runs with `sign_up_mode: "restricted"`, so an invitation is the
 * only way a new account comes into existence. That makes this file the front
 * door of the product rather than an admin convenience.
 */

/** Where an invitation link lands. Must never call `auth.protect()`, and must
 *  stay out of the signed-out redirect in `src/proxy.ts`. */
export const ACCEPT_INVITE_PATH = "/auth/accept-invite";

/**
 * Clerk appends these to `redirect_url` when the recipient clicks through.
 * `__clerk_ticket` is the credential; `__clerk_status` says what to do with it.
 */
export const TICKET_PARAM = "__clerk_ticket";
export const TICKET_STATUS_PARAM = "__clerk_status";

/**
 * The three values Clerk sends in `__clerk_status`, from `TicketStatus` in
 * `@clerk/shared`. Anything else is treated as an unusable link.
 */
export type TicketStatus = "sign_in" | "sign_up" | "complete";

export function isTicketStatus(value: string | null): value is TicketStatus {
  return value === "sign_in" || value === "sign_up" || value === "complete";
}

/** The absolute URL Clerk mails out. Must be absolute — it leaves our origin. */
export function inviteRedirectUrl(): string {
  return new URL(ACCEPT_INVITE_PATH, siteUrl()).toString();
}

type InviteOptions = {
  emailAddress: string;
  /**
   * Lands on the created user's `publicMetadata` once they accept, which makes
   * it the right place to carry a role or a cohort through sign-up.
   */
  publicMetadata?: UserPublicMetadata;
  /** Clerk's own default is 30 days. */
  expiresInDays?: number;
  /** Re-invite someone who already has a pending invitation or an account. */
  ignoreExisting?: boolean;
};

/**
 * Creates an invitation and has Clerk email it.
 *
 * `redirectUrl` is always derived from the running deployment rather than
 * passed in, so no caller can mail out a link to the wrong environment.
 */
export async function inviteUser({
  emailAddress,
  publicMetadata,
  expiresInDays,
  ignoreExisting,
}: InviteOptions) {
  const client = await clerkClient();
  return await client.invitations.createInvitation({
    emailAddress,
    redirectUrl: inviteRedirectUrl(),
    publicMetadata,
    expiresInDays,
    ignoreExisting,
    notify: true,
  });
}

/** Pending invitations, newest first. */
export async function listPendingInvitations(limit = 100) {
  const client = await clerkClient();
  return await client.invitations.getInvitationList({
    status: "pending",
    orderBy: "-created_at",
    limit,
  });
}

/** Revokes a pending invitation, which makes its emailed link stop working. */
export async function revokeInvitation(invitationId: string) {
  const client = await clerkClient();
  return await client.invitations.revokeInvitation(invitationId);
}
