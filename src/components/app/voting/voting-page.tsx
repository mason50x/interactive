"use client";

import { useEffect, useState } from "react";
import { useConvexAuth, useMutation, usePaginatedQuery } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import { api } from "@convex/_generated/api";
import {
  CheckIcon,
  ChevronDownIcon,
  EllipsisHorizontalIcon,
  EnvelopeIcon,
  PlusIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Page, PageDescription, PageTitle } from "@/components/ui/page";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { useAuthedQuery } from "@/lib/hooks/use-authed-query";
import { approveNomination } from "@/lib/server/voting-actions";

type Nomination = FunctionReturnType<typeof api.voting.list>["page"][number];
const errorMessage = (error: unknown) =>
  error instanceof ConvexError
    ? String(error.data)
    : "Something went wrong. Please try again.";

export function VotingPage() {
  const { isAuthenticated } = useConvexAuth();
  const create = useMutation(api.voting.create);
  const markRead = useMutation(api.voting.markRead);
  const approvals = useAuthedQuery(api.voting.approvals, {});
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [nominateOpen, setNominateOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(5);
  const open = usePaginatedQuery(
    api.voting.list,
    isAuthenticated ? { status: "open" } : "skip",
    { initialNumItems: 5 },
  );
  const newest = open.results[0]?.createdAt ?? 0;

  useEffect(() => {
    if (!isAuthenticated) return;
    // A snapshot at entry plus the newest rendered nomination: a later arrival
    // cannot be cleared by a delayed request for an earlier page.
    void markRead({ through: Math.max(Date.now(), newest) }).catch(
      () => undefined,
    );
  }, [isAuthenticated, markRead, newest]);

  return (
    <Page className="max-w-5xl">
      <header className="space-y-3">
        <PageTitle>Voting</PageTitle>
        <PageDescription>Help decide who joins Interactive.</PageDescription>
      </header>

      {Boolean(approvals?.length) && (
        <section aria-label="Admin approvals" className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold">Ready for your approval</h2>
            <p className="text-sm text-muted-foreground">
              Admin only · Review the address, then approve and send.
            </p>
          </div>
          {approvals!.map((nomination) => (
            <NominationCard
              key={nomination.id}
              nomination={nomination}
              approval
            />
          ))}
        </section>
      )}

      <section aria-label="Open nominations" className="space-y-4">
        <h2 className="text-xl font-semibold">Open nominations</h2>
        <Sheet open={nominateOpen} onOpenChange={setNominateOpen}>
          <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card radius="md" className="min-w-0 overflow-hidden">
              <SheetTrigger className="flex h-full min-h-64 w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl p-6 text-primary transition-colors outline-none hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
                <PlusIcon className="size-9" />
                <span className="font-semibold">Add nomination</span>
              </SheetTrigger>
            </Card>
            {open.results.slice(0, visibleCount).map((nomination) => (
              <NominationCard key={nomination.id} nomination={nomination} />
            ))}
          </div>
          <SheetContent className="overflow-y-auto">
            <SheetHeader className="pr-12">
              <SheetTitle>Nominate someone</SheetTitle>
              <SheetDescription>
                Your nomination counts as your yes vote.
              </SheetDescription>
            </SheetHeader>
            <form
              className="flex flex-col gap-5 px-4 pb-4"
              onSubmit={async (event) => {
                event.preventDefault();
                if (busy) return;
                setBusy(true);
                setError(null);
                setNotice("");
                try {
                  await create({ name, email });
                  setName("");
                  setEmail("");
                  setNominateOpen(false);
                  setNotice("Nomination submitted. Your yes vote is counted.");
                } catch (error) {
                  setError(errorMessage(error));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label className="space-y-2 text-sm font-medium">
                Full name
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  minLength={2}
                  maxLength={100}
                  placeholder="Who would you like to invite?"
                  autoComplete="off"
                />
              </label>
              <label className="space-y-2 text-sm font-medium">
                Email address
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  maxLength={254}
                  placeholder="their@email.com"
                  autoComplete="off"
                />
              </label>
              <Button
                type="submit"
                size="lg"
                disabled={busy || !isAuthenticated}
              >
                {busy ? "Submitting…" : "Nominate"}
              </Button>
            </form>
            {error && (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {error}
              </p>
            )}
          </SheetContent>
        </Sheet>
        {notice && (
          <p role="status" className="text-sm text-primary">
            {notice}
          </p>
        )}
        {open.status === "LoadingFirstPage" && (
          <p
            role="status"
            className="text-center text-sm text-muted-foreground"
          >
            Loading nominations…
          </p>
        )}
        {(open.results.length > visibleCount ||
          open.status === "CanLoadMore" ||
          open.status === "LoadingMore") && (
          <div className="flex justify-center pt-2">
            <Button
              variant="outline"
              disabled={open.status === "LoadingMore"}
              onClick={() => {
                const nextCount = visibleCount + 6;
                setVisibleCount(nextCount);
                if (
                  open.results.length < nextCount &&
                  open.status === "CanLoadMore"
                )
                  open.loadMore(nextCount - open.results.length);
              }}
            >
              {open.status === "LoadingMore" ? "Loading…" : "Show more"}
              <ChevronDownIcon />
            </Button>
          </div>
        )}
      </section>

      <details
        className="group border-t border-border pt-6"
        onToggle={(event) => setHistoryOpen(event.currentTarget.open)}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between text-xl font-semibold [&::-webkit-details-marker]:hidden">
          Accepted or Rejected
          <ChevronDownIcon className="size-5 transition-transform group-open:rotate-180" />
        </summary>
        <p className="mt-2 text-sm text-muted-foreground">
          Past votes stay here unless deleted. Rejected people can be nominated
          again after three days.
        </p>
        {historyOpen && <History />}
      </details>
    </Page>
  );
}

function History() {
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

function NominationCard({
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
