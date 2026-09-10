import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { LEARN_PATH_PREFIX } from "@/lib/learn";

/**
 * Routes that require a session.
 *
 * `/dashboard` is the app. `/learn` is where an activity is framed — it used to
 * be gated by a signed grant on a separate origin, because the session could
 * not reach that origin; now it is a normal page of this site and the session
 * reaches it like any other, so it is protected the same way. See
 * `src/lib/learn.ts`.
 *
 * Everything else — the landing page and all of `/auth`, including
 * `/auth/accept-invite` — has to stay reachable to a signed-out visitor.
 * Protecting an invitation link would bounce the recipient to sign-in and
 * strip the `__clerk_ticket` param on the way, which is a dead end for someone
 * who has no account yet: that ticket is how they get one.
 */
const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  `${LEARN_PATH_PREFIX}(.*)`,
]);

/**
 * The mirror image: routes that only make sense signed *out*. A visitor with a
 * live session gets the dashboard instead of the marketing page or a sign-in
 * form they have already completed.
 *
 * Doing it here rather than in the pages themselves is what keeps `/` a static
 * render for the signed-out visitors who are the ones actually being marketed
 * to — calling `auth()` inside the page would make it dynamic for everybody.
 * It also covers the return leg of the auth flow whatever sends it: Clerk's
 * own redirect, a stale `redirect_url`, or the browser's back button.
 *
 * `/auth/accept-invite` is deliberately absent. It has its own handling for a
 * signed-in recipient, and bouncing it to the dashboard would burn the link.
 */
const isSignedOutRoute = createRouteMatcher([
  "/",
  "/auth",
  "/auth/sign-in(.*)",
  "/auth/sign-up(.*)",
]);

/** `TICKET_PARAM` from `src/lib/invitations.ts`, inlined to keep this file's
 *  edge bundle free of the Clerk Backend API client that module pulls in. */
const TICKET_PARAM = "__clerk_ticket";

/**
 * One origin, one job: decide who may see a route before it renders.
 *
 * This was once a two-hostname router — the player origin was rewritten here
 * and kept away from Clerk. That origin is gone (`src/lib/learn.ts` has the
 * why), and with it the host matching, the rewrite, and the grant check. What
 * is left is the session gate, which is all a single-origin deployment needs.
 */
export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
    return;
  }

  if (!isSignedOutRoute(req)) return;

  // An invitation ticket outranks the open session: it is addressed to a
  // specific email, which may not be the one signed in on this browser. The
  // sign-in and sign-up forms know how to consume it; the dashboard does not.
  if (req.nextUrl.searchParams.has(TICKET_PARAM)) return;

  const { userId } = await auth();
  if (userId) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
});

export const config = {
  matcher: [
    // These are application routes even when a dynamic segment looks like a
    // filename. Otherwise their layouts call auth() without Clerk context.
    "/dashboard/:path*",
    "/learn/:path*",
    "/auth/:path*",
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
