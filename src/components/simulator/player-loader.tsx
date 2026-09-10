"use client";

import dynamic from "next/dynamic";
import { useAuth } from "@clerk/nextjs";
import { useConvexAuth } from "convex/react";
import { CenteredSpinner } from "@/components/ui/spinner";
import type { Builtin } from "@/lib/simulator/types";

// The engine is a WebAssembly bundle with no business on the server, so the
// player is loaded on the client only, once the route is reached.
const Player = dynamic(() => import("./player"), {
  ssr: false,
  loading: () => <CenteredSpinner />,
});

/**
 * The gate in front of the Game Boy player.
 *
 * The player opens a cloud sync the moment it mounts, so it must not mount
 * until Clerk has the user and Convex has accepted the token — the two
 * arrive a beat apart, and a session started between them would begin by
 * failing. The `key` remounts the player when either the account or the
 * program changes, which is what makes the session below it a plain
 * component with an `owner` it can treat as fixed.
 */
export function PlayerLoader(props: {
  contentHash: string;
  builtin: Builtin | null;
}) {
  const { userId } = useAuth();
  const { isAuthenticated } = useConvexAuth();
  if (!userId || !isAuthenticated) return <CenteredSpinner />;
  return (
    <Player key={`${userId}:${props.contentHash}`} owner={userId} {...props} />
  );
}
