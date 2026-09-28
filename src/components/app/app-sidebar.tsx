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
import { useChat } from "@/components/app/chat/chat-provider";
import { NavUnderline } from "@/components/app/rail/nav-underline";
import { useActiveNav } from "@/components/app/rail/use-active-nav";
import {
  NavPending,
  useNavPending,
} from "@/components/app/rail/use-nav-pending";
import { SchoolDayButton } from "@/components/app/school-day-button";
import { UserMenu } from "@/components/app/user-menu";
import { VoteRailCard } from "@/components/app/vote-prompt";
import { Wordmark } from "@/components/wordmark";
import { brand } from "@/lib/brand";
import { arrangeNav, HOME_HREF, navItems as allNavItems } from "@/lib/nav";
import { usePreferences } from "@/components/preferences-provider";
import { cn } from "@/lib/utils";
import { useWarmRoutes } from "@/lib/warm";
import { usePlaytimeActivity } from "@/components/app/playtime-activity";
import { SplitViewButton } from "@/components/app/workspace/split-view-button";
import { useWorkspace } from "@/components/app/workspace/workspace-provider";
import { WORKSPACE_DRAG_TYPE } from "@/lib/workspace";
import { ViewColumnsIcon } from "@heroicons/react/24/outline";

/**
 * The signed-in app's chrome: a vertical rail down the left of the page.
 *
 * The dashboard is a workspace rather than a page in the site, so it takes
 * none of the marketing chrome — no `SiteHeader` with its hover panels, no
 * `SiteFooter` with its legal links. Brand, destinations, playtime
 * and account all live in this one column.
 *
 * It does not scroll and needs no `position: sticky`: the layout is a
 * viewport-height row in which this rail is a full-height, fixed-width
 * column, so the only thing that can scroll is the shell beside it. It paints
 * no background of its own — it sits on the layout's chrome, and the shell's
 * border draws the edge between them.
 *
 * Rows are padded on the left and run flush to the rail's right edge, where
 * the shell's own 12px margin picks up, so every row has the same 12px of
 * chrome on both sides. Below `wide` the rail is 4.5rem of icons; from `wide`
 * up it is 15rem and every destination has its label.
 *
 * `isolate` gives the dot lattice at `-z-10` a stacking context of its own
 * here; without it the lattice would drop behind the layout's `bg-sidebar`.
 *
 * `z-30` keeps what the rail floats — the playtime details, the schedule and
 * the account menu — above anything positioned inside the shell beside it.
 */
export function AppSidebar() {
  const pathname = usePathname();
  const exhausted = usePlaytimeExhausted();
  const {
    preferences: { navOrder, navHidden },
  } = usePreferences();
  const navItems = useMemo(
    () => arrangeNav(allNavItems, navOrder, navHidden),
    [navOrder, navHidden],
  );
  const { hasUnread, mentioned, conversations } = useChat();
  const hasNewAnnouncement = conversations.some(
    (conversation) =>
      conversation.kind === "announcements" && conversation.unread > 0,
  );

  const workspace = useWorkspace();
  const { pendingHref, report } = useNavPending();
  // In split view the rail drives the focused pane, so it lights that
  // pane's page rather than the router's.
  const { activeHref, litHref } = useActiveNav(
    workspace.multi ? workspace.focusedPath : pathname,
    workspace.multi && workspace.focus !== "main" ? null : pendingHref,
    navItems,
  );

  const compactPlaytime = usePlaytimeActivity();

  const hotRoutes = useMemo(
    () =>
      navItems
        .filter((item) => !exhausted || !isPlaytimeRoute(item.href))
        .map((item) => item.href),
    [exhausted, navItems],
  );
  const warm = useWarmRoutes(pathname, hotRoutes);
  const list = useRef<HTMLUListElement>(null);
  const foot = useRef<HTMLDivElement>(null);
  const onHome = pathname === HOME_HREF;

  return (
    <nav
      aria-label="Dashboard"
      data-slot="rail"
      className="relative isolate z-30 flex w-[4.5rem] shrink-0 flex-col transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] wide:w-60"
    >
      {/* A faint dot lattice rising from the foot of the rail and thinning
          out behind the rows above. See `.rail-dots`. */}
      <div
        aria-hidden
        className="rail-dots pointer-events-none absolute inset-0 -z-10"
      />

      {/* Returns to Home, the default app page. The narrow padding centres
          the mark over the icon column; wide, it sits on the labels' edge. */}
      <div className="flex h-16 shrink-0 items-center pl-[2.0625rem] wide:pl-5">
        <Link
          href={HOME_HREF}
          aria-label={`${brand.name} home`}
          {...warm(HOME_HREF)}
          className="rounded-full transition-opacity hover:opacity-70"
        >
          <Wordmark
            short
            className="text-[1.375rem] wide:text-[1.0625rem]"
            nameClassName="hidden wide:inline"
          />
        </Link>
      </div>

      {/* Every destination lives here; Admin is in the account menu. The
          rail can outgrow a short viewport, so the list — and only the list —
          scrolls, and the underline scrolls with it. It measures against the
          list, which starts where this box does. */}
      <div className="relative min-h-0 flex-1 overflow-y-auto">
        <ul ref={list} className="flex flex-col gap-1 pb-2 pl-3">
          {navItems.map((item) => {
            const disabled = exhausted && isPlaytimeRoute(item.href);
            const active = item.href === activeHref;
            const lit = item.href === litHref;
            const showUnread = item.unread && hasUnread && !lit;
            const Icon = item.icon.solid;
            return (
              <li key={item.href} className="group/row relative">
                <PlaytimeNavLink
                  disabled={disabled}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  data-lit={lit ? "true" : undefined}
                  {...(disabled ? {} : warm(item.href))}
                  // Shift-click opens it beside; in split view a plain click
                  // goes to whichever pane is focused. Dragging it onto the
                  // page snaps it into a pane.
                  onClick={(event) => {
                    if (event.shiftKey && !event.metaKey && !event.ctrlKey) {
                      event.preventDefault();
                      workspace.openPane(item.href);
                    } else if (
                      !event.metaKey &&
                      !event.ctrlKey &&
                      workspace.routeToFocused(item.href)
                    ) {
                      event.preventDefault();
                    }
                  }}
                  draggable={!disabled}
                  onDragStart={(event) => {
                    event.dataTransfer.setData(WORKSPACE_DRAG_TYPE, item.href);
                    event.dataTransfer.effectAllowed = "copyLink";
                    workspace.setDragging(item.href);
                  }}
                  onDragEnd={() => workspace.setDragging(null)}
                  className={cn(
                    "group relative flex h-11 items-center rounded-lg border border-transparent px-3 text-[0.9375rem] font-medium whitespace-nowrap",
                    "outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset",
                    disabled
                      ? "cursor-not-allowed opacity-40"
                      : lit
                        ? "font-bold text-foreground"
                        : "text-muted-foreground transition-[background-color,color] duration-150 hover:bg-foreground/[0.05] hover:text-foreground",
                  )}
                >
                  {/* What the underline measures. See `NavUnderline`. The
                      narrow margin centres the icon in the 60px row. */}
                  <span
                    data-underline={item.href}
                    className="ml-2 inline-flex h-full min-w-0 items-center gap-3 wide:ml-0"
                  >
                    <Icon aria-hidden className="size-5 shrink-0" />
                    {/* An unread row's label glints now and then in the brand
                        colour — a pass, not a loop. Not on the lit row, which
                        is already where it points. */}
                    <span
                      className={cn(
                        // Icons only below `wide`; the label stays for
                        // screen readers.
                        "sr-only wide:not-sr-only",
                        showUnread &&
                          "text-shimmer-periodic [--shimmer-base:var(--muted-foreground)] group-hover:[--shimmer-base:var(--foreground)]",
                      )}
                    >
                      {item.label}
                    </span>
                  </span>

                  {/* A dot and a word, never a number: the conversation list
                      is where "how many, and from whom" belongs. The word
                      changes when one of them names you. In the icon rail the
                      word goes and the dot tucks into the row's top corner,
                      since a dot on the icon's centreline reads as part of the
                      glyph; wide, it sits on the label's line. */}
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
                        "absolute top-2.5 right-2 flex items-center gap-1.5 transition-opacity wide:top-1/2 wide:right-3 wide:-translate-y-1/2 md:wide:group-hover/row:opacity-0",
                        hasNewAnnouncement ? "text-red-500" : "text-primary",
                      )}
                    >
                      <span
                        className={cn(
                          "hidden text-xs leading-none font-medium wide:inline",
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
                {/* One click to split: on hover in the labelled rail, the
                    row offers to open beside what is already up. */}
                {!disabled && !active && (
                  <button
                    type="button"
                    onClick={() => workspace.openPane(item.href)}
                    aria-label={`Open ${item.label} beside`}
                    title={`Open ${item.label} beside · or drag it onto the page`}
                    className="absolute top-1/2 right-1.5 hidden size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground opacity-0 transition-[opacity,background-color,color] duration-150 group-hover/row:opacity-100 hover:bg-foreground/[0.08] hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring md:wide:grid"
                  >
                    <ViewColumnsIcon className="size-4" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        <NavUnderline list={list} href={litHref || null} />
      </div>

      <SplitViewButton />

      {/* Only while a vote waits on this account. */}
      <VoteRailCard />

      {/* A column under the icons, account last; one row once the rail is
          wide, account first, so the schedule and playtime sit on the rail's
          right edge and open beside it rather than over the avatar. Inset
          by margin, not padding, so its box is exactly the rail's content
          column: the account menu is anchored to it, and matching its width
          is what centres the menu in the rail. */}
      <div
        ref={foot}
        className="mb-3 ml-3 flex shrink-0 flex-col items-center gap-1 wide:flex-row"
      >
        {/* Home already shows the schedule as a card, so the button tucks
            away there and slides back in everywhere else — out of the column
            by its height, out of the row by its width. */}
        <div
          aria-hidden={onHome || undefined}
          inert={onHome}
          className={cn(
            "flex shrink-0 justify-center overflow-hidden transition-[width,height,opacity,margin,scale] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
            onHome
              ? "-mb-1 h-0 w-11 scale-75 opacity-0 wide:-mr-1 wide:mb-0 wide:h-11 wide:w-0"
              : "h-11 w-11 opacity-100",
          )}
        >
          <SchoolDayButton />
        </div>
        <SidebarPlaytime compact={compactPlaytime} />

        {/* Nothing links back to the marketing site: `/` bounces a live
            session straight back here, so it would be a round trip to
            nowhere. */}
        <div className="wide:order-first wide:mr-auto">
          <UserMenu anchor={foot} />
        </div>
      </div>
    </nav>
  );
}
