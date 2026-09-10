import { SignIn } from "@clerk/nextjs";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sign in" };

/**
 * Clerk's component is rendered as-is, with no appearance overrides — the
 * split-screen layout around it supplies the branding.
 *
 * The optional catch-all segment is what lets Clerk own the sub-steps of the
 * flow (`/auth/sign-in/factor-two`, `/auth/sign-in/reset-password`, ...) as
 * real URLs instead of hidden component state, so a refresh mid-flow does not
 * drop the user back at the start.
 *
 * The destination is stated here as well as in the environment so a missing
 * `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` cannot land anyone back on
 * the marketing page. It is the *fallback*, so an explicit `redirect_url` —
 * the one `auth.protect()` adds when it intercepts a deep link — still wins.
 */
export default function SignInPage() {
  return (
    <SignIn
      routing="path"
      path="/auth/sign-in"
      signUpUrl="/auth/sign-up"
      fallbackRedirectUrl="/dashboard"
    />
  );
}
