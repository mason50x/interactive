"use client";

import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useState } from "react";

import { api } from "@convex/_generated/api";
import { PLAYTIME_TIMEZONE } from "@config/playtime";
import { Switch } from "@/components/ui/switch";
import { useAuthedQuery } from "@/lib/use-authed-query";
import { cn } from "@/lib/utils";

type Status = FunctionReturnType<typeof api.inactivity.status>;
type Standing = Status["standings"][number];

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** A minute is fine-grained enough for a countdown in hours. */
function useMinute() {
  const [now, setNow] = useState(
    () => Math.floor(Date.now() / MINUTE) * MINUTE,
  );
  useEffect(() => {
    const timer = window.setInterval(
      () => setNow(Math.floor(Date.now() / MINUTE) * MINUTE),
      15_000,
    );
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

/** "1h 5m", "12m", "0m". */
function duration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

/** "in 2 days 4 hours", "in 3 hours 10 minutes", "in 8 minutes". */
function countdown(ms: number) {
  const plural = (n: number, unit: string) =>
    `${n} ${unit}${n === 1 ? "" : "s"}`;
  const days = Math.floor(ms / DAY);
  const hours = Math.floor((ms % DAY) / HOUR);
  const minutes = Math.max(0, Math.ceil((ms % HOUR) / MINUTE));
  if (days > 0) return `in ${plural(days, "day")} ${plural(hours, "hour")}`;
  if (hours > 0)
    return `in ${plural(hours, "hour")} ${plural(minutes, "minute")}`;
  return `in ${plural(minutes, "minute")}`;
}

const central = (at: number, options: Intl.DateTimeFormatOptions) =>
  new Date(at).toLocaleString(undefined, {
    timeZone: PLAYTIME_TIMEZONE,
    ...options,
  });

const local = (at: number) =>
  new Date(at).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const who = (person: { name: string | null; handle: string | null }) =>
  person.handle
    ? `${person.name ?? person.handle} (@${person.handle})`
    : (person.name ?? "An unnamed account");

function lastRunText(run: NonNullable<Status["lastRun"]>) {
  const when = local(run.at);
  switch (run.outcome) {
    case "removed":
      return `${when}: removed ${who(run)}.`;
    case "nobody":
      return `${when}: nobody was eligible, so nobody was removed.`;
    case "failed":
      return `${when}: Clerk refused to remove ${who(run)}. Nothing changed.`;
    case "skipped":
      return `${when}: skipped, Auto ban was off.`;
  }
}

function Schedule({ status, now }: { status: Status; now: number }) {
  const setEnabled = useMutation(api.inactivity.setEnabled);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(enabled: boolean) {
    setPending(true);
    setError(null);
    try {
      await setEnabled({ enabled });
    } catch (caught) {
      setError(
        caught instanceof ConvexError && typeof caught.data === "string"
          ? caught.data
          : "Couldn't change it. Try again.",
      );
    } finally {
      setPending(false);
    }
  }

  const next = central(status.nextRunAt, {
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });

  return (
    <div className="rounded-xl border border-border p-4 page-sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1 basis-56">
          <h2 className="flex items-center gap-2 font-medium">
            <span
              aria-hidden
              className={cn(
                "size-2 rounded-full",
                status.enabled ? "bg-success" : "bg-border-strong",
              )}
            />
            {status.enabled ? "Auto ban is on" : "Auto ban is off"}
          </h2>
          <p className="mt-1 text-xs text-pretty text-muted-foreground">
            Every Friday at 2:55 p.m. Central, the member account with the least
            site time, playtime, and chat since Monday is deleted, and Flame
            tells you who went. Staff, accounts at the invite gate, and accounts
            made this week are never removed.
          </p>
        </div>
        <label className="flex cursor-pointer items-center gap-2.5 text-sm">
          <span className="text-muted-foreground">
            {status.enabled ? "On" : "Off"}
          </span>
          <Switch
            aria-label="Auto ban"
            checked={status.enabled}
            disabled={pending}
            onCheckedChange={(checked) => void toggle(checked)}
          />
        </label>
      </div>
      <dl className="mt-4 grid gap-3 border-t border-border pt-4 text-sm page-sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">Next cycle</dt>
          <dd
            className={cn(
              "mt-0.5",
              !status.enabled && "text-muted-foreground line-through",
            )}
          >
            {next}
          </dd>
          <dd className="text-xs text-muted-foreground">
            {status.enabled
              ? countdown(status.nextRunAt - now)
              : "Will be skipped while Auto ban is off"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Last cycle</dt>
          <dd className="mt-0.5 text-pretty">
            {status.lastRun
              ? lastRunText(status.lastRun)
              : "None recorded yet."}
          </dd>
        </div>
      </dl>
      {status.updatedAt !== null && (
        <p className="mt-3 text-xs text-muted-foreground">
          Turned {status.enabled ? "on" : "off"} {local(status.updatedAt)}
          {status.updatedBy ? ` by ${status.updatedBy}` : ""}.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function StandingRow({
  standing,
  place,
}: {
  standing: Standing;
  place: number;
}) {
  const first = place === 1;
  return (
    <tr
      className={cn(
        "border-b border-border last:border-0",
        first && "bg-destructive/5",
      )}
    >
      <td className="px-4 py-3 text-muted-foreground tabular-nums page-sm:px-5">
        {place}
      </td>
      <td className="min-w-0 px-3 py-3">
        <span
          className={cn(
            "block truncate font-medium",
            first && "text-destructive",
          )}
        >
          {standing.name ?? standing.handle ?? "Unnamed account"}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {standing.handle ? `@${standing.handle}` : "No handle"}
          {first && " · Out if the week ended now"}
        </span>
      </td>
      <td className="hidden px-3 py-3 tabular-nums page-sm:table-cell">
        {duration(standing.siteSeconds)}
      </td>
      <td className="hidden px-3 py-3 tabular-nums page-sm:table-cell">
        {duration(standing.playtimeSeconds)}
      </td>
      <td className="hidden px-3 py-3 tabular-nums page-md:table-cell">
        {standing.chatMessages}
      </td>
      <td className="px-3 py-3 text-right font-medium tabular-nums page-sm:px-5">
        {duration(standing.score)}
      </td>
    </tr>
  );
}

function Standings({ status }: { status: Status }) {
  const from = central(status.windowStart + 12 * HOUR, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <div className="px-4 pt-4 pb-3 page-sm:px-5">
        <h2 className="font-medium">On track to be removed</h2>
        <p className="mt-1 text-xs text-pretty text-muted-foreground">
          The least active members since {from}, least active first.{" "}
          {status.considered} member account
          {status.considered === 1 ? " is" : "s are"} in the running. Total is
          site time plus playtime plus 90 seconds per chat message.
        </p>
      </div>
      <table className="w-full text-left text-sm">
        <caption className="sr-only">
          Least active members this week, least active first.
        </caption>
        <thead className="border-y border-border bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="w-12 px-4 py-3 font-medium page-sm:px-5">
              #
            </th>
            <th scope="col" className="px-3 py-3 font-medium">
              Member
            </th>
            <th
              scope="col"
              className="hidden w-24 px-3 py-3 font-medium page-sm:table-cell"
            >
              Site
            </th>
            <th
              scope="col"
              className="hidden w-24 px-3 py-3 font-medium page-sm:table-cell"
            >
              Playtime
            </th>
            <th
              scope="col"
              className="hidden w-20 px-3 py-3 font-medium page-md:table-cell"
            >
              Chat
            </th>
            <th
              scope="col"
              className="w-24 px-3 py-3 text-right font-medium page-sm:px-5"
            >
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {status.standings.map((standing, index) => (
            <StandingRow
              key={standing.clerkId}
              standing={standing}
              place={index + 1}
            />
          ))}
          {status.standings.length === 0 && (
            <tr>
              <td
                colSpan={6}
                className="px-5 py-14 text-center text-muted-foreground"
                role="status"
              >
                No member is eligible this week.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** CEO-only: the Friday inactivity removal's switch, schedule, and standings. */
export function AutoBan() {
  const now = useMinute();
  const status = useAuthedQuery(api.inactivity.status, { now });
  if (status === undefined) return <p role="status">Loading Auto ban…</p>;
  return (
    <section aria-label="Auto ban" className="min-w-0 space-y-5">
      <Schedule status={status} now={now} />
      <Standings status={status} />
    </section>
  );
}
