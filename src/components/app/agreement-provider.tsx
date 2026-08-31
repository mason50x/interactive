"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { createContext, use, type ReactNode } from "react";
import type { Agreement } from "@/lib/agreement";
import { api } from "../../../convex/_generated/api";

/** `null` is "not known yet", which is not the same as "has not agreed". */
const AgreementContext = createContext<Agreement | null>(null);

/**
 * Whether this account has accepted the terms. `null` until it is known.
 *
 * Read by the rail's card and by all 318 tiles in the catalogue, which is why
 * it is a context read rather than a subscription each: one query, one
 * subscriber, and a value the tiles already have on their first render.
 *
 * The `null` matters. Anything deciding to *refuse* on this must test
 * `agreed === false` and not `!agreed`, or it will refuse for the moment
 * before the answer exists.
 */
export function useAgreement() {
  return use(AgreementContext);
}

/**
 * The acceptance, rendered on the server and then kept live.
 *
 * Two sources, in that order, and the order is the whole point. The layout has
 * a session and can ask Convex directly (`serverAgreement`), so the rail is
 * painted correct on the first frame. The subscription underneath cannot
 * answer at all until Clerk has booted in the browser and handed the Convex
 * client a token, which on a cold load is seconds — and for those seconds the
 * old arrangement had the card asking an account that had already agreed to
 * agree again, and the catalogue drawing every tile unlocked.
 *
 * The query is skipped rather than run while that token is in flight. Run, it
 * answers `null` — meaning nobody is signed in — and `null` is an *answer*,
 * indistinguishable from a settled one. That was the bug.
 *
 * Once the subscription is live it wins, which is what makes the card
 * disappear the moment the acceptance lands rather than on the next reload.
 */
export function AgreementProvider({
  initial,
  children,
}: {
  initial: Agreement | null;
  children: ReactNode;
}) {
  const { isAuthenticated } = useConvexAuth();
  const live = useQuery(api.agreement.mine, isAuthenticated ? {} : "skip");

  return (
    <AgreementContext value={live ?? initial}>{children}</AgreementContext>
  );
}
