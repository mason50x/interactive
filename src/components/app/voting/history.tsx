"use client";

import { useState } from "react";
import { useConvexAuth, usePaginatedQuery } from "convex/react";
import { NominationCard } from "@/components/app/voting/nomination-card";
import { Button } from "@/components/ui/button";
import { api } from "@convex/_generated/api";

/** Closed nominations, accepted or rejected, loaded only once opened. */
export function History() {
  const [status, setStatus] = useState<"accepted" | "rejected">("accepted");
  const { isAuthenticated } = useConvexAuth();
  const history = usePaginatedQuery(
    api.voting.list,
    isAuthenticated ? { status } : "skip",
    { initialNumItems: 12 },
  );
  return (
    <div className="mt-5 space-y-4">
      <div className="flex gap-2" aria-label="History filter">
        {(["accepted", "rejected"] as const).map((value) => (
          <Button
            key={value}
            variant={status === value ? "primary" : "outline"}
            aria-pressed={status === value}
            onClick={() => setStatus(value)}
          >
            {value === "accepted" ? "Accepted" : "Rejected"}
          </Button>
        ))}
      </div>
      {history.status === "LoadingFirstPage" ? (
        <p role="status">Loading history…</p>
      ) : !history.results.length ? (
        <p className="py-4 text-sm text-muted-foreground">
          No {status} nominations yet.
        </p>
      ) : (
        history.results.map((nomination) => (
          <NominationCard key={nomination.id} nomination={nomination} />
        ))
      )}
      {history.status === "CanLoadMore" && (
        <Button variant="outline" onClick={() => history.loadMore(12)}>
          Load more history
        </Button>
      )}
    </div>
  );
}
