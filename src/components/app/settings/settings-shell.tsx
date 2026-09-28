"use client";

import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/solid";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { SettingsSearch } from "@/components/app/settings/primitives";
import { settingsSections } from "@/components/app/settings/sections";
import { Kbd } from "@/components/ui/kbd";
import { SETTINGS_HREF } from "@/lib/nav";
import { cn } from "@/lib/utils";
import styles from "./settings.module.css";

/**
 * Everything about this site that is a matter of taste, on a page of its own.
 *
 * It used to be one custom page inside Clerk's account modal: five rows, no
 * room for more, and every change hidden behind the modal it was made in. Now
 * it is a page in the app, so what it changes — the accent, the corners, the
 * rail — happens around it in plain view, and there is room for as many
 * settings as are worth having. Clerk's own pages are still one button away,
 * under Account.
 *
 * Each tab is a page of its own, `/settings/<id>`, and this is the frame
 * around them: the title, the search box and the tabs. It lives in the
 * layout, so the query survives moving between tabs. Search is the one view
 * that spans them — while there is a query, every tab's rows are shown,
 * filtered, in place of the current one. `/` jumps to it.
 *
 * Nothing saves. Every control writes as it is touched, through the
 * subscription in `PreferencesProvider`, so there is no Save button to leave
 * unpressed.
 */
export function SettingsShell({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState("");
  const search = useRef<HTMLInputElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']"))
        return;
      event.preventDefault();
      search.current?.focus();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div>
      <div className="grid gap-8 lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-14">
        {/* A column of tabs on a wide screen; a strip that scrolls sideways
            above the page on a narrow one. */}
        <nav
          aria-label="Settings sections"
          className={cn(
            "sticky top-0 z-20 -mx-6 bg-surface/85 px-6 py-2 backdrop-blur-md sm:-mx-8 sm:px-8 lg:top-8 lg:mx-0 lg:self-start lg:bg-transparent lg:p-0 lg:backdrop-blur-none",
          )}
        >
          <label className="relative flex h-9 w-full items-center gap-2 rounded-lg border border-border bg-background px-3 transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
            <MagnifyingGlassIcon className="size-4 shrink-0 text-faint" />
            <input
              ref={search}
              type="search"
              aria-label="Search settings"
              placeholder="Search settings"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setQuery("");
              }}
              className="min-w-0 flex-1 bg-transparent text-[0.875rem] outline-none placeholder:text-faint [&::-webkit-search-cancel-button]:hidden"
            />
            {query ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setQuery("");
                  search.current?.focus();
                }}
                className="flex size-6 cursor-pointer items-center justify-center rounded-md text-faint hover:bg-muted hover:text-foreground"
              >
                <XMarkIcon className="size-4" />
              </button>
            ) : (
              <Kbd>/</Kbd>
            )}
          </label>
          <ul className="mt-3 flex gap-0.5 overflow-x-auto lg:flex-col">
            {settingsSections.map((section) => {
              const href = `${SETTINGS_HREF}/${section.id}`;
              const current = !query && pathname === href;
              return (
                <li key={section.id} className="shrink-0">
                  <Link
                    href={href}
                    scroll={false}
                    aria-current={current ? "page" : undefined}
                    onClick={() => setQuery("")}
                    className={cn(
                      "flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[0.875rem] font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                      current
                        ? "bg-foreground/[0.06] text-foreground"
                        : "text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground",
                    )}
                  >
                    <section.icon className="size-4 shrink-0" />
                    {section.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {query ? (
          <SettingsSearch value={query}>
            <div className={cn(styles.results, "flex min-w-0 flex-col gap-12")}>
              {settingsSections.map(({ id, Component }) => (
                <Component key={id} />
              ))}

              <div
                className={cn(
                  styles.empty,
                  "flex flex-col items-center rounded-2xl border border-dashed border-border px-6 py-16 text-center",
                )}
              >
                <MagnifyingGlassIcon className="size-8 text-faint" />
                <p className="mt-4 text-[1.0625rem] font-semibold">
                  Nothing matches “{query}”
                </p>
                <p className="mt-1 text-[0.875rem] text-muted-foreground">
                  Try a word like colour, font, sidebar or panic.
                </p>
              </div>
            </div>
          </SettingsSearch>
        ) : (
          <div className="min-w-0">{children}</div>
        )}
      </div>
    </div>
  );
}
