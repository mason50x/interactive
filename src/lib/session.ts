import "server-only";

import { auth } from "@clerk/nextjs/server";
import { cache } from "react";

/**
 * `auth.protect()`, once per request.
 *
 * Every layout and page in the signed-in app guards itself, because the
 * router does not re-render a shared layout between sibling navigations
 * (see `src/app/(app)/layout.tsx`). On a full page load that is three or
 * four calls down one tree: the app shell, a section layout, the page, and
 * sometimes its `generateMetadata`. Each call is not free — Clerk reads the
 * request headers again, re-verifies the middleware's HMAC over the session
 * token, decodes the JWT again, and probes the filesystem for its own error
 * message — and on a Worker every one of those is CPU time on the same
 * request.
 *
 * React's `cache` keys the memo on the request, so the first caller does the
 * work and the rest of the tree gets the same promise. It does not weaken
 * the check: a signed-out request rejects for every caller exactly as it
 * did, and nothing is retained past the request.
 */
export const protectPage = cache(async () => auth.protect());
