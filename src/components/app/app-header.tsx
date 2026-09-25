"use client";

import {
  PlaytimeNavLink,
  SidebarPlaytime,
  usePlaytimeExhausted,
} from "./playtime-status";
import { isPlaytimeRoute } from "@config/playtime";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useRef } from "react";
import { TrophyIcon } from "@heroicons/react/24/solid";
import { useChat } from "@/components/app/chat/chat-provider";
import { NavUnderline } from "@/components/app/rail/nav-underline";
import { useActiveNav } from "@/components/app/rail/use-active-nav";
import {
  NavPending,
  useNavPending,
} from "@/components/app/rail/use-nav-pending";
import { SchoolDayButton } from "@/components/app/school-day-button";
import { UserMenu } from "@/components/app/user-menu";
import { Wordmark } from "@/components/wordmark";
import { brand } from "@/lib/brand";
import { HOME_HREF, LEADERBOARD_HREF, navItems } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { useWarmRoutes } from "@/lib/warm";
import { usePlaytimeActivity } from "@/components/app/playtime-activity";

/**
 * The signed-in app's chrome: one bar across the top of the page.
 *
 * The dashboard is a workspace rather than a page in the site, so it takes
 * none of the marketing chrome — no `SiteHeader` with its hover panels, no
 * `SiteFooter` with its legal links. Brand, destinations, playtime
 * and account all live in this one row.
 *
 * It does not scroll and needs no `position: sticky`: the layout is a
 * viewport-height column in which this bar is a fixed-height row, so the only
 * thing that can scroll is the shell beneath it. It paints no background of
 * its own — it sits on the layout's chrome, and the shell's border draws the
 * edge between them.
 *
 * The row is budgeted by breakpoint, because every item in it wants width:
 * destinations are words, set tighter below `lg`; the brand's name
 * arrives at `2xl`.
 *
 * `z-30` keeps what the bar
 * floats — the playtime details and account menu — above
 * anything positioned inside the shell.
 */
export function AppHeader() {
  const pathname = usePathname();
  const exhausted = usePlaytimeExhausted();
  const { hasUnread, mentioned, conversations } = useChat();
  // Leaderboard sits beside the account controls, and Admin lives in the
  // account menu; the centre links are the places you spend time in.
  const destinations = navItems.filter(
    (item) => item.href !== LEADERBOARD_HREF,
  );
  const hasNewAnnouncement = conversations.some(
    (conversation) =>
      conversation.kind === "announcements" && conversation.unread > 0,
  );

  const { pendingHref, report } = useNavPending();
  const { activeHref, litHref } = useActiveNav(pathname, pendingHref, [
    ...destinations,
    { href: LEADERBOARD_HREF },
  ]);

  const compactPlaytime = usePlaytimeActivity();

  const hotRoutes = useMemo(
    () =>
      navItems
        .filter((item) => !exhausted || !isPlaytimeRoute(item.href))
        .map((item) => item.href),
    [exhausted],
  );
  const warm = useWarmRoutes(pathname, hotRoutes);
  const list = useRef<HTMLUListElement>(null);

  return (
    <header className="relative z-30 grid h-16 shrink-0 grid-cols-[minmax(max-content,1fr)_minmax(max-content,3fr)_minmax(max-content,1fr)] items-center gap-3 px-3">
      {/* Returns to Home, the default app page. */}
      <Link
        href={HOME_HREF}
        aria-label={`${brand.name} home`}
        {...warm(HOME_HREF)}
        className="w-fit shrink-0 rounded-full px-2 backdrop-blur-[3px] transition-opacity hover:opacity-70"
      >
        <Wordmark
          short
          className="text-[1.375rem] 2xl:text-[1.0625rem]"
          nameClassName="hidden 2xl:inline"
        />
      </Link>

      {/* The middle of three columns, weighted 1:3:1. The outer two are
          equal while each can hold what it carries (the controls are the
          wider side), so the links sit on the page's centre line and spread
          across everything between. Capped so a very wide screen doesn't
          scatter them. The underline measures against the list, so the cap
          lives here on the nav and the list fills it. */}
      <nav aria-label="Dashboard" className="relative mx-auto w-full max-w-4xl">
        <ul ref={list} className="flex items-center justify-between gap-1">
          {destinations.map((item) => {
            const disabled = exhausted && isPlaytimeRoute(item.href);
            const active = item.href === activeHref;
            const lit = item.href === litHref;
            const showUnread = item.unread && hasUnread && !lit;
            const Icon = item.icon.solid;
            return (
              <li key={item.href} className="shrink-0">
                <PlaytimeNavLink
                  disabled={disabled}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  data-lit={lit ? "true" : undefined}
                  {...(disabled ? {} : warm(item.href))}
                  className={cn(
                    "group relative flex h-11 items-center rounded-lg border border-transparent px-2 text-[0.875rem] font-medium whitespace-nowrap backdrop-blur-[3px] lg:px-3 lg:text-[0.9375rem]",
                    "outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset",
                    disabled
                      ? "cursor-not-allowed opacity-40"
                      : lit
                        ? "font-bold text-foreground"
                        : "text-muted-foreground transition-colors duration-150 hover:text-foreground",
                  )}
                >
                  {/* What the underline measures. See `NavUnderline`. */}
                  <span
                    data-underline={item.href}
                    className="inline-flex h-full items-center gap-2"
                  >
                    <Icon aria-hidden className="size-5 shrink-0" />
                    {/* An unread row's label glints now and then in the brand
                        colour — a pass, not a loop. Not on the lit row, which
                        is already where it points. */}
                    <span
                      className={cn(
                        // Icons only below `lg`, as the old rail did; the
                        // label stays for screen readers.
                        "sr-only lg:not-sr-only",
                        showUnread &&
                          "text-shimmer-periodic [--shimmer-base:var(--muted-foreground)] group-hover:[--shimmer-base:var(--foreground)]",
                      )}
                    >
                      {item.label}
                    </span>
                  </span>

                  {/* A dot and a word, never a number: the conversation list
                      is where "how many, and from whom" belongs. The word
                      changes when one of them names you, and is dropped below
                      `xl` to save room. */}
                  {showUnread ? (
                    <span
                      aria-label={
                        hasNewAnnouncement
                          ? "New announcement"
                          : mentioned
                            ? "You were mentioned"
                            : "Unread messages"
                      }
                      role="status"
                      className={cn(
                        "ml-2 flex items-center gap-1.5",
                        hasNewAnnouncement ? "text-red-500" : "text-primary",
                      )}
                    >
                      <span
                        className={cn(
                          "hidden text-xs leading-none font-medium xl:inline",
                          hasNewAnnouncement &&
                            "text-shimmer-periodic [--shimmer-base:var(--color-red-500)]",
                        )}
                      >
                        {hasNewAnnouncement
                          ? "NEW!"
                          : mentioned
                            ? "Mentioned"
                            : "Unread"}
                      </span>
                      {/* Tailwind's ping slowed to the chat header's presence
                          beat: at this size the stock second reads as an
                          alarm. */}
                      <span className="relative flex size-2 shrink-0">
                        <span className="absolute inset-0 animate-ping rounded-full bg-current opacity-70 [animation-duration:2.4s]" />
                        <span className="relative size-2 rounded-full bg-current" />
                      </span>
                    </span>
                  ) : null}

                  {!disabled && <NavPending href={item.href} report={report} />}
                </PlaytimeNavLink>
              </li>
            );
          })}
        </ul>
        <NavUnderline list={list} href={litHref || null} />
      </nav>

      <div className="flex min-w-0 items-center justify-end gap-1">
        {/* Home already shows the schedule as a card, so the button tucks
            away there and slides back in everywhere else. */}
        <div
          aria-hidden={pathname === HOME_HREF || undefined}
          inert={pathname === HOME_HREF}
          className={cn(
            "flex shrink-0 justify-center overflow-hidden transition-[width,opacity,margin,scale] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
            pathname === HOME_HREF
              ? "-mr-1 w-0 scale-75 opacity-0"
              : "w-11 opacity-100",
          )}
        >
          <SchoolDayButton />
        </div>
        <Link
          href={LEADERBOARD_HREF}
          aria-label="Leaderboard"
          title="Leaderboard"
          aria-current={activeHref === LEADERBOARD_HREF ? "page" : undefined}
          {...warm(LEADERBOARD_HREF)}
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-lg backdrop-blur-[3px] outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset",
            litHref === LEADERBOARD_HREF
              ? "text-foreground"
              : "text-muted-foreground transition-colors hover:text-foreground",
          )}
        >
          <TrophyIcon className="size-5" />
          <NavPending href={LEADERBOARD_HREF} report={report} />
        </Link>

        <SidebarPlaytime compact={compactPlaytime} />

        {/* Nothing links back to the marketing site: `/` bounces a live
            session straight back here, so it would be a round trip to
            nowhere. */}
        <UserMenu />
      </div>
    </header>
  );
}
