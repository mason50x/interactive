"use client";

import { useEffect, useState, type ComponentType, type SVGProps } from "react";
import Link from "next/link";
import Image from "next/image";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { useChat } from "@/components/app/chat/chat-provider";
import { useActivities } from "@/components/app/activities-provider";
import { useGamePopularity } from "@/components/app/game-views";
import { SegmentedControl } from "@/components/ui/segmented";
import { cn } from "@/lib/utils";
import {
  ChatIconSolid,
  ChipIconSolid,
  ControllerIconSolid,
  GlobeIconSolid,
} from "@/components/app/nav-icons";
import { ArrowUpRightIcon } from "@heroicons/react/24/outline";
import {
  ChartBarIcon,
  ChatBubbleLeftRightIcon,
  ClockIcon,
  FilmIcon,
  TrophyIcon,
} from "@heroicons/react/24/solid";

const DAY = 86_400_000;
type Metric = "playtime" | "chat" | "pages" | "games";
type Period = "day" | "week" | "month" | "all";
type Icon = ComponentType<SVGProps<SVGSVGElement>>;
const tabs: { id: Metric; label: string; icon: Icon }[] = [
  { id: "playtime", label: "Time played", icon: ClockIcon },
  { id: "chat", label: "Most chatty", icon: ChatBubbleLeftRightIcon },
  { id: "pages", label: "Popular pages", icon: ChartBarIcon },
  { id: "games", label: "Popular games", icon: ControllerIconSolid },
];
const pages: Record<string, { label: string; icon: Icon }> = {
  "/activities": { label: "Activities", icon: ControllerIconSolid },
  "/tv": { label: "TV", icon: FilmIcon },
  "/chat": { label: "Chat", icon: ChatIconSolid },
  "/browse": { label: "Browse", icon: GlobeIconSolid },
  "/emulate": { label: "Emulate", icon: ChipIconSolid },
  "/leaderboard": { label: "Leaderboard", icon: TrophyIcon },
};
function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${Math.floor(seconds % 60)}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function Leaderboard() {
  const { isAuthenticated } = useConvexAuth();
  const { profile } = useChat();
  const catalogue = useActivities();
  const games = useGamePopularity();
  const [metric, setMetric] = useState<Metric>("playtime");
  const [period, setPeriod] = useState<Period>("all");
  const [clock, setClock] = useState(() => Math.floor(Date.now() / DAY));
  useEffect(() => {
    const timer = setInterval(
      () => setClock(Math.floor(Date.now() / DAY)),
      60_000,
    );
    return () => clearInterval(timer);
  }, []);
  const activePeriod =
    metric === "games"
      ? period === "all"
        ? "all"
        : "week"
      : metric === "pages"
        ? "day"
        : metric === "playtime" && period !== "day"
          ? "all"
          : period === "all" && metric === "chat"
            ? "day"
            : period;
  const result = useQuery(
    api.leaderboard.standings,
    isAuthenticated && metric !== "games"
      ? { metric, period: activePeriod, clock }
      : "skip",
  );
  const entries =
    metric === "games"
      ? games
          ?.map((row) => ({
            id: row.slug,
            title:
              catalogue.find((game) => game.slug === row.slug)?.title ??
              row.slug,
            subtitle: "Activity",
            value: period === "all" ? row.views : row.weeklyViews,
            href: `/activities/${row.slug}`,
            imageUrl: null,
          }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 25)
      : metric === "pages"
        ? result?.pages.map((row) => ({
            id: row.path,
            title: pages[row.path]?.label ?? row.path,
            subtitle: row.path,
            value: row.views,
            href: row.path,
            imageUrl: null,
          }))
        : result?.people.map((row) => ({
            id: row.clerkId,
            title: row.name,
            subtitle: row.handle ? `@${row.handle}` : "Member",
            value: row.score,
            imageUrl: row.imageUrl,
            href: undefined,
          }));
  const top = entries?.[0];
  const max = top?.value ?? 1;
  const selected = tabs.find((tab) => tab.id === metric)!;
  const periods: { id: Period; label: string }[] =
    metric === "games"
      ? [
          { id: "week", label: "This week" },
          { id: "all", label: "All time" },
        ]
      : metric === "playtime"
        ? [
            { id: "all", label: "All time" },
            { id: "day", label: "Today" },
          ]
        : metric === "chat"
          ? [
              { id: "day", label: "Today" },
              { id: "week", label: "This week" },
              { id: "month", label: "This month" },
            ]
          : [{ id: "day", label: "Today" }];
  const format = (value: number) =>
    metric === "playtime"
      ? formatTime(value)
      : `${Math.round(value).toLocaleString()} ${metric === "chat" ? (Math.round(value) === 1 ? "message" : "messages") : metric === "games" ? (Math.round(value) === 1 ? "play" : "plays") : Math.round(value) === 1 ? "visit" : "visits"}`;

  return (
    <div className="flex flex-col gap-7">
      <SegmentedControl
        aria-label="By leaderboard"
        value={metric}
        onValueChange={(value) => {
          setMetric(value);
          setPeriod(
            value === "playtime" ? "all" : value === "games" ? "week" : "day",
          );
        }}
        options={tabs.map((tab) => ({
          value: tab.id,
          label: tab.label,
          icon: <tab.icon />,
        }))}
        tone="neutral"
        className="max-w-full self-start overflow-x-auto"
      />

      <section aria-live="polite" className="min-w-0">
        <div className="min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-5 sm:px-7">
            <h2 className="flex items-center gap-2.5 text-2xl font-semibold text-foreground">
              <selected.icon
                aria-hidden="true"
                className="size-6 text-foreground"
              />
              {selected.label}
            </h2>
            {periods.length === 1 ? (
              <span className="text-sm font-medium text-muted-foreground">
                Today
              </span>
            ) : (
              <SegmentedControl
                aria-label="Time period"
                value={activePeriod}
                onValueChange={setPeriod}
                options={periods.map((option) => ({
                  value: option.id,
                  label: option.label,
                }))}
                tone="neutral"
              />
            )}
          </div>
          {entries === undefined ? (
            <div
              role="status"
              className="px-7 py-20 text-center text-muted-foreground"
            >
              Loading standings…
            </div>
          ) : entries.length === 0 ? (
            <div className="px-7 py-20 text-center">
              <selected.icon className="mx-auto size-10 text-muted-foreground/40" />
              <p className="mt-4 font-semibold">No standings yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Activity will appear here as members take part.
              </p>
            </div>
          ) : (
            <ol className="divide-y divide-border/70">
              {entries.map((entry, index) => {
                const EntryIcon =
                  metric === "pages"
                    ? (pages[entry.id]?.icon ?? ChartBarIcon)
                    : selected.icon;
                return (
                  <li
                    key={entry.id}
                    className={cn(
                      "flex items-center gap-3 px-5 py-4 sm:gap-4 sm:px-7",
                      index === 0 && "bg-muted/40",
                    )}
                  >
                    <span
                      className={cn(
                        "w-7 shrink-0 text-center text-sm font-bold tabular-nums",
                        index === 0
                          ? "text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    {entry.imageUrl ? (
                      <Image
                        unoptimized
                        src={entry.imageUrl}
                        width={44}
                        height={44}
                        alt=""
                        className="size-11 shrink-0 rounded-2xl object-cover"
                      />
                    ) : (
                      <div
                        aria-hidden="true"
                        className={cn(
                          "grid size-11 shrink-0 place-items-center rounded-2xl",
                          index === 0
                            ? "bg-muted text-foreground"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        <EntryIcon className="size-5" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-foreground">
                        {entry.href ? (
                          <Link href={entry.href} className="hover:underline">
                            {entry.title}
                          </Link>
                        ) : (
                          entry.title
                        )}
                        {index === 0 && (
                          <span className="ml-2 align-middle text-xs text-foreground">
                            ★
                          </span>
                        )}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {entry.subtitle}
                        {entry.id === profile?.clerkId && " · You"}
                      </div>
                    </div>
                    <div className="hidden w-20 overflow-hidden rounded-full bg-muted sm:block">
                      <div
                        className="h-1.5 rounded-full bg-primary"
                        style={{
                          width: `${Math.max(3, (100 * entry.value) / max)}%`,
                        }}
                      />
                    </div>
                    <span className="min-w-20 text-right text-sm font-bold text-foreground tabular-nums">
                      {format(entry.value)}
                    </span>
                    {entry.href && (
                      <ArrowUpRightIcon
                        aria-hidden="true"
                        className="size-4 text-muted-foreground"
                      />
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </section>
    </div>
  );
}
