import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { LEARN_PATH_PREFIX } from "@/lib/learn";

/**
 * Routes that require a session.
 *
 * `/activities` is the default app page. `/learn` is where an activity is framed — it used to
 * be gated by a signed grant on a separate origin, because the session could
 * not reach that origin; now it is a normal page of this site and the session
 * reaches it like any other, so it is protected the same way. See
 * `src/lib/learn.ts`.
 *
 * Public pages and auth routes remain reachable to signed-out visitors.
 */
const inRouteTree = (path: string, root: string) =>
  path === root || path.startsWith(`${root}/`);

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
 */
const isSignedOutRoute = (path: string) =>
  path === "/" ||
  path === "/auth" ||
  inRouteTree(path, "/auth/sign-in") ||
  inRouteTree(path, "/auth/sign-up");

/**
 * One origin, one job: decide who may see a route before it renders.
 *
 * This was once a two-hostname router — the player origin was rewritten here
 * and kept away from Clerk. That origin is gone (`src/lib/learn.ts` has the
 * why), and with it the host matching, the rewrite, and the grant check. What
 * is left is the session gate, which is all a single-origin deployment needs.
 */
export default clerkMiddleware(async (auth, req) => {
  const path = req.nextUrl.pathname;
  // Early navigation handling only: protected pages and server actions also
  // enforce authentication themselves, independently of this path check.
  if (
    [
      "/home",
      "/admin",
      "/leaderboard",
      "/activities",
      "/tv",
      "/chat",
      "/browse",
      "/emulate",
      LEARN_PATH_PREFIX,
    ].some((root) => inRouteTree(path, root))
  ) {
    await auth.protect();
    return;
  }

  if (!isSignedOutRoute(path)) return;

  const { userId } = await auth();
  if (userId) {
    return NextResponse.redirect(new URL("/home", req.url));
  }
});

export const config = {
  matcher: [
    // These are application routes even when a dynamic segment looks like a
    // filename. Otherwise their layouts call auth() without Clerk context.
    "/home/:path*",
    "/admin/:path*",
    "/leaderboard/:path*",
    "/activities/:path*",
    "/tv/:path*",
    "/chat/:path*",
    "/browse/:path*",
    "/emulate/:path*",
    "/learn/:path*",
    "/auth/:path*",
    // Public route trees that mount ClerkProvider also need Clerk context.
    "/",
    "/about",
    "/contact",
    "/tos",
    "/pp",
    "/api/:path*",
    "/trpc/:path*",
    "/__clerk/:path*",
  ],
};
