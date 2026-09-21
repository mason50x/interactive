"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheckIcon } from "@heroicons/react/24/outline";
import { ShieldCheckIcon as ShieldCheckIconSolid } from "@heroicons/react/24/solid";
import { useChat } from "@/components/app/chat/chat-provider";
import { VersionCard } from "@/components/app/version-card";
import { RailConstellation } from "@/components/app/rail-constellation";
import { RailLockup } from "@/components/app/rail/rail-lockup";
import { useActiveNav } from "@/components/app/rail/use-active-nav";
import {
  NavPending,
  useNavPending,
} from "@/components/app/rail/use-nav-pending";
import { usePreferences } from "@/components/preferences-provider";
import { RailSearch } from "@/components/app/rail-search";
import { UserMenu } from "@/components/app/user-menu";
import { navItems, type NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { useWarmRoutes } from "@/lib/warm";

/**
 * The signed-in app's chrome: a vertical rail, not a header.
 *
 * The dashboard is a workspace rather than a page in the site, so it takes
 * none of the marketing chrome — no `SiteHeader` with its hover panels, no
 * `SiteFooter` with its legal links. Navigation, brand, and account all live
 * in this one column.
 *
 * It does not scroll and does not need `position: sticky` to manage it. The
 * layout is a viewport-height row in which this rail is a full-height, fixed
 * -width column, so the only thing that can scroll is the shell beside it.
 *
 * The rail draws no border of its own and paints no background: it sits on
 * the layout's chrome, which carries on around every side of the shell. The
 * shell's own border is what draws the edge between them, so a line here would
 * only be a second one.
 *
 * Rows are padded on the left and run flush to the rail's right edge, where
 * the shell's own 12px margin picks up. That is what puts the same 12px of
 * chrome on both sides of every hover blob and of the account popup, while
 * leaving the labels where left-aligned text belongs. Change the shell's
 * margin and this stops being true.
 *
 * Below `lg` the rail shows icons; larger screens always show labels.
 *
 * `isolate` is here for `RailConstellation`, which sits at `-z-10`: without a
 * stacking context of its own on this column, that layer would drop behind the
 * layout's `bg-sidebar` and never be seen.
 *
 * `z-30` is what keeps the rail *above* the shell beside it. The rail comes
 * first in document order, so with both at `z-index: auto` anything positioned
 * inside the shell paints over it. Everything the shell floats sits below this: the activities
 * filter bar at `z-20`, its shelf arrows at `z-10`.
 */
export function AppSidebar() {
  const pathname = usePathname();
  const { preferences } = usePreferences();
  const { hasUnread, mentioned, conversations, profile, staffRoles } = useChat();
  const isCeo = staffRoles.some(
    (entry) => entry.clerkId === profile?.clerkId && entry.role === "ceo",
  );
  const destinations: NavItem[] = isCeo
    ? [
        ...navItems,
        {
          label: "Admin",
          href: "/admin",
          icon: { outline: ShieldCheckIcon, solid: ShieldCheckIconSolid },
        },
      ]
    : navItems;
  const hasNewAnnouncement = conversations.some(
    (conversation) =>
      conversation.kind === "announcements" && conversation.unread > 0,
  );

  const { pendingHref, report } = useNavPending();
  const { activeHref, litHref } = useActiveNav(
    pathname,
    pendingHref,
    destinations,
  );

  // An activity is running in a frame beside this rail, and an activity is the most
  // expensive thing this app ever puts on a screen. The constellation is
  // decoration; it stays, but dimmed and slowed and at half its frame rate
  // while the machine has real work to do, and wakes back up the moment you
  // leave the activity. Every other route has it at full strength.
  //
  // Read off the path rather than signalled from the page, because the page is
  // a server component — see `src/app/(app)/activities/[slug]/page.tsx`.
  // `/activities` itself is the browser, not an activity, so this wants
  // the trailing segment and not just the prefix.
  const viewing = /^\/home\/activities\/[^/]+/.test(pathname);

  const warm = useWarmRoutes(pathname);

  return (
    <nav
      aria-label="Dashboard"
      className="relative isolate z-30 flex w-[4.5rem] shrink-0 flex-col transition-[width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] wide:w-60"
    >
      {preferences.constellation && <RailConstellation quiet={viewing} />}

      <RailLockup warm={warm} />

      <RailSearch />

      {/* The rail can outgrow a short viewport once there are enough
          destinations, so the list — and only the list — is allowed to
          scroll inside it. */}
      <ul className="relative flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pb-2 pl-3">
        {destinations.map((item) => {
          const active = item.href === activeHref;
          const lit = item.href === litHref;
          const Icon = item.icon.solid;
          return (
            <Fragment key={item.href}>
              <li>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  data-lit={lit ? "true" : undefined}
                  {...warm(item.href)}
                  className={cn(
                    "group nav-row relative flex h-11 items-center overflow-hidden rounded-lg border border-transparent px-3 text-[0.9375rem] font-medium whitespace-nowrap backdrop-blur-[3px]",
                    "outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset",
                    lit
                      ? "font-bold text-foreground"
                      : "text-muted-foreground transition-[background-color,color] duration-150 hover:bg-foreground/[0.05] hover:text-foreground",
                  )}
                >
                  {/* The underline follows the visible content: icon and label
                        on desktop, just the icon on smaller screens. */}
                  <span
                    className={cn(
                      "relative ml-2 inline-flex h-full min-w-0 items-center transition-[margin] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] wide:ml-0",
                      "after:absolute after:right-0 after:bottom-1 after:left-0 after:h-0.5 after:origin-left after:rounded-full after:bg-primary after:transition-transform after:duration-200 after:ease-out motion-reduce:after:transition-none",
                      lit ? "after:scale-x-100" : "after:scale-x-0",
                    )}
                  >
                    <Icon className="size-5 shrink-0" />
                    {/* An unread row's label glints now and then in the brand
                    colour — a pass, not a loop, so it can be noticed without
                    having to be watched. Not on the lit row, which is already
                    where it points. The base is the row's own ink, and it
                    follows the hover through `group-hover` because the word
                    is painted by the gradient and no longer by `color`. */}
                    <span
                      className={cn(
                        "max-w-0 overflow-hidden opacity-0 transition-[max-width,margin,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] wide:ml-3 wide:max-w-48 wide:opacity-100",
                        item.unread &&
                          hasUnread &&
                          !lit &&
                          "text-shimmer-periodic [--shimmer-base:var(--muted-foreground)] group-hover:[--shimmer-base:var(--foreground)]",
                      )}
                    >
                      {item.label}
                    </span>
                  </span>

                  {/* A dot and a word, never a number. The rail is a list of
                    places, and a count on it would be a second thing to read
                    on a row whose whole job is to be recognised at a glance —
                    the conversation list is where "how many, and from whom"
                    belongs. Any new message lights it, the room's included;
                    the word changes when one of them names you.

                    Anchored to the row's right edge, dot outermost, so the
                    word can fade with the label in the icon rail and leave the
                    dot where it was. There it tucks into the top corner beside
                    the icon, since the row is 60px and a dot on the icon's own
                    centreline would read as part of the glyph; with labels it
                    sits on the label's line. Absolutely positioned either way
                    so the row never changes shape between the two widths.

                    Not on the lit row: you are already where it points, and
                    the glint on the label goes for the same reason. */}
                  {item.unread && hasUnread && !lit ? (
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
                        "absolute top-2.5 right-2 flex items-center gap-1.5 [transition:top_300ms_cubic-bezier(0.32,0.72,0,1),right_300ms_cubic-bezier(0.32,0.72,0,1),translate_300ms_cubic-bezier(0.32,0.72,0,1)] wide:top-1/2 wide:right-3 wide:-translate-y-1/2",
                        hasNewAnnouncement ? "text-red-500" : "text-primary",
                      )}
                    >
                      <span
                        className={cn(
                          "text-xs leading-none font-medium opacity-0 transition-opacity duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] wide:opacity-100",
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
                      {/* The ring is Tailwind's ping slowed to the beat the
                        chat header's presence dot uses: at this size the stock
                        second reads as an alarm. The blanket reduced-motion
                        rule at the foot of `globals.css` stills it. */}
                      <span className="relative flex size-2 shrink-0">
                        <span className="absolute inset-0 animate-ping rounded-full bg-current opacity-70 [animation-duration:2.4s]" />
                        <span className="relative size-2 rounded-full bg-current" />
                      </span>
                    </span>
                  ) : null}

                  <NavPending href={item.href} report={report} />
                </Link>
              </li>
            </Fragment>
          );
        })}
      </ul>

      <VersionCard />

      {/* Nothing links back to the marketing site: `/` bounces a live session
          straight back here, so it would be a round trip to nowhere. */}
      <div className="shrink-0 pb-3 pl-3">
        <UserMenu />
      </div>
    </nav>
  );
}
