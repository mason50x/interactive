import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { type NextFetchEvent, type NextRequest, NextResponse } from "next/server";
import { PLAYER_PATH_PREFIX, playerHost } from "@/lib/player";

/**
 * Only these routes require a session. Everything else — the landing page and
 * all of `/auth`, including `/auth/accept-invite` — has to stay reachable to a
 * signed-out visitor. Protecting an invitation link would bounce the recipient
 * to sign-in and strip the `__clerk_ticket` param on the way, which is a dead
 * end for someone who has no account yet: that ticket is how they get one.
 */
const isProtectedRoute = createRouteMatcher(["/dashboard(.*)"]);

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

const app = clerkMiddleware(async (auth, req) => {
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

/** Resolved once: `NEXT_PUBLIC_*` is inlined at build time, so this is a
 *  constant by the time the proxy is deployed. */
const PLAYER_HOST = playerHost();

/**
 * Two hostnames, one deployment.
 *
 * Which host a request arrived on decides everything: the player host is
 * rewritten into `/player` and never sees Clerk, and the app host cannot
 * reach `/player` at all. Both halves matter. Running `clerkMiddleware` on
 * the player host would set Clerk's cookies *on the player origin*, handing
 * game code the session the separate origin exists to keep away from it; and
 * leaving `/player` reachable on the app host would let a game be framed
 * same-origin, where the sandbox attribute is decorative.
 *
 * With no player host configured this is a single-origin deployment (preview,
 * or a bare `next dev`) and neither branch applies — see `playerOrigin`.
 */
export default async function proxy(req: NextRequest, event: NextFetchEvent) {
  if (PLAYER_HOST) {
    if (req.headers.get("host") === PLAYER_HOST) {
      const url = req.nextUrl.clone();
      url.pathname = `${PLAYER_PATH_PREFIX}${url.pathname}`;
      return NextResponse.rewrite(url);
    }

    if (req.nextUrl.pathname.startsWith(PLAYER_PATH_PREFIX)) {
      return new NextResponse(null, { status: 404 });
    }
  }

  return app(req, event);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
