"use client";

import { useEffect, useState, type ComponentType, type SVGProps } from "react";
import Link from "next/link";
import Image from "next/image";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { useChat } from "@/components/app/chat/chat-provider";
import { Card } from "@/components/ui/card";
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
type Metric = "playtime" | "chat" | "pages";
type Period = "day" | "week" | "month" | "all";
type Icon = ComponentType<SVGProps<SVGSVGElement>>;
const tabs: { id: Metric; label: string; icon: Icon }[] = [
  { id: "playtime", label: "Time played", icon: ClockIcon },
  { id: "chat", label: "Most chatty", icon: ChatBubbleLeftRightIcon },
  { id: "pages", label: "Popular pages", icon: ChartBarIcon },
];
const pages: Record<string, { label: string; icon: Icon }> = {
  "/activities": { label: "Activities", icon: ControllerIconSolid },
  "/entertainment": { label: "Entertainment", icon: FilmIcon },
  "/chat": { label: "Chat", icon: ChatIconSolid },
  "/experience": { label: "Experience", icon: GlobeIconSolid },
  "/learning-simulator": { label: "Simulators", icon: ChipIconSolid },
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
    metric === "pages"
      ? "day"
      : metric === "playtime" && period !== "day"
        ? "all"
        : period === "all" && metric === "chat"
          ? "day"
          : period;
  const result = useQuery(
    api.leaderboard.standings,
    isAuthenticated ? { metric, period: activePeriod, clock } : "skip",
  );
  const entries =
    metric === "pages"
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
    metric === "playtime"
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
      : `${Math.round(value).toLocaleString()} ${metric === "chat" ? (Math.round(value) === 1 ? "message" : "messages") : Math.round(value) === 1 ? "visit" : "visits"}`;

  return (
    <div className="flex flex-col gap-7">
      <div
        className="inline-flex max-w-full self-start overflow-x-auto rounded-2xl border border-sidebar-border bg-sidebar p-1.5"
        role="tablist"
        aria-label="Leaderboard metric"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={metric === tab.id}
            onClick={() => {
              setMetric(tab.id);
              setPeriod(tab.id === "playtime" ? "all" : "day");
            }}
            className={cn(
              "flex shrink-0 items-center justify-center gap-2.5 rounded-xl px-4 py-2 text-sm font-semibold transition-[background-color,color] focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-ring",
              metric === tab.id
                ? "bg-surface text-foreground shadow-sm"
                : "text-sidebar-foreground/70 hover:bg-surface/60 hover:text-sidebar-foreground",
            )}
          >
            <tab.icon aria-hidden="true" className="size-5 shrink-0" />
            {tab.label}
          </button>
        ))}
      </div>

      <section
        aria-live="polite"
        className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_270px]"
      >
        <Card className="min-w-0 overflow-hidden">
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
              <div
                className="flex rounded-full bg-muted p-1"
                aria-label="Time period"
              >
                {periods.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={activePeriod === option.id}
                    onClick={() => setPeriod(option.id)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-primary",
                      activePeriod === option.id
                        ? "bg-surface text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
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
        </Card>
        <Card className="p-6">
          <p className="text-sm font-semibold text-muted-foreground">
            Current leader
          </p>
          <p className="mt-2 text-xl font-semibold break-words text-foreground">
            {top?.title ?? "Waiting for activity"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {top ? format(top.value) : "Be the first to appear"}
          </p>
        </Card>
      </section>
    </div>
  );
}
