import { SignOutButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ButtonLink, buttonVariants } from "@/components/ui/button";
import {
  isTicketStatus,
  TICKET_PARAM,
  TICKET_STATUS_PARAM,
} from "@/lib/invitations";

export const metadata: Metadata = { title: "Accept your invitation" };

/**
 * Where every invitation email lands.
 *
 * Clerk verifies the ticket before bouncing the recipient here, then appends
 * `__clerk_ticket` (the credential) and `__clerk_status` (what to do with it).
 * This page is a router, not a form: it reads those two params and hands off
 * to the sign-up or sign-in flow, which is where the prebuilt Clerk component
 * consumes the ticket and skips email verification — the invitation already
 * proved the address.
 *
 * Sending people through here rather than straight at `/auth/sign-up` is what
 * buys the three cases a bare sign-up form gets wrong: a recipient who already
 * has an account, one who is already signed in, and one whose link has expired.
 */
export default async function AcceptInvitePage({
  searchParams,
}: PageProps<"/auth/accept-invite">) {
  const params = await searchParams;
  const ticket = firstValue(params[TICKET_PARAM]);
  const rawStatus = firstValue(params[TICKET_STATUS_PARAM]);
  const status = isTicketStatus(rawStatus) ? rawStatus : null;

  // Clerk only omits the ticket when it could not verify one: a link that has
  // expired, been revoked, or already been used. There is nothing to hand off.
  if (!ticket) return <DeadLink />;

  // `complete` means Clerk matched an existing account and signed them in
  // already. Nothing left to accept.
  if (status === "complete") redirect("/dashboard");

  const { userId } = await auth();

  // A session is already open in this browser and the invitation is for a new
  // account, so accepting means signing out first. Left to itself, Clerk would
  // bounce them off the sign-up page into the dashboard as the wrong person and
  // silently burn nothing — the invitation stays pending and unexplained.
  if (userId && status === "sign_up") {
    return <WrongAccount ticket={ticket} />;
  }

  // `sign_in` means the address already has an account, so the ticket is used
  // to authenticate rather than to register. Anything else is a new account.
  const destination = status === "sign_in" ? "/auth/sign-in" : "/auth/sign-up";
  redirect(`${destination}?${TICKET_PARAM}=${encodeURIComponent(ticket)}`);
}

/** Search params arrive as `string | string[]`; a repeated param is a mistake. */
function firstValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function DeadLink() {
  return (
    <Panel
      eyebrow="Invitation"
      heading="This link is no longer valid"
      body="Invitations expire after 30 days, and each one can only be used once. If yours has run out, ask whoever invited you to send another."
    >
      <ButtonLink href="/auth/sign-in" size="md">
        Sign in instead
      </ButtonLink>
      <ButtonLink href="/" variant="outline" size="md">
        Back to site
      </ButtonLink>
    </Panel>
  );
}

function WrongAccount({ ticket }: { ticket: string }) {
  // Coming back here rather than to the sign-up form keeps the ticket in play:
  // once the session is gone this page routes it onward exactly as it would
  // have on the first visit.
  const returnTo = `/auth/accept-invite?${TICKET_PARAM}=${encodeURIComponent(ticket)}`;

  return (
    <Panel
      eyebrow="Invitation"
      heading="You're already signed in"
      body="This invitation creates a new account, and one is already open in this browser. Sign out to accept it — the invitation stays valid."
    >
      <SignOutButton redirectUrl={returnTo}>
        <button type="button" className={buttonVariants({ size: "md" })}>
          Sign out and accept
        </button>
      </SignOutButton>
      <ButtonLink href="/dashboard" variant="outline" size="md">
        Stay signed in
      </ButtonLink>
    </Panel>
  );
}

function Panel({
  eyebrow,
  heading,
  body,
  children,
}: {
  eyebrow: string;
  heading: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <div className="w-full max-w-md">
      <p className="label-small text-muted-foreground">{eyebrow}</p>
      <h1 className="text-display mt-4 text-[2rem] leading-tight">{heading}</h1>
      <p className="mt-4 text-[0.9375rem] leading-relaxed text-muted-foreground">
        {body}
      </p>
      <div className="mt-8 flex flex-wrap gap-3">{children}</div>
    </div>
  );
}
