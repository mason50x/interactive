"use client";

import { api } from "@convex/_generated/api";
import { useAuthedQuery } from "@/lib/use-authed-query";
import "./voting-nav.css";

/** Imported only by the development navigation catalogue. */
export function VotingBadge() {
  const unread = useAuthedQuery(api.voting.unread, {});
  if (!unread) return null;
  return (
    <span
      role="status"
      aria-label="New nominations"
      className="absolute top-2.5 right-2 size-2 rounded-full bg-primary wide:top-1/2 wide:right-3 wide:-translate-y-1/2"
    />
  );
}
