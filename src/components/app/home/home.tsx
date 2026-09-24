"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { ArrowRightIcon, ClockIcon, PlayIcon } from "@heroicons/react/24/solid";
import { api } from "@convex/_generated/api";
import { useActivities } from "@/components/app/activities-provider";
import { useChat } from "@/components/app/chat/chat-provider";
import { useGamePopularity } from "@/components/app/game-views";
import { usePlaytimeQuota } from "@/components/app/playtime-status";
import { Avatar } from "@/components/app/user-menu/avatar";
import { SchoolSchedule } from "@/components/app/home/school-schedule";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { thumbnailSrc, type ActivityEntry } from "@/lib/activity";
import { rankGames } from "@/lib/game-popularity";
import { dailyLearningQuote, nextQuoteDelay } from "@/lib/learning-quotes";
import { CHAT_HREF, LEADERBOARD_HREF } from "@/lib/nav";
import { cn } from "@/lib/utils";
import PixelBlast from "@/components/PixelBlast";

const DAY = 86_400_000;

/**
 * Home: the page a session lands on.
 *
 * Top to bottom, loudest to quietest — a greeting at display size with the
 * playtime left today under it, the one game you are most likely to want,
 * what everyone is saying and who is winning. It is one centred column so
 * the page reads as one thing rather than a dashboard of equals.
 */
export function Home() {
  const catalogue = useActivities();
  const { isAuthenticated } = useConvexAuth();
  const popularity = useGamePopularity();
  const recent = useQuery(api.gameViews.recent, isAuthenticated ? {} : "skip");

  const ranked = useMemo(
    () =>
      popularity?.some((row) => row.views > 0)
        ? rankGames(catalogue, popularity)
        : catalogue,
    [catalogue, popularity],
  );
  const recentGames = useMemo(() => {
    const bySlug = new Map(catalogue.map((game) => [game.slug, game]));
    return (recent ?? []).flatMap((row) => bySlug.get(row.slug) ?? []);
  }, [catalogue, recent]);

  const [scheduleHeight, setScheduleHeight] = useState<number | null>(null);
  // The featured card follows the schedule's height beside it, so the pair
  // stays one row as the schedule grows and shrinks through the day.
  const scheduleRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const observer = new ResizeObserver(([entry]) =>
      setScheduleHeight(entry.borderBoxSize[0].blockSize),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const resuming = recentGames.length > 0;
  const featured = recentGames[0] ?? ranked[0];

  return (
    <>
      <Hero />

      <section
        aria-label={resuming ? "Jump back in" : "Top pick and school day"}
        className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]"
        style={
          scheduleHeight === null
            ? undefined
            : ({ "--schedule-h": `${scheduleHeight}px` } as CSSProperties)
        }
      >
        {featured && <Featured game={featured} resuming={resuming} />}
        <div ref={scheduleRef}>
          <SchoolSchedule />
        </div>
      </section>

      <section
        aria-label="Around the community"
        className="grid gap-5 md:grid-cols-3"
      >
        <ChatCard />
        <TopPlayers />
        <QuoteCard />
      </section>
    </>
  );
}

/** The time, read after hydration so the server and client agree first. */
function useNow() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const update = () => setNow(new Date());
    const initial = setTimeout(update, 0);
    const timer = setInterval(update, 60_000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, []);
  return now;
}

function Hero() {
  const now = useNow();
  const { profile } = useChat();
  const quota = usePlaytimeQuota();

  const hour = now?.getHours();
  const greeting =
    hour === undefined
      ? "Welcome back"
      : hour < 12
        ? "Good morning"
        : hour < 18
          ? "Good afternoon"
          : "Good evening";
  const name = profile
    ? profile.displayName?.trim().split(/\s+/)[0] || profile.handle
    : null;

  const seconds = quota?.remaining ?? null;
  const clock =
    seconds === null
      ? null
      : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <section className="flex flex-col items-center text-center">
      <h1 className="text-display max-w-4xl text-[2.25rem] leading-[1.05] text-balance sm:text-[3.25rem]">
        {greeting}
        {name ? (
          <>
            , <span className="text-primary">{name}</span>
          </>
        ) : null}
        .
      </h1>

      <p className="mt-6 flex items-center gap-2 text-[0.9375rem] font-medium text-muted-foreground tabular-nums">
        <ClockIcon className="size-4 shrink-0 opacity-80" />
        {clock === null
          ? "Checking playtime…"
          : seconds === 0
            ? "Playtime used up · chat for more"
            : `${clock} of playtime left`}
      </p>
    </section>
  );
}

function Featured({
  game,
  resuming,
}: {
  game: ActivityEntry;
  resuming: boolean;
}) {
  return (
    <Link
      href={`/activities/${game.slug}`}
      prefetch={false}
      className="group relative isolate flex aspect-[16/10] min-h-72 flex-col justify-end overflow-hidden rounded-[1.5rem] bg-muted p-6 text-white transition-[height] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] outline-none focus-visible:ring-3 focus-visible:ring-ring/60 sm:p-8 lg:aspect-auto lg:h-[var(--schedule-h,auto)] lg:min-h-0"
    >
      {/* Catalogue art is served from `public/`; see `thumbnailSrc`. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={thumbnailSrc(game)}
        alt=""
        className="absolute inset-0 -z-10 size-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.03]"
      />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
      <p className="text-[0.875rem] font-medium text-white/75">
        {resuming ? "Jump back in" : "Top pick today"}
      </p>
      <h2 className="mt-1.5 max-w-lg text-[2rem] leading-tight font-semibold text-balance sm:text-[2.5rem]">
        {game.title}
      </h2>
      <span className="mt-5 inline-flex h-11 w-fit items-center gap-2 rounded-full bg-white px-5 text-[0.9375rem] font-medium text-neutral-900 transition-transform group-hover:translate-x-0.5">
        <PlayIcon className="size-4" />
        Play
      </span>
    </Link>
  );
}

function ChatCard() {
  const { conversations, loading, hasUnread } = useChat();
  const { isAuthenticated } = useConvexAuth();
  const room = conversations.find((row) => row.kind === "global");
  const messages = useQuery(
    api.chat.messages.list,
    isAuthenticated && room
      ? {
          conversationId: room._id,
          dayStart: 0,
          dayEnd: 8_640_000_000_000_000,
          paginationOpts: { numItems: 3, cursor: null },
        }
      : "skip",
  );
  const visible = messages?.page.filter(
    (message) => message.status === "visible",
  );
  const href = room ? `${CHAT_HREF}/${room._id}` : CHAT_HREF;
  return (
    <Card radius="xl" className="flex flex-col p-6">
      <CardHeading title="Everyone" href={href} dot={hasUnread} />
      {visible?.length ? (
        <ul className="mt-5 flex flex-1 flex-col gap-4">
          {visible.map((message) => {
            const author = message.authorName || message.authorHandle;
            return (
              <li key={message._id} className="flex gap-3">
                <Avatar src={message.authorAvatarUrl} name={author} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.8125rem] font-medium">
                    {author}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-[0.875rem] leading-snug text-muted-foreground">
                    {message.body || "Shared a picture"}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-5 flex-1 text-[0.875rem] text-muted-foreground">
          {loading || (room && !messages)
            ? "Loading the conversation…"
            : "It’s quiet in here. Say hello."}
        </p>
      )}
      <ButtonLink
        href={href}
        variant="secondary"
        className="mt-6 h-10 w-full rounded-full"
      >
        Open chat
      </ButtonLink>
    </Card>
  );
}

function useStandings() {
  const { isAuthenticated } = useConvexAuth();
  const [clock] = useState(() => Math.floor(Date.now() / DAY));
  return useQuery(
    api.leaderboard.standings,
    isAuthenticated ? { metric: "playtime", period: "all", clock } : "skip",
  );
}

function formatPlaytime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function TopPlayers() {
  const standings = useStandings();
  const top = standings?.people.slice(0, 5);
  return (
    <Card radius="xl" className="flex flex-col p-6">
      <CardHeading title="Most time played" href={LEADERBOARD_HREF} />
      {top?.length ? (
        <ol className="mt-5 flex flex-1 flex-col gap-3.5">
          {top.map((person, index) => (
            <li key={person.clerkId} className="flex items-center gap-3">
              <span
                className={cn(
                  "w-5 text-center text-[0.875rem] font-semibold tabular-nums",
                  index === 0 ? "text-amber-500" : "text-faint",
                )}
              >
                {index + 1}
              </span>
              <Avatar
                src={person.imageUrl ?? undefined}
                name={person.name}
                size={32}
              />
              <span className="min-w-0 flex-1 truncate text-[0.9375rem] font-medium">
                {person.name}
              </span>
              <span className="text-[0.875rem] text-muted-foreground tabular-nums">
                {formatPlaytime(person.score)}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-5 flex-1 text-[0.875rem] text-muted-foreground">
          {standings === undefined
            ? "Tallying the scores…"
            : "Nobody’s on the board yet. Be the first."}
        </p>
      )}
      <ButtonLink
        href={LEADERBOARD_HREF}
        variant="secondary"
        className="mt-6 h-10 w-full rounded-full"
      >
        Full leaderboard
      </ButtonLink>
    </Card>
  );
}

function QuoteCard() {
  const [quote, setQuote] = useState<string | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      const now = Date.now();
      setQuote(dailyLearningQuote(now));
      clearTimeout(timer);
      timer = setTimeout(refresh, nextQuoteDelay(now));
    };
    // Keep hydration stable, then schedule only the next UTC date boundary.
    timer = setTimeout(refresh, 0);
    return () => clearTimeout(timer);
  }, []);
  return (
    <figure className="relative flex min-h-72 flex-col overflow-hidden rounded-[1.5rem] bg-primary p-7 text-primary-foreground">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-32 opacity-40"
        style={{ maskImage: "linear-gradient(to top, black, transparent)" }}
      >
        <PixelBlast
          color="#c7e1ff"
          pixelSize={4}
          edgeFade={0.15}
          enableRipples={false}
        />
      </div>
      <figcaption className="relative z-10 text-[0.875rem] font-medium text-primary-foreground/75">
        Quote of the day
      </figcaption>
      <blockquote className="text-serif-display relative z-10 mt-6 text-[1.625rem] leading-snug text-balance">
        {quote ?? "A little wisdom is on its way…"}
      </blockquote>
    </figure>
  );
}

function CardHeading({
  title,
  href,
  dot = false,
}: {
  title: string;
  href: string;
  dot?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-[1.0625rem] font-semibold">
        {title}
        {dot && (
          <span
            aria-label="Unread"
            className="size-2 rounded-full bg-primary"
          />
        )}
      </h2>
      <Link
        href={href}
        aria-label={`Open ${title}`}
        className="rounded-full p-1 text-faint transition-colors hover:text-foreground"
      >
        <ArrowRightIcon className="size-4" />
      </Link>
    </div>
  );
}
