"use client";

import {
  ArrowLeftIcon,
  ArrowPathIcon,
  ArrowRightIcon,
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  LockClosedIcon,
  Squares2X2Icon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { ExperienceAppIcon } from "@/components/app/experience-app-icon";
import { EXPERIENCE_HREF, type ExperienceApp } from "@/lib/experience";
import { cn } from "@/lib/utils";

/**
 * A browser, drawn around a frame.
 *
 * The frame points at the experience origin, which is cross-origin to the
 * app, so the shell can see nothing of what happens inside it: not the URL
 * after the first click, not the title, not whether there is history to go
 * back to. Everything the chrome shows is therefore either ours (the app's
 * name and mark, the address it opened on) or a real browser control that
 * happens to work across the boundary:
 *
 * - Back and forward call the window's own history. The browser keeps one
 *   joint history for the page and every frame in it, so a navigation inside
 *   the app is what these step through. At the start of that history they
 *   step out of the app instead, which is also what a real tab does.
 * - Reload remounts the frame. Re-assigning the same `src` is a no-op, and
 *   there is no reaching into a cross-origin document to refresh it.
 * - Fullscreen takes the whole shell, so the controls come along.
 *
 * The sandbox reasoning is the one `HostedActivity` gives: `allow-same-origin`
 * is safe because the experience origin is not ours, and it is what lets the
 * service worker there register. `allow-forms` is a search box; `allow-popups`
 * lets a link that insists on a new tab open one rather than die silently.
 */
export function ExperienceChrome({
  app,
  src,
}: {
  app: ExperienceApp;
  src: string;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const [run, setRun] = useState(0);

  const full = useSyncExternalStore(
    subscribeFullscreen,
    () => document.fullscreenElement === stage.current,
    () => false,
  );
  const canFull = useSyncExternalStore(
    subscribeNever,
    () => document.fullscreenEnabled,
    () => false,
  );
  const toggleFull = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      stage.current?.requestFullscreen().catch(() => {});
    }
  }, []);

  const start = new URL(app.start);
  const path =
    start.pathname === "/" && !start.search
      ? ""
      : start.pathname + start.search;

  return (
    <div ref={stage} className="flex h-full min-h-0 flex-col bg-sidebar">
      {/* Tab strip: the window buttons, and one tab. */}
      <div className="flex items-end gap-3 px-3 pt-2">
        <div
          className="mb-2.5 flex items-center gap-1.5 pl-1"
          aria-hidden="true"
        >
          <span className="size-3 rounded-full bg-[#ff5f57]" />
          <span className="size-3 rounded-full bg-[#febc2e]" />
          <span className="size-3 rounded-full bg-[#28c840]" />
        </div>
        <div className="flex h-9 max-w-xs items-center gap-2 rounded-t-xl bg-surface pr-1 pl-3 text-sm">
          <ExperienceAppIcon id={app.id} className="size-4 shrink-0" />
          <span className="truncate">{app.label}</span>
          <Link
            href={EXPERIENCE_HREF}
            aria-label="Close tab"
            className="ml-1 flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <XMarkIcon className="size-4" />
          </Link>
        </div>
      </div>

      {/* Toolbar: navigation, the address, and the shell's own controls. */}
      <div className="flex items-center gap-1 border-b border-border bg-surface px-2 py-1.5">
        <ChromeButton label="Back" onClick={() => window.history.back()}>
          <ArrowLeftIcon className="size-4" />
        </ChromeButton>
        <ChromeButton label="Forward" onClick={() => window.history.forward()}>
          <ArrowRightIcon className="size-4" />
        </ChromeButton>
        <ChromeButton
          label="Reload"
          onClick={() => setRun((value) => value + 1)}
        >
          <ArrowPathIcon className="size-4" />
        </ChromeButton>

        <div
          className="mx-1 flex h-8 min-w-0 flex-1 items-center gap-2 rounded-full bg-muted px-3 text-sm"
          title={app.start}
        >
          <LockClosedIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">
            <span className="text-foreground">{start.host}</span>
            <span className="text-muted-foreground">{path}</span>
          </span>
        </div>

        {canFull && (
          <ChromeButton
            label={full ? "Exit fullscreen" : "Fullscreen"}
            onClick={toggleFull}
          >
            {full ? (
              <ArrowsPointingInIcon className="size-4" />
            ) : (
              <ArrowsPointingOutIcon className="size-4" />
            )}
          </ChromeButton>
        )}
        <Link
          href={EXPERIENCE_HREF}
          aria-label="All apps"
          title="All apps"
          className={chromeButtonClass}
        >
          <Squares2X2Icon className="size-4" />
        </Link>
      </div>

      <iframe
        key={run}
        src={src}
        title={app.label}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        allow="fullscreen; autoplay"
        referrerPolicy="no-referrer"
        className="min-h-0 w-full flex-1 border-0 bg-white"
      />
    </div>
  );
}

const chromeButtonClass =
  "flex size-8 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";

function ChromeButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(chromeButtonClass)}
    >
      {children}
    </button>
  );
}

function subscribeFullscreen(onChange: () => void) {
  document.addEventListener("fullscreenchange", onChange);
  return () => document.removeEventListener("fullscreenchange", onChange);
}

/** For a value the browser fixes at load and never changes again. */
const subscribeNever = () => () => {};
