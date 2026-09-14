import {
  useConvexAuth,
  useQuery,
  type OptionalRestArgsOrSkip,
} from "convex/react";
import type { FunctionReference, OptionalRestArgs } from "convex/server";

/**
 * `useQuery`, asked only once Convex has the session.
 *
 * Every query behind the sign-in reads `ctx.auth.getUserIdentity()` and
 * throws without it, and the Clerk token reaches the Convex client a beat
 * after the page mounts. Skipping until `isAuthenticated` is the difference
 * between a subscription that starts clean and one that fails once, logs, and
 * then starts. This is that skip, in one place, so the condition is not typed
 * beside every query that needs it.
 *
 * The result is `undefined` while skipped, the same as while loading, which is
 * the state callers already hold space for.
 */
export function useAuthedQuery<Query extends FunctionReference<"query">>(
  query: Query,
  ...args: OptionalRestArgs<Query>
): Query["_returnType"] | undefined {
  const { isAuthenticated } = useConvexAuth();
  const rest = (
    isAuthenticated ? args : ["skip"]
  ) as OptionalRestArgsOrSkip<Query>;
  return useQuery(query, ...rest);
}
