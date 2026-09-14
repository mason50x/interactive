"use client";

import { useAuthedQuery } from "@/lib/hooks/use-authed-query";
import { api } from "@convex/_generated/api";

/**
 * The allowance, live.
 *
 * `null` is "no numbers yet" — the state the card draws as a bare rail with no
 * count beside it — and it covers both of the ways there can be none.
 *
 * The query is skipped until Clerk's token has actually reached the Convex
 * client rather than run and answered `null` for "nobody is signed in". The
 * card waits for authentication before fetching its allowance, which is
 * why the card can sit on its skeleton for a moment before the pips arrive.
 */
export function useInvites() {
  return useAuthedQuery(api.invites.mine, {}) ?? null;
}
