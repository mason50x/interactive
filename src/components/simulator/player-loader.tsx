"use client";

import { PlaytimeGate } from "@/components/app/experience-quota";
import dynamic from "next/dynamic";
import { useState } from "react";
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
 *
 * Once the player is up it stays up for that account. Convex drops back to
 * unauthenticated for a moment whenever it re-checks a token — as it does
 * when you come back to the tab — and unmounting on that would throw away
 * the running game.
 */
export function PlayerLoader(props: {
  contentHash: string;
  builtin: Builtin | null;
}) {
  const { userId } = useAuth();
  const { isAuthenticated } = useConvexAuth();
  const [readyFor, setReadyFor] = useState<string | null>(null);
  if (userId && isAuthenticated && readyFor !== userId) setReadyFor(userId);
  if (!userId || readyFor !== userId) return <CenteredSpinner />;
  return (
    <PlaytimeGate>
      <Player
        key={`${userId}:${props.contentHash}`}
        owner={userId}
        {...props}
      />
    </PlaytimeGate>
  );
}
