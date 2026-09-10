"use client";

import dynamic from "next/dynamic";
import { useAuth } from "@clerk/nextjs";
import { CenteredSpinner } from "@/components/ui/spinner";

// Loaded on the client only: the player reads IndexedDB and builds a
// sandboxed document, neither of which the server can do or should try.
const Player = dynamic(() => import("./html-player"), {
  ssr: false,
  loading: () => <CenteredSpinner />,
});

/**
 * The gate in front of the HTML player, the twin of `PlayerLoader`.
 *
 * It waits for Clerk's user and no more: the HTML player works from the
 * device store and only registers its name with the account when Convex
 * happens to be ready, so holding it for the Convex token would delay a
 * page that does not need it. The `key` remounts the player when the
 * account or the program changes.
 */
export function HtmlPlayerLoader({ contentHash }: { contentHash: string }) {
  const { userId } = useAuth();
  if (!userId) return <CenteredSpinner />;
  return (
    <Player
      key={`${userId}:${contentHash}`}
      owner={userId}
      contentHash={contentHash}
    />
  );
}
