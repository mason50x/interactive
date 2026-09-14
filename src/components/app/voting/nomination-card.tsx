"use client";

import { useState } from "react";
import { useConvexAuth, useMutation, usePaginatedQuery } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import {
  CheckIcon,
  EllipsisHorizontalIcon,
  EnvelopeIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { approveNomination } from "@/lib/server/voting-actions";
import { api } from "@convex/_generated/api";

/** One nomination as `api.voting.list` returns it. */
export type Nomination = FunctionReturnType<
  typeof api.voting.list
>["page"][number];

/** A Convex refusal in its own words; anything else gets the generic line. */
export const errorMessage = (error: unknown) =>
  error instanceof ConvexError
    ? String(error.data)
    : "Something went wrong. Please try again.";

/**
 * One nomination: its tally, the vote buttons while it is open, and for an
 * admin the button that sends the invitation once it has passed.
 */
export function NominationCard({
  nomination: n,
  approval = false,
}: {
  nomination: Nomination;
  approval?: boolean;
}) {
  const vote = useMutation(api.voting.vote);
  const remove = useMutation(api.voting.remove);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showVoters, setShowVoters] = useState(false);
  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card radius="md" className="min-h-64 min-w-0 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold break-words">{n.name}</h3>
          {n.email && (
            <p className="mt-1 text-sm break-all text-muted-foreground">
              {n.email} <span className="text-xs">· Admin only</span>
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            {n.status === "open"
              ? "Closes"
              : n.status === "accepted"
                ? "Accepted"
                : "Rejected"}{" "}
            <time dateTime={new Date(n.closedAt ?? n.closesAt).toISOString()}>
              {new Date(n.closedAt ?? n.closesAt).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </time>
          </p>
        </div>
        {n.canDelete && (
          <Menu>
            <MenuTrigger
              aria-label={`Options for ${n.name}`}
              className="rounded-lg p-2 hover:bg-muted"
            >
              <EllipsisHorizontalIcon className="size-5" />
            </MenuTrigger>
            <MenuContent align="end">
              <MenuItem
                tone="destructive"
                disabled={busy}
                onClick={() => void run(() => remove({ nominationId: n.id }))}
              >
                Delete suggestion
              </MenuItem>
            </MenuContent>
          </Menu>
        )}
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium">
          <CheckIcon className="size-4 text-primary" />
          {n.yes} yes
        </span>
        <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <XMarkIcon className="size-4" />
          {n.no} no
        </span>
        <span className="ml-auto text-sm font-medium text-primary">
          {n.status === "open"
            ? `${Math.max(0, 5 - n.yes)} more to pass`
            : n.status === "accepted"
              ? n.delivery === "sent"
                ? "Invitation sent"
                : "Awaiting admin approval"
              : "Rejected"}
        </span>
      </div>
      <div
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"
        aria-label={`${n.yes} of 5 yes votes`}
      >
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${Math.min(100, (n.yes / 5) * 100)}%` }}
        />
      </div>
      {n.status === "open" && (
        <div className="mt-4 flex items-center gap-2">
          {n.myVote !== null ? (
            <p className="text-sm text-muted-foreground">
              You voted {n.myVote ? "yes" : "no"}. Votes are final.
            </p>
          ) : (
            <>
              <Button
                disabled={busy}
                onClick={() =>
                  void run(() => vote({ nominationId: n.id, yes: true }))
                }
              >
                <CheckIcon />
                Vote yes
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void run(() => vote({ nominationId: n.id, yes: false }))
                }
              >
                <XMarkIcon />
                Vote no
              </Button>
            </>
          )}
        </div>
      )}
      {approval && (
        <Button
          className="mt-4"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const result = await approveNomination(n.id);
              if (!result.ok) setError(result.message);
            })
          }
        >
          <EnvelopeIcon />
          {busy
            ? "Sending…"
            : n.delivery === "sending"
              ? "Check and retry delivery"
              : "Approve and send"}
        </Button>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <details
        className="mt-4 text-sm"
        onToggle={(event) => setShowVoters(event.currentTarget.open)}
      >
        <summary className="w-fit cursor-pointer text-muted-foreground">
          See votes
        </summary>
        {showVoters && <Voters nominationId={n.id} />}
      </details>
    </Card>
  );
}

function Voters({ nominationId }: { nominationId: Nomination["id"] }) {
  const { isAuthenticated } = useConvexAuth();
  const voters = usePaginatedQuery(
    api.voting.voters,
    isAuthenticated ? { nominationId } : "skip",
    { initialNumItems: 10 },
  );
  return (
    <div className="mt-3 space-y-2">
      {voters.status === "LoadingFirstPage" && (
        <p role="status">Loading votes…</p>
      )}
      <ul className="space-y-2">
        {voters.results.map((voter) => (
          <li key={voter.id} className="flex justify-between gap-3">
            <span>{voter.name}</span>
            <span className={voter.yes ? "text-primary" : "text-destructive"}>
              {voter.yes ? "Yes" : "No"}
            </span>
          </li>
        ))}
      </ul>
      {voters.status === "CanLoadMore" && (
        <Button variant="ghost" size="sm" onClick={() => voters.loadMore(10)}>
          More voters
        </Button>
      )}
    </div>
  );
}
