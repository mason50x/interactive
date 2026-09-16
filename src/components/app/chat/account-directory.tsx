"use client";

import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import { Monogram } from "@/components/app/chat/monogram";
import { Button } from "@/components/ui/button";
import { CHAT_HREF } from "@/lib/nav";
import { openDmError } from "@/lib/chat";
import { useDebounced } from "@/lib/use-debounced";

/** Existing DMs are above; every other account can be opened directly here. */
export function AccountDirectory({
  exclude,
  term,
}: {
  exclude: ReadonlySet<string>;
  term: string;
}) {
  const router = useRouter();
  const openDm = useMutation(api.chat.conversations.openDm);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const search = useDebounced(term.trim(), 150);
  const searching = search.length >= 2;
  const directory = usePaginatedQuery(
    api.chat.accounts.directory,
    searching ? "skip" : {},
    { initialNumItems: 50 },
  );
  const hits = useQuery(
    api.chat.accounts.search,
    searching ? { term: search } : "skip",
  );
  const people = (searching ? (hits ?? []) : directory.results).filter(
    (person) =>
      !exclude.has(person.clerkId) &&
      (searching ||
        !search ||
        `${person.handle} ${person.displayName ?? ""}`
          .toLowerCase()
          .includes(search.toLowerCase())),
  );
  async function message(clerkId: string) {
    if (busy) return;
    setBusy(clerkId);
    setError(null);
    try {
      const result = await openDm({ peerClerkId: clerkId });
      if (result.ok) router.push(`${CHAT_HREF}/${result.conversationId}`);
      else setError(openDmError(result.reason));
    } catch {
      setError("Could not open this conversation. Please try again.");
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="px-2">
      <ul className="flex flex-col gap-0.5">
        {people.map((person) => (
          <li key={person.clerkId}>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void message(person.clerkId)}
              className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-foreground/[0.06] disabled:opacity-60"
              aria-label={`Message ${person.displayName || person.handle}`}
            >
              <Monogram handle={person.handle} imageUrl={person.avatarUrl} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.9375rem] font-medium">
                  {person.displayName || person.handle}
                </span>
                <span className="block truncate text-[0.75rem] text-faint">
                  @{person.handle}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {error ? (
        <p role="alert" className="px-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {!searching && directory.status === "CanLoadMore" ? (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 w-full"
          onClick={() => directory.loadMore(50)}
        >
          Show more people
        </Button>
      ) : null}
      {(!searching &&
        (directory.status === "LoadingFirstPage" ||
          directory.status === "LoadingMore")) ||
      (searching && hits === undefined) ? (
        <p role="status" className="px-2 py-2 text-sm text-muted-foreground">
          Loading people…
        </p>
      ) : null}
    </div>
  );
}
