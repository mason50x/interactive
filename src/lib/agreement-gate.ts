// A client that imported this would be importing the Clerk backend helpers
// and a Convex fetch that expects a minted token, neither of which mean
// anything in a browser. The gate is a server fact; this is what keeps it one.
import "server-only";

import { auth } from "@clerk/nextjs/server";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import { fetchQuery } from "convex/nextjs";
import type { Agreement } from "@/lib/agreement";
import { api } from "../../convex/_generated/api";

/**
 * The server's answer to "may this account open an activity", asked before
 * anything is handed out.
 *
 * The rail's card and the locked tiles are the part people see; this is the
 * part that decides. Both activity routes call it — the dashboard page that
 * frames an activity, and `/learn/<slug>`, which is where the bundle URL is
 * actually resolved — because a URL typed into the address bar reaches the
 * second one without ever rendering the first.
 *
 * It costs one Convex query per activity load. That is the same shape as the
 * `auth.protect()` already on those routes: a check that has to be made on the
 * server for it to mean anything, made where the thing being protected is.
 */
export async function hasAgreed(): Promise<boolean> {
  return (await serverAgreement())?.agreed ?? false;
}

/**
 * The same answer, whole, for the dashboard layout to hand to the rail.
 *
 * The card and the tiles are subscribed to this through Convex, but that
 * subscription cannot say anything until Clerk has booted in the browser and
 * handed the client a token — seconds, on a cold load — and for those seconds
 * the rail has nothing to draw. Rendering it from here means the first paint
 * is already correct and the subscription only ever confirms it.
 *
 * `null` is "not known", and it covers both the case with no session — which
 * the layout's `auth.protect()` has already ruled out by the time this is
 * called — and the case where Clerk could not be asked. `hasAgreed` reads that
 * as "has not agreed", which is the right way for a gate to fail.
 */
export async function serverAgreement(): Promise<Agreement | null> {
  const { userId, getToken } = await auth();
  if (!userId) return null;

  // Convex needs the caller's identity and a server component is not a Convex
  // client, so this mints a token from the same `convex` JWT template the
  // browser client uses. `src/lib/invite-actions.ts` does the same for the
  // same reason.
  //
  // This is the only network call in the layout's render, and it is a call to
  // Clerk, which means it is the one thing here that can fail for reasons that
  // have nothing to do with this account: a session revoked a second ago and
  // still passing `auth.protect()` on its cached cookie, or Clerk itself being
  // slow. Neither is worth a dead dashboard. What this read buys is a correct
  // first frame, and `null` is the state the rail was already built to sit in
  // while the subscription catches up — so a Clerk failure costs the seconds
  // it was saving and nothing else. See `AgreementProvider`.
  let token: string | null = null;
  try {
    token = await getToken({ template: "convex" });
  } catch (error) {
    // Loud, because one of the things this hides is a missing `convex`
    // template, and a deployment misconfigured that way would otherwise show
    // up only as every account quietly failing to have agreed to anything.
    console.error("Clerk would not mint a convex token:", clerkDetail(error));
    return null;
  }

  if (!token) return null;

  return await fetchQuery(api.agreement.mine, {}, { token });
}

/**
 * The part of a Clerk failure worth putting in a log.
 *
 * `ClerkAPIResponseError` carries its text in `errors[0]` and leaves its own
 * `message` empty, which is why an uncaught one surfaces in the Next overlay
 * as "no message was provided".
 */
function clerkDetail(error: unknown): string {
  if (isClerkAPIResponseError(error)) {
    const first = error.errors[0];
    const text = first?.longMessage ?? first?.message ?? "no detail";
    return `${error.status} ${first?.code ?? "unknown"} — ${text}`;
  }

  return String(error);
}
