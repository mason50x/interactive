"use client";

import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import { useMemo, useState, type FormEvent } from "react";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { LineChart } from "@/components/dither-kit/area-chart";
import { Line } from "@/components/dither-kit/area";
import { Bar } from "@/components/dither-kit/bar";
import { BarChart } from "@/components/dither-kit/bar-chart";
import { Legend } from "@/components/dither-kit/legend";
import { Pie } from "@/components/dither-kit/pie";
import { PieChart } from "@/components/dither-kit/pie-chart";
import { Tooltip } from "@/components/dither-kit/tooltip";
import { XAxis } from "@/components/dither-kit/x-axis";
import { YAxis } from "@/components/dither-kit/y-axis";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useAuthedQuery } from "@/lib/use-authed-query";
import { cn } from "@/lib/utils";

type Topic = FunctionReturnType<typeof api.votes.list>[number];
type Ballot = NonNullable<
  FunctionReturnType<typeof api.votes.results>
>["ballots"][number];

const CONFIG = {
  yes: { label: "Yes", color: "green" },
  no: { label: "No", color: "red" },
} as const;

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ConvexError && typeof error.data === "string"
    ? error.data
    : fallback;
}

function RaiseVote() {
  const create = useMutation(api.votes.create);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [forced, setForced] = useState(true);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{
    message: string;
    error?: boolean;
  } | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setFeedback(null);
    try {
      await create({ title, description, forced });
      setFeedback({ message: `Raised “${title.trim()}”.` });
      setTitle("");
      setDescription("");
    } catch (error) {
      setFeedback({
        error: true,
        message: errorMessage(error, "Couldn't raise the vote."),
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-xl border border-border p-4 page-sm:p-5"
    >
      <h2 className="font-medium">Raise a vote</h2>
      <Input
        aria-label="Title"
        placeholder="Title, e.g. Add a weekend playtime bonus?"
        maxLength={120}
        required
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <Textarea
        aria-label="Description"
        placeholder="What it means, and what changes if it passes"
        maxLength={1000}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex cursor-pointer items-center gap-2.5 text-sm">
          <Switch checked={forced} onCheckedChange={setForced} />
          <span>
            Force
            <span className="block text-xs text-muted-foreground">
              {forced
                ? "Playtime is held until each member votes."
                : "Members are asked, but can keep playing."}
            </span>
          </span>
        </label>
        <Button type="submit" disabled={pending || !title.trim()}>
          {pending ? "Raising…" : "Raise vote"}
        </Button>
      </div>
      {feedback && (
        <p
          role={feedback.error ? "alert" : "status"}
          className={cn(
            "text-sm",
            feedback.error ? "text-destructive" : "text-success",
          )}
        >
          {feedback.message}
        </p>
      )}
    </form>
  );
}

function TopicRow({
  topic,
  selected,
  onSelect,
}: {
  topic: Topic;
  selected: boolean;
  onSelect: () => void;
}) {
  const setForced = useMutation(api.votes.setForced);
  const setClosed = useMutation(api.votes.setClosed);
  const remove = useMutation(api.votes.remove);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(errorMessage(caught, "That didn't work. Try again."));
    }
  }

  const total = topic.yes + topic.no;
  const yesShare = total ? topic.yes / total : 0;

  return (
    <li
      className={cn(
        "border-b border-border last:border-0",
        selected && "bg-muted/50",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 page-sm:px-5">
        <button
          type="button"
          aria-expanded={selected}
          onClick={onSelect}
          className="min-w-0 flex-1 cursor-pointer rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="block truncate font-medium">{topic.title}</span>
          <span className="mt-1 flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className={cn(
                  "size-1.5 rounded-full",
                  topic.closed ? "bg-muted-foreground" : "bg-success",
                )}
              />
              {topic.closed ? "Closed" : "Open"}
            </span>
            <span aria-hidden>·</span>
            <span className="text-green-600">{topic.yes} yes</span>
            <span className="text-red-600">{topic.no} no</span>
            {/* A sliver of the split, so the list reads at a glance. */}
            <span
              aria-hidden
              className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-muted page-sm:flex"
            >
              {total > 0 && (
                <>
                  <span
                    className="h-full bg-green-600"
                    style={{ width: `${yesShare * 100}%` }}
                  />
                  <span className="h-full flex-1 bg-red-600" />
                </>
              )}
            </span>
          </span>
        </button>

        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch
            checked={topic.forced}
            disabled={topic.closed}
            onCheckedChange={(forced) =>
              void run(() => setForced({ id: topic._id, forced }))
            }
          />
          Force
        </label>

        <div className="flex whitespace-nowrap">
          {confirming ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() =>
                  void run(async () => {
                    if (!(await remove({ id: topic._id })))
                      setError("Closed it; delete again to finish.");
                  })
                }
              >
                Delete
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirming(false)}
              >
                Keep
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  void run(() =>
                    setClosed({ id: topic._id, closed: !topic.closed }),
                  )
                }
              >
                {topic.closed ? "Reopen" : "Close"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirming(true)}
              >
                Delete
              </Button>
            </>
          )}
        </div>
      </div>
      {error && (
        <p
          role="alert"
          className="px-4 pb-3 text-xs text-destructive page-sm:px-5"
        >
          {error}
        </p>
      )}
      {selected && <Results topic={topic} />}
    </li>
  );
}

const STEPS = [
  { ms: 60_000, label: (d: Date) => time(d) },
  { ms: 5 * 60_000, label: (d: Date) => time(d) },
  { ms: 15 * 60_000, label: (d: Date) => time(d) },
  { ms: 60 * 60_000, label: (d: Date) => time(d) },
  { ms: 6 * 60 * 60_000, label: (d: Date) => `${day(d)} ${time(d)}` },
  { ms: 24 * 60 * 60_000, label: (d: Date) => day(d) },
  { ms: 7 * 24 * 60 * 60_000, label: (d: Date) => day(d) },
];
const MAX_BUCKETS = 24;

function time(d: Date) {
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}
function day(d: Date) {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Ballots in even time buckets from the topic's opening to its last ballot:
 * the per-bucket count for the bars, the running total for the lines. The
 * bucket is the smallest step that keeps the axis to two dozen points.
 */
function timeline(ballots: Ballot[], openedAt: number) {
  const end = Math.max(openedAt + 60_000, ...ballots.map((b) => b.at));
  const step =
    STEPS.find((s) => (end - openedAt) / s.ms <= MAX_BUCKETS) ??
    STEPS[STEPS.length - 1];
  const start = Math.floor(openedAt / step.ms) * step.ms;
  const count = Math.max(1, Math.ceil((end - start + 1) / step.ms));
  const buckets = Array.from({ length: count }, (_, i) => ({
    label: step.label(new Date(start + i * step.ms)),
    yes: 0,
    no: 0,
  }));
  for (const ballot of ballots) {
    const i = Math.min(count - 1, Math.floor((ballot.at - start) / step.ms));
    buckets[i][ballot.choice] += 1;
  }
  let yes = 0;
  let no = 0;
  const running = buckets.map((bucket) => ({
    label: bucket.label,
    yes: (yes += bucket.yes),
    no: (no += bucket.no),
  }));
  return { buckets, running };
}

function Results({ topic }: { topic: Topic }) {
  const results = useAuthedQuery(api.votes.results, { topicId: topic._id });
  const series = useMemo(
    () => results && timeline(results.ballots, topic._creationTime),
    [results, topic._creationTime],
  );

  if (results === undefined)
    return (
      <p role="status" className="px-5 pb-5 text-sm text-muted-foreground">
        Loading results…
      </p>
    );
  if (results === null || !series) return null;

  const total = results.ballots.length;
  const turnout = results.eligible
    ? Math.min(100, Math.round((total / results.eligible) * 100))
    : 0;
  const split = [
    { choice: "yes", votes: topic.yes },
    { choice: "no", votes: topic.no },
  ];

  return (
    <div className="space-y-5 px-4 pb-5 page-sm:px-5">
      {topic.description && (
        <p className="text-sm whitespace-pre-line text-muted-foreground">
          {topic.description}
        </p>
      )}

      <dl className="grid grid-cols-2 gap-3 page-sm:grid-cols-4">
        {[
          { label: "Yes", value: topic.yes, tone: "text-green-600" },
          { label: "No", value: topic.no, tone: "text-red-600" },
          { label: "Ballots", value: total },
          {
            label: "Turnout",
            value: `${turnout}%`,
            hint: `${total} of ${results.eligible} members`,
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-border bg-background px-3 py-2.5"
          >
            <dt className="text-xs text-muted-foreground">{stat.label}</dt>
            <dd
              className={cn("text-2xl font-semibold tabular-nums", stat.tone)}
            >
              {stat.value}
            </dd>
            {stat.hint && (
              <dd className="text-xs text-muted-foreground">{stat.hint}</dd>
            )}
          </div>
        ))}
      </dl>

      {total === 0 ? (
        <p className="rounded-xl border border-border py-12 text-center text-sm text-muted-foreground">
          No ballots yet.
        </p>
      ) : (
        <div className="grid gap-4 page-lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <figure className="rounded-xl border border-border bg-background p-4">
            <figcaption className="mb-2 text-xs text-muted-foreground">
              Split
            </figcaption>
            <div className="h-64">
              <PieChart
                data={split}
                config={CONFIG}
                dataKey="votes"
                nameKey="choice"
                innerRadius={0.55}
                bloom="aura"
              >
                <Legend isClickable align="center" />
                <Tooltip />
                <Pie variant="gradient" />
              </PieChart>
            </div>
          </figure>

          <figure className="rounded-xl border border-border bg-background p-4">
            <figcaption className="mb-2 text-xs text-muted-foreground">
              Running total
            </figcaption>
            <div className="h-64">
              <LineChart data={series.running} config={CONFIG} bloom="low">
                <XAxis dataKey="label" />
                <YAxis />
                <Legend isClickable />
                <Tooltip labelKey="label" />
                <Line dataKey="yes" />
                <Line dataKey="no" strokeVariant="dashed" />
              </LineChart>
            </div>
          </figure>

          <figure className="rounded-xl border border-border bg-background p-4 page-lg:col-span-2">
            <figcaption className="mb-2 text-xs text-muted-foreground">
              Ballots over time
            </figcaption>
            <div className="h-56">
              <BarChart
                data={series.buckets}
                config={CONFIG}
                stackType="stacked"
                bloom="low"
              >
                <XAxis dataKey="label" />
                <YAxis />
                <Legend isClickable />
                <Tooltip labelKey="label" />
                <Bar dataKey="yes" variant="gradient" />
                <Bar dataKey="no" variant="hatched" />
              </BarChart>
            </div>
          </figure>
        </div>
      )}
    </div>
  );
}

/** CEO-only: raise topics, choose whether they hold playtime, read results. */
export function Votes() {
  const topics = useAuthedQuery(api.votes.list, {});
  const [selected, setSelected] = useState<Id<"voteTopics"> | null>(null);

  return (
    <section aria-label="Votes" className="min-w-0 space-y-5">
      <RaiseVote />
      <div className="overflow-hidden rounded-xl border border-border">
        {topics === undefined ? (
          <p
            role="status"
            className="px-5 py-14 text-center text-sm text-muted-foreground"
          >
            Loading votes…
          </p>
        ) : topics.length === 0 ? (
          <p
            role="status"
            className="px-5 py-14 text-center text-sm text-muted-foreground"
          >
            No votes yet.
          </p>
        ) : (
          <ul>
            {topics.map((topic) => (
              <TopicRow
                key={topic._id}
                topic={topic}
                selected={selected === topic._id}
                onSelect={() =>
                  setSelected((id) => (id === topic._id ? null : topic._id))
                }
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
