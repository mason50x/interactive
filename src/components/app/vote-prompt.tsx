"use client";

import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useEffect, useState } from "react";
import {
  CheckIcon,
  HandRaisedIcon,
  XMarkIcon,
} from "@heroicons/react/24/solid";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAuthedQuery } from "@/lib/use-authed-query";
import { cn } from "@/lib/utils";

/**
 * The member's side of a vote: a card in the rail while any topic waits on
 * them, and a sheet that asks each one in turn with two big buttons. Once the
 * last ballot lands the query comes back empty and both go away on their own.
 *
 * A forced topic opens the sheet by itself, once per topic per page load.
 * Closing it is allowed — chat still works — but play stays held on the
 * server until the vote is in. See `convex/votes.ts`.
 */
const NONE: never[] = [];

function usePending() {
  return useAuthedQuery(api.votes.pending, {});
}

function VoteSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const loaded = usePending();
  const pending = loaded ?? NONE;
  const cast = useMutation(api.votes.cast);
  const [casting, setCasting] = useState<Id<"voteTopics"> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const topic = pending[0];
  // The last ballot empties the list; that is the sheet's cue to go.
  const done = loaded !== undefined && loaded.length === 0;
  useEffect(() => {
    if (open && done) onOpenChange(false);
  }, [open, done, onOpenChange]);

  async function vote(choice: "yes" | "no") {
    if (!topic || casting) return;
    setCasting(topic._id);
    setError(null);
    try {
      await cast({ topicId: topic._id, choice });
    } catch (caught) {
      setError(
        caught instanceof ConvexError && typeof caught.data === "string"
          ? caught.data
          : "Couldn't record your vote. Try again.",
      );
    } finally {
      setCasting(null);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        {topic ? (
          <>
            <SheetHeader className="pr-12">
              <p className="text-xs text-muted-foreground tabular-nums">
                {pending.length > 1 ? `Vote 1 of ${pending.length}` : "Vote"}
              </p>
              <SheetTitle className="text-xl font-semibold">
                {topic.title}
              </SheetTitle>
              {topic.description && (
                <SheetDescription className="mt-1 whitespace-pre-line">
                  {topic.description}
                </SheetDescription>
              )}
              {topic.forced && (
                <p className="mt-2 text-sm font-medium text-destructive">
                  Playtime is paused until you vote.
                </p>
              )}
            </SheetHeader>
            <SheetFooter>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={casting !== null}
                  onClick={() => void vote("yes")}
                  className="flex h-32 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl bg-green-600 text-2xl font-semibold text-white transition-[background-color,transform] outline-none hover:bg-green-700 focus-visible:ring-4 focus-visible:ring-green-600/40 active:translate-y-px disabled:opacity-60"
                >
                  <CheckIcon aria-hidden className="size-9" />
                  Yes
                </button>
                <button
                  type="button"
                  disabled={casting !== null}
                  onClick={() => void vote("no")}
                  className="flex h-32 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl bg-red-600 text-2xl font-semibold text-white transition-[background-color,transform] outline-none hover:bg-red-700 focus-visible:ring-4 focus-visible:ring-red-600/40 active:translate-y-px disabled:opacity-60"
                >
                  <XMarkIcon aria-hidden className="size-9" />
                  No
                </button>
              </div>
            </SheetFooter>
          </>
        ) : (
          <SheetTitle className="sr-only">Vote</SheetTitle>
        )}
      </SheetContent>
    </Sheet>
  );
}

const DECK_DEPTH = 3;
/** A red wash over the shell's surface, so a held vote reads before its words. */
const FORCED_CARD =
  "border-red-500/40 bg-[color-mix(in_oklab,var(--color-red-500)_8%,var(--surface))]";

/**
 * The rail's cards, above the schedule, playtime and account row: one per
 * waiting topic, forced ones on top, stacked into a deck so any number of
 * them costs the rail one card's height and a sliver per card behind it.
 */
export function VoteRailCard() {
  const pending = usePending() ?? NONE;
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState<ReadonlySet<string>>(() => new Set());
  const unseenForced = pending.filter(
    (topic) => topic.forced && !shown.has(topic._id),
  );
  if (unseenForced.length > 0) {
    setShown(new Set([...shown, ...unseenForced.map((topic) => topic._id)]));
    if (!open) setOpen(true);
  }
  if (pending.length === 0)
    return <VoteSheet open={false} onOpenChange={setOpen} />;

  const deck = pending.slice(0, DECK_DEPTH);
  const top = deck[0];
  const forced = pending.some((topic) => topic.forced);
  const heading = (topic: (typeof pending)[number]) =>
    topic.forced ? "Vote to keep playing" : "New vote";

  return (
    <>
      {/* Icons only below `wide`, like every other row in the rail. */}
      <div className="mb-2 ml-3 flex justify-center wide:hidden">
        <Button
          variant="ghost"
          size="icon-lg"
          aria-label={`${heading(top)}: ${pending.length} waiting`}
          title={heading(top)}
          onClick={() => setOpen(true)}
          className="relative"
        >
          <HandRaisedIcon aria-hidden className="size-5" />
          <span
            aria-hidden
            className={cn(
              "absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[0.625rem] leading-none font-semibold text-white tabular-nums",
              forced ? "bg-red-500" : "bg-primary",
            )}
          >
            {pending.length}
          </span>
        </Button>
      </div>

      {/* The cards behind peek out above the front one, each a step
          narrower, so the deck reads as a pile at a glance. */}
      <div
        className="relative mb-2 ml-3 hidden wide:block"
        style={{ paddingTop: `${(deck.length - 1) * 0.375}rem` }}
      >
        {deck
          .slice(1)
          .reverse()
          .map((topic, index, behind) => {
            const depth = behind.length - index;
            return (
              <Card
                key={topic._id}
                aria-hidden
                radius="sm"
                className={cn(
                  "absolute inset-x-0 bottom-0 origin-top bg-surface transition-transform duration-300",
                  topic.forced && FORCED_CARD,
                )}
                style={{
                  top: `${(deck.length - 1 - depth) * 0.375}rem`,
                  scale: `${1 - depth * 0.05} 1`,
                  opacity: 1 - depth * 0.25,
                }}
              />
            );
          })}
        <Card
          key={top._id}
          radius="sm"
          className={cn(
            "relative space-y-2 bg-surface px-3 py-2.5 shadow-sm",
            top.forced && FORCED_CARD,
          )}
        >
          <p
            className={cn(
              "flex items-center gap-1.5 text-xs font-medium",
              top.forced ? "text-red-500" : "text-primary",
            )}
          >
            <span className="relative flex size-2 shrink-0">
              <span className="absolute inset-0 animate-ping rounded-full bg-current opacity-70 [animation-duration:2.4s]" />
              <span className="relative size-2 rounded-full bg-current" />
            </span>
            {heading(top)}
            {pending.length > 1 && (
              <span className="ml-auto text-muted-foreground tabular-nums">
                1 of {pending.length}
              </span>
            )}
          </p>
          <p className="line-clamp-2 text-sm font-medium text-foreground">
            {top.title}
          </p>
          <Button size="sm" className="w-full" onClick={() => setOpen(true)}>
            {pending.length > 1 ? `Vote on ${pending.length}` : "Vote"}
          </Button>
        </Card>
      </div>
      <VoteSheet open={open} onOpenChange={setOpen} />
    </>
  );
}

/** Stands in for a player while a forced vote holds playtime. */
export function VoteBlocked() {
  const [open, setOpen] = useState(false);
  return (
    <section
      role="status"
      className="flex min-h-full items-center justify-center bg-surface p-6 text-foreground page-sm:p-10"
    >
      <div className="w-full max-w-lg space-y-5">
        <h1 className="text-3xl font-semibold">Vote to keep playing</h1>
        <p>
          There&apos;s a vote waiting on you. Answer it and your playtime picks
          up where it left off.
        </p>
        <Button onClick={() => setOpen(true)}>Vote now</Button>
      </div>
      <VoteSheet open={open} onOpenChange={setOpen} />
    </section>
  );
}
