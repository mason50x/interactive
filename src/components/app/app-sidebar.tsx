"use client";

import { Gamepad2, LayoutGrid, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserMenu } from "@/components/app/user-menu";
import { Wordmark } from "@/components/wordmark";
import { brand } from "@/lib/brand";
import { cn } from "@/lib/utils";

type NavItem = { label: string; href: string; icon: LucideIcon };

/**
 * Every destination inside the signed-in app. New dashboard routes are added
 * here and nowhere else — the rail is the only navigation these pages have.
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
 * the layout's white sheet, which carries on around every side of the shell.
 * The recessed shell beside it is what draws the edge between them, so a line
 * here would only be a second one.
 *
 * Below `lg` it drops to icons, so the layout never has to reflow into a top
 * bar and no state is needed to open or close it.
 */
export function AppSidebar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Dashboard"
      className="flex w-[4.5rem] shrink-0 flex-col lg:w-60"
    >
      <div className="flex h-16 items-center justify-center px-4 lg:justify-start lg:px-5">
        <Link
          href="/dashboard"
          aria-label={`${brand.name} dashboard`}
          className="rounded-full transition-opacity hover:opacity-70"
        >
          <span className="lg:hidden">
            <Wordmark showName={false} className="text-[1.375rem]" />
          </span>
          <span className="hidden lg:block">
            <Wordmark />
          </span>
        </Link>
      </div>

      {/* The rail can outgrow a short viewport once there are enough
          destinations, so the list — and only the list — is allowed to
          scroll inside it. */}
      <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 py-2">
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
                  "flex h-11 items-center justify-center gap-3 rounded-lg text-[0.9375rem] transition-colors lg:justify-start lg:px-3",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground",
                )}
              >
                <item.icon className="size-[1.125rem] shrink-0" aria-hidden />
                <span className="hidden lg:inline">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Nothing links back to the marketing site: `/` bounces a live session
          straight back here, so it would be a round trip to nowhere. */}
      <div className="shrink-0 px-3 pb-3">
        <UserMenu />
      </div>
    </nav>
  );
}
