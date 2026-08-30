import { SignUp } from "@clerk/nextjs";
import type { Metadata } from "next";
import { TICKET_PARAM } from "@/lib/invitations";

export const metadata: Metadata = { title: "Create your account" };

/**
 * Sign-up is invitation-only: the Clerk instance runs with
 * `sign_up_mode: "restricted"`, so this form only completes when it is carrying
 * an invitation ticket. `/auth/accept-invite` is what puts one in the query
 * string, and Clerk's component picks it up from there on its own — which is
 * also what lets it skip the email verification step, since accepting the
 * invitation already proved the address.
 */
export default async function SignUpPage({
  searchParams,
}: PageProps<"/auth/sign-up/[[...sign-up]]">) {
  const invited = Boolean((await searchParams)[TICKET_PARAM]);

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Confirms the invitation was recognised. Without it the form looks
          identical to the one that rejects an uninvited stranger. */}
      {invited && (
        <p className="label-small text-primary">You&rsquo;ve been invited</p>
      )}
      <SignUp
        routing="path"
        path="/auth/sign-up"
        signInUrl="/auth/sign-in"
        fallbackRedirectUrl="/dashboard"
      />
    </div>
  );
}
