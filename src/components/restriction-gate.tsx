"use client";

import { Component, useState, type ReactNode } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { ConvexError } from "convex/values";

import { api } from "@convex/_generated/api";
import { RESTRICTED_ERROR } from "@convex/restrictionState";
import { RestrictionScreen } from "@/components/app/restriction-screen";

/**
 * Swallows the error every guarded Convex function throws for a restricted
 * account. A query further down can hear the refusal a beat before the gate's
 * own subscription does; without this, that beat is a crashed page instead of
 * the screen. Anything else is rethrown to the boundary above.
 */
class RestrictedBoundary extends Component<
  { children: ReactNode },
  { error: unknown }
> {
  state: { error: unknown } = { error: null };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (error instanceof ConvexError && error.data === RESTRICTED_ERROR)
      return null;
    throw error;
  }
}

/**
 * Puts a restricted account behind its screen, in place of the whole tree —
 * the providers included, so nothing underneath is left subscribing to
 * functions that now refuse it. The server is what actually shuts the account
 * out (see `convex/functions.ts`); this only shows them which way.
 */
export function RestrictionGate({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  // Plain `useQuery`, not `useAuthedQuery`: subscribed from the first render
  // (it answers `null` signed out), so when the session reaches Convex it is
  // re-run in the same batch as every other early subscription — notably
  // `preferences.mine` — instead of a beat after them. Subscribing late let
  // those hear the refusal first.
  const latest = useQuery(api.restrictions.mine);
  // Hold the last answer through a session re-check, as `TimeoutGate` does,
  // so the screen doesn't drop out for a moment on returning to the tab.
  const [settled, setSettled] = useState(latest);
  if (latest !== undefined && latest !== settled) setSettled(latest);
  const signedOut = !isLoading && !isAuthenticated;
  const restriction = signedOut ? null : (latest ?? settled);

  if (restriction) return <RestrictionScreen restriction={restriction} />;
  return <RestrictedBoundary>{children}</RestrictedBoundary>;
}
