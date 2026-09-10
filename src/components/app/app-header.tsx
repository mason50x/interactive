"use client";

import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import { HeaderInvites } from "@/components/app/header-invites";
import { HeaderSearch } from "@/components/app/header-search";
import { RailConstellation } from "@/components/app/rail-constellation";
import { UserMenu } from "@/components/app/user-menu";
import { useChat } from "@/components/app/chat/chat-provider";
import { usePreferences } from "@/components/preferences-provider";
import { Wordmark } from "@/components/wordmark";
import { brand } from "@/lib/brand";
import { NAV_HREFS, navItems } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { useWarmRoutes } from "@/lib/warm";

export function AppHeader() {
  const pathname = usePathname();
  const { preferences } = usePreferences();
  const { hasUnread } = useChat();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const warm = useWarmRoutes(NAV_HREFS, pathname);

  const viewing = /^\/dashboard\/activities\/[^/]+/.test(pathname);

  const activeHref = navItems.reduce((best, item) => {
    const matches =
      pathname === item.href || pathname.startsWith(`${item.href}/`);
    return matches && item.href.length > best.length ? item.href : best;
  }, "");

  // The highlight behind the current tab is one element that slides, not a
  // background each link paints for itself. It is measured off the link
  // carrying `aria-current` after every route change, and again whenever the
  // nav is resized (a font swap, a label that wraps differently), so the pill
  // always lands where the tab actually is rather than where it was.
  const navRef = useRef<HTMLElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(
    null,
  );

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    const measure = () => {
      const current = nav.querySelector<HTMLElement>('[aria-current="page"]');
      setPill(
        current
          ? { left: current.offsetLeft, width: current.offsetWidth }
          : null,
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [activeHref]);

  return (
    <header className="relative isolate z-30 flex h-16 w-full shrink-0 items-center border-b border-border bg-background/90 backdrop-blur-md">
      {preferences.constellation && <RailConstellation quiet={viewing} />}

      {/* The gutter is inside the 1400px box, not around it, because that is
          how every page below sets its own — so the wordmark, the page title,
          the chat's list heading and the user menu all land on the same edges. */}
      <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between gap-4 px-6 sm:px-8 lg:px-10">
        {/* Left: Brand + Nav */}
        <div className="flex items-center gap-4 lg:gap-6">
          <Link
            href="/dashboard"
            aria-label={`${brand.name} dashboard`}
            {...warm("/dashboard")}
            className="shrink-0 transition-opacity hover:opacity-75"
          >
            <Wordmark short className="text-[1.125rem]" />
          </Link>

          {/* Desktop Navigation Links */}
          <nav
            ref={navRef}
            aria-label="Dashboard navigation"
            className="relative hidden items-center gap-1 md:flex"
          >
            {pill ? (
              <span
                aria-hidden
                className="pointer-events-none absolute top-0 left-0 h-9 rounded-lg bg-foreground/[0.08] transition-[transform,width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
                style={{
                  width: pill.width,
                  transform: `translateX(${pill.left}px)`,
                }}
              />
            ) : null}
            {navItems.map((item) => {
              const active = item.href === activeHref;
              const { outline: Outline, solid: Solid } = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  {...warm(item.href)}
                  className={cn(
                    "relative flex h-9 items-center gap-2 rounded-lg px-3 text-[0.875rem] font-medium transition-colors outline-none",
                    "focus-visible:ring-2 focus-visible:ring-ring/60",
                    active
                      ? "font-semibold text-foreground"
                      : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
                  )}
                >
                  <span className="relative size-4 shrink-0">
                    <Outline
                      className={cn(
                        "absolute inset-0 size-4 transition-opacity duration-150",
                        active && "opacity-0",
                      )}
                    />
                    <Solid
                      className={cn(
                        "absolute inset-0 size-4 transition-opacity duration-150",
                        !active && "opacity-0",
                      )}
                    />
                  </span>
                  <span>{item.label}</span>

                  {item.unread && hasUnread ? (
                    <span
                      aria-label="Unread messages"
                      role="status"
                      className="size-2 rounded-full bg-primary"
                    />
                  ) : null}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Center: Search */}
        <div className="mx-2 flex flex-1 justify-center sm:mx-4">
          <HeaderSearch />
        </div>

        {/* Right: Actions (Invites, UserMenu, Mobile Hamburger) */}
        <div className="flex items-center gap-1 sm:gap-2">
          <HeaderInvites />
          <UserMenu />

          {/* Mobile menu button */}
          <button
            type="button"
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((open) => !open)}
            className="flex size-9 cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground md:hidden"
          >
            {mobileMenuOpen ? (
              <XMarkIcon className="size-5" />
            ) : (
              <Bars3Icon className="size-5" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile navigation drawer / dropdown */}
      {mobileMenuOpen && (
        <div className="popup-slide absolute top-full right-0 left-0 z-40 border-b border-border bg-popover px-4 py-3 shadow-xl md:hidden">
          <nav aria-label="Mobile navigation" className="flex flex-col gap-1">
            {navItems.map((item) => {
              const active = item.href === activeHref;
              const { outline: Outline, solid: Solid } = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "flex h-10 items-center gap-3 rounded-lg px-3 text-[0.875rem] font-medium transition-colors",
                    active
                      ? "bg-foreground/[0.08] font-semibold text-foreground"
                      : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
                  )}
                >
                  <span className="relative size-4 shrink-0">
                    <Outline
                      className={cn(
                        "absolute inset-0 size-4",
                        active && "opacity-0",
                      )}
                    />
                    <Solid
                      className={cn(
                        "absolute inset-0 size-4",
                        !active && "opacity-0",
                      )}
                    />
                  </span>
                  <span>{item.label}</span>
                  {item.unread && hasUnread ? (
                    <span
                      aria-label="Unread messages"
                      role="status"
                      className="ml-auto size-2 rounded-full bg-primary"
                    />
                  ) : null}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </header>
  );
}
