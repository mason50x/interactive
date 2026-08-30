"use client";

import { UserButton } from "@clerk/nextjs";
import { Gamepad2, LayoutGrid, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/wordmark";
import { brand } from "@/lib/brand";
import { cn } from "@/lib/utils";

type NavItem = { label: string; href: string; icon: LucideIcon };

/**
 * Every destination inside the signed-in app. New dashboard routes are added
 * here and nowhere else — the bar is the only navigation these pages have.
 */
const navItems: NavItem[] = [
  { label: "Overview", href: "/dashboard", icon: LayoutGrid },
  {
    label: "Animal Adventure",
    href: "/dashboard/animal-adventure",
    icon: Gamepad2,
  },
];

/**
 * The signed-in app's chrome: one bar across the top.
 *
 * The dashboard is a workspace rather than a page in the site, so it takes
 * none of the marketing chrome — no `SiteHeader` with its hover panels, no
 * `SiteFooter` with its legal links. Navigation, brand, and account all live
 * in this one row.
 *
 * It does not scroll. The layout puts it in a flex column above a shell that
 * owns the scrolling, so the bar holds its place without `position: sticky`
 * and without a z-index fight against anything inside the content.
 *
 * Below `sm` the links drop to icons, so the row never wraps and no state is
 * needed to open or close a menu.
 */
export function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="flex h-16 shrink-0 items-center gap-4 px-4 sm:px-6">
      <Link
        href="/dashboard"
        aria-label={`${brand.name} dashboard`}
        className="shrink-0 rounded-full transition-opacity hover:opacity-70"
      >
        <span className="sm:hidden">
          <Wordmark showName={false} className="text-[1.375rem]" />
        </span>
        <span className="hidden sm:block">
          <Wordmark />
        </span>
      </Link>

      <nav aria-label="Dashboard" className="min-w-0 flex-1">
        <ul className="flex items-center gap-1">
          {navItems.map((item) => {
            // `startsWith` so a nested route keeps its parent lit, with the
            // boundary check stopping `/dashboards` from matching `/dashboard`.
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-9 items-center gap-2 rounded-lg px-2.5 text-[0.9375rem] transition-colors sm:px-3",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground",
                  )}
                >
                  <item.icon className="size-[1.125rem] shrink-0" aria-hidden />
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Nothing links back to the marketing site: `/` bounces a live session
          straight back here, so it would be a round trip to nowhere. */}
      <div className="flex shrink-0 items-center">
        <UserButton />
      </div>
    </header>
  );
}
