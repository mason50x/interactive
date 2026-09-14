"use client";

import { useEffect, useState } from "react";
import { useConvexAuth, useMutation, usePaginatedQuery } from "convex/react";
import { ChevronDownIcon, PlusIcon } from "@heroicons/react/24/outline";
import { History } from "@/components/app/voting/history";
import {
  errorMessage,
  NominationCard,
} from "@/components/app/voting/nomination-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Page, PageDescription, PageTitle } from "@/components/ui/page";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useAuthedQuery } from "@/lib/hooks/use-authed-query";
import { api } from "@convex/_generated/api";

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
