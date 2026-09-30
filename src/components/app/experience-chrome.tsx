"use client";

import {
  ArrowPathIcon,
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  ArrowsRightLeftIcon,
  MagnifyingGlassIcon,
  Squares2X2Icon,
  StarIcon as StarOutlineIcon,
  ViewColumnsIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { StarIcon } from "@heroicons/react/24/solid";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  ExperienceQuotaDonut,
  PlaytimeBlocked,
  PlaytimeWarning,
  useExperienceQuota,
} from "@/components/app/experience-quota";
import { ExperienceAppIcon } from "@/components/app/experience-app-icon";
import {
  ListenSlot,
  useListen,
} from "@/components/app/listen/listen-provider";
import { useStageFullscreen } from "@/components/app/use-stage-fullscreen";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import type { ExperienceApp } from "@/lib/experience";
import { isListenApp } from "@/lib/listen";
import { readStoredJson, writeStoredJson } from "@/lib/storage";
import { cn } from "@/lib/utils";

export type ExperienceService = ExperienceApp & { src: string | null };

/** One running app. Its frame lives as long as the session does. */
type Session = { appId: string; run: number };

/** The second pane is open but has no app in it yet. */
const PICK = "__pick";

/** Cloud gaming captures the pointer and reads controllers. */
const CLOUD_GAMING = new Set(["xbox", "geforce-now"]);
/** Voice and video calls. The browser still asks before either is used. */
const CALLING = new Set(["discord", "snapchat"]);

/** Each app's own colour, for the wash behind its tile and its running dot. */
const BRAND: Record<string, string> = {
  xbox: "#107c10",
  x: "#71767b",
  youtube: "#ff0033",
  tiktok: "#fe2c55",
  netflix: "#e50914",
  spotify: "#1db954",
  gemini: "#4285f4",
  "apple-music": "#fa2d48",
  soccerrng: "#16a34a",
  discord: "#5865f2",
  "geforce-now": "#76b900",
  snapchat: "#f7d900",
};

/** The shelves on the launcher, in order. An app not named here goes on the last. */
const SHELVES: { label: string; ids: string[] }[] = [
  { label: "Watch", ids: ["youtube", "netflix", "tiktok"] },
  { label: "Listen", ids: ["spotify", "apple-music"] },
  { label: "Play", ids: ["xbox", "geforce-now", "soccerrng"] },
  { label: "Talk", ids: ["discord", "snapchat", "x"] },
  { label: "Ask", ids: ["gemini"] },
];

/**
 * Browse: a launcher over a workspace.
 *
 * The launcher is the page with nothing open — every app on a shelf by what
 * it is for, the ones you starred and the ones you opened last above them.
 * Opening an app starts a session: its frame is mounted once and kept, so
 * going back to the launcher or over to another app never reloads it. The
 * dock in the bar is the list of sessions; closing one is the only thing
 * that tears a frame down.
 *
 * Two apps can share the stage. The second pane sits beside the first at a
 * ratio the divider sets, and either side can be swapped or closed without
 * touching the other's frame — every frame is rendered in the same order at
 * all times and only its CSS `order`, size and visibility change.
 *
 * Music is the exception. Spotify and Apple Music keep playing after you
 * leave Browse, so their frames belong to the shell (`ListenProvider`) and
 * a pane only holds the place the shell lays the frame over. Their sessions
 * are the shell's, read back here, so the dock still lists them when you
 * return.
 */
export function ExperienceChrome({
  services,
  initialAppId,
  accessToken,
}: {
  services: ExperienceService[];
  initialAppId?: string;
  accessToken?: string | null;
}) {
  const listen = useListen();
  const shared = (appId: string) => listen.enabled && isListenApp(appId);
  const [ownSessions, setSessions] = useState<Session[]>(() => [
    ...(listen.enabled ? listen.sessions : []),
    ...(initialAppId &&
    !(listen.enabled && listen.sessions.some((s) => s.appId === initialAppId))
      ? [{ appId: initialAppId, run: 0 }]
      : []),
  ]);
  // In our order; a music session only while the shell has it.
  const listenSessions = listen.enabled ? listen.sessions : [];
  const sessions = [
    ...ownSessions.flatMap((session) =>
      shared(session.appId)
        ? listenSessions.filter((s) => s.appId === session.appId)
        : [session],
    ),
    ...listenSessions.filter(
      (s) => !ownSessions.some((session) => session.appId === s.appId),
    ),
  ];
  const [focus, setFocus] = useState<string | null>(initialAppId ?? null);
  const [split, setSplit] = useState<string | null>(null);
  const [ratio, setRatio] = useState(0.5);
  const [dragging, setDragging] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const panes = useRef<HTMLDivElement>(null);
  // One lease for the whole workspace, including apps running out of sight.
  const quota = useExperienceQuota(
    sessions.some((session) => serviceFor(services, session.appId)?.src),
  );
  const { full, canFull, toggleFull } = useStageFullscreen(stage);
  const latestAccess = useRef(accessToken ?? null);
  const frames = useRef(new Map<string, HTMLIFrameElement>());
  const splitApp = split && split !== PICK ? split : null;

  useEffect(() => {
    if (!accessToken) return;
    let stopped = false;
    async function refresh() {
      try {
        const response = await fetch("/browse/access", { method: "POST" });
        if (stopped) return;
        if (!response.ok) {
          if (response.status === 401 || response.status === 403)
            latestAccess.current = null;
          else return;
        } else {
          const data: { token: string } = await response.json();
          if (stopped) return;
          latestAccess.current = data.token;
        }
        for (const frame of frames.current.values()) {
          frame.contentWindow?.postMessage(
            { type: "experience-access", token: latestAccess.current },
            new URL(frame.src).origin,
          );
        }
      } catch {
        // A transient failure retries; the relay still rejects expired grants.
      }
    }
    function requestAccess(event: MessageEvent) {
      if (event.data?.type !== "experience-access-request") return;
      for (const frame of frames.current.values()) {
        if (
          frame.contentWindow === event.source &&
          new URL(frame.src).origin === event.origin
        ) {
          void refresh();
          break;
        }
      }
    }
    window.addEventListener("message", requestAccess);
    const interval = setInterval(refresh, 60_000);
    return () => {
      stopped = true;
      clearInterval(interval);
      window.removeEventListener("message", requestAccess);
    };
  }, [accessToken]);

  // The address follows the app in front, without a navigation, so a reload
  // or a shared link lands on it. Replaced rather than pushed: Back leaves
  // Browse instead of stepping through every app you looked at.
  useEffect(() => {
    const path = focus ? `/browse/${encodeURIComponent(focus)}` : "/browse";
    if (window.location.pathname !== path)
      window.history.replaceState(null, "", path);
    if (focus) rememberRecent(focus);
  }, [focus]);

  // Arriving on /browse/spotify hands the session to the shell. Only once
  // the shell is known: a hydrating render cannot tell a pane from the tab.
  const { enabled: listenEnabled, launch: listenLaunch } = listen;
  useEffect(() => {
    if (listenEnabled && initialAppId && isListenApp(initialAppId))
      listenLaunch(initialAppId);
  }, [listenEnabled, listenLaunch, initialAppId]);

  // The mini player can close a music app, and running out closes them all.
  // Whatever was showing it steps aside.
  const previousListen = useRef(listen.sessions);
  useEffect(() => {
    const gone = previousListen.current
      .filter((p) => !listen.sessions.some((s) => s.appId === p.appId))
      .map((p) => p.appId);
    previousListen.current = listen.sessions;
    if (gone.length === 0) return;
    setSessions((current) => current.filter((s) => !gone.includes(s.appId)));
    if (focus && gone.includes(focus)) {
      setFocus(splitApp && !gone.includes(splitApp) ? splitApp : null);
      setSplit(null);
    } else if (splitApp && gone.includes(splitApp)) {
      setSplit(null);
    }
  }, [listen.sessions, focus, splitApp]);

  const frameRef = (appId: string) => (frame: HTMLIFrameElement | null) => {
    if (frame) frames.current.set(appId, frame);
    else frames.current.delete(appId);
  };

  function launch(appId: string) {
    if (shared(appId)) listen.launch(appId);
    setSessions((current) =>
      current.some((session) => session.appId === appId)
        ? current
        : [...current, { appId, run: 0 }],
    );
  }

  function open(appId: string) {
    launch(appId);
    // Bringing the side pane's app to the front trades places with it.
    if (split === appId) setSplit(focus);
    setFocus(appId);
  }

  function openBeside(appId: string) {
    if (appId === focus) return;
    launch(appId);
    setSplit(appId);
  }

  function close(appId: string) {
    if (shared(appId)) listen.close(appId);
    setSessions((current) =>
      current.filter((session) => session.appId !== appId),
    );
    if (focus === appId) {
      setFocus(splitApp);
      setSplit(null);
    } else if (split === appId) {
      setSplit(null);
    }
  }

  function goHome() {
    setFocus(null);
    if (split === PICK) setSplit(null);
  }

  function reload(appId: string) {
    if (shared(appId)) return listen.reload(appId);
    setSessions((current) =>
      current.map((session) =>
        session.appId === appId
          ? { ...session, run: session.run + 1 }
          : session,
      ),
    );
  }

  function resizeTo(clientX: number) {
    const box = panes.current?.getBoundingClientRect();
    if (!box) return;
    setRatio(clamp((clientX - box.left) / box.width));
  }

  const focusService = focus ? serviceFor(services, focus) : undefined;

  return (
    <div
      ref={stage}
      className="relative flex h-full min-h-0 flex-col bg-sidebar"
    >
      <header className="flex h-14 shrink-0 items-center gap-2 px-3">
        <button
          onClick={goHome}
          aria-pressed={focus === null}
          className={cn(
            "flex h-9 shrink-0 items-center gap-2 rounded-full px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring",
            focus === null
              ? "bg-foreground text-background"
              : "text-foreground hover:bg-foreground/[0.06]",
          )}
        >
          <Squares2X2Icon className="size-4" />
          <span className="max-page-sm:sr-only">Apps</span>
        </button>

        {sessions.length > 0 && (
          <span aria-hidden="true" className="h-5 w-px shrink-0 bg-border" />
        )}

        <ul
          aria-label="Open apps"
          className="flex min-w-0 flex-1 [scrollbar-width:none] items-center gap-1 overflow-x-auto py-1"
        >
          {sessions.map((session) => {
            const service = serviceFor(services, session.appId);
            if (!service) return null;
            const front = session.appId === focus;
            const beside = session.appId === splitApp && focus !== null;
            return (
              <li
                key={session.appId}
                className={cn(
                  "group/chip flex h-9 shrink-0 items-center rounded-full pr-1 pl-1 transition-colors",
                  front
                    ? "bg-surface shadow-[0_0_0_1px_var(--border)]"
                    : beside
                      ? "bg-surface/60 shadow-[0_0_0_1px_var(--border)]"
                      : "hover:bg-foreground/[0.06]",
                )}
              >
                <button
                  onClick={() => open(session.appId)}
                  aria-current={front ? "page" : undefined}
                  title={service.label}
                  className="flex h-full min-w-0 items-center gap-2 rounded-full pr-1 pl-1 text-sm focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <span className="relative grid size-7 shrink-0 place-items-center rounded-full bg-background">
                    <ExperienceAppIcon id={service.id} className="size-4" />
                    <span
                      aria-hidden="true"
                      className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-sidebar"
                      style={{ background: brandOf(service.id) }}
                    />
                  </span>
                  <span
                    className={cn(
                      "max-w-32 truncate",
                      front || beside ? "font-medium" : "max-page-md:sr-only",
                    )}
                  >
                    {service.label}
                  </span>
                </button>
                <button
                  onClick={() => close(session.appId)}
                  aria-label={`Close ${service.label}`}
                  className="grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground opacity-0 transition-opacity group-focus-within/chip:opacity-100 group-hover/chip:opacity-100 hover:bg-foreground/[0.08] hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring max-page-md:opacity-100"
                >
                  <XMarkIcon className="size-3.5" />
                </button>
              </li>
            );
          })}
        </ul>

        {focusService && (
          <div className="flex shrink-0 items-center gap-0.5">
            {split ? (
              <>
                {splitApp && (
                  <BarButton
                    label="Swap sides"
                    onClick={() => {
                      setSplit(focus);
                      setFocus(splitApp);
                    }}
                    className="max-page-md:hidden"
                  >
                    <ArrowsRightLeftIcon className="size-4" />
                  </BarButton>
                )}
                <BarButton
                  label="Close side pane"
                  pressed
                  onClick={() => setSplit(null)}
                  className="max-page-md:hidden"
                >
                  <ViewColumnsIcon className="size-4" />
                </BarButton>
              </>
            ) : (
              <BarButton
                label="Open an app beside this one"
                onClick={() => setSplit(PICK)}
                className="max-page-md:hidden"
              >
                <ViewColumnsIcon className="size-4" />
              </BarButton>
            )}
            <BarButton
              label={`Reload ${focusService.label}`}
              onClick={() => {
                reload(focusService.id);
                if (splitApp) reload(splitApp);
              }}
            >
              <ArrowPathIcon className="size-4" />
            </BarButton>
          </div>
        )}

        <div className="flex shrink-0 items-center gap-0.5">
          <ExperienceQuotaDonut quota={quota} container={stage} />
          {canFull && (
            <BarButton
              label={full ? "Exit fullscreen" : "Fullscreen"}
              onClick={toggleFull}
            >
              {full ? (
                <ArrowsPointingInIcon className="size-4" />
              ) : (
                <ArrowsPointingOutIcon className="size-4" />
              )}
            </BarButton>
          )}
        </div>
      </header>

      {focus === null && (
        <Launcher
          services={services}
          running={sessions.map((session) => session.appId)}
          onOpen={open}
        />
      )}

      <div
        ref={panes}
        hidden={focus === null}
        className={cn(
          "relative min-h-0 flex-1 gap-0 px-2 pb-2",
          focus !== null && "flex",
        )}
      >
        {!quota.allowed && sessions.length > 0 ? (
          <div className="flex-1 overflow-y-auto rounded-2xl border border-border bg-surface">
            <PlaytimeBlocked quota={quota} />
          </div>
        ) : (
          sessions.map((session) => {
            const service = serviceFor(services, session.appId);
            if (!service) return null;
            const side =
              session.appId === focus
                ? "front"
                : session.appId === splitApp
                  ? "beside"
                  : null;
            return (
              <Pane
                key={session.appId}
                side={side}
                grow={split ? (side === "front" ? ratio : 1 - ratio) : 1}
              >
                {!service.src ? (
                  <div
                    role="status"
                    className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center"
                  >
                    <ExperienceAppIcon id={service.id} className="size-10" />
                    <p className="font-medium">
                      {service.label} is unavailable
                    </p>
                    <p className="max-w-xs text-sm text-muted-foreground">
                      It can’t be opened right now. Everything else still works.
                    </p>
                  </div>
                ) : shared(service.id) ? (
                  <ListenSlot appId={service.id} inert={dragging} />
                ) : (
                  <iframe
                    key={session.run}
                    ref={frameRef(session.appId)}
                    src={
                      accessToken
                        ? `${service.src}#${new URLSearchParams({ access: "1", appOrigin: typeof window === "undefined" ? "" : window.location.origin })}`
                        : service.src
                    }
                    title={service.label}
                    sandbox={`allow-scripts allow-same-origin allow-forms allow-popups${
                      CLOUD_GAMING.has(service.id) ? " allow-pointer-lock" : ""
                    }`}
                    allow={`fullscreen; autoplay; encrypted-media${
                      CLOUD_GAMING.has(service.id)
                        ? "; gamepad; microphone; screen-wake-lock"
                        : CALLING.has(service.id)
                          ? "; camera; microphone"
                          : ""
                    }`}
                    referrerPolicy="no-referrer"
                    className={cn(
                      "h-full w-full border-0 bg-white",
                      // A frame under the pointer swallows the drag.
                      dragging && "pointer-events-none",
                    )}
                  />
                )}
              </Pane>
            );
          })
        )}

        {split && quota.allowed && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize panes"
            aria-valuemin={25}
            aria-valuemax={75}
            aria-valuenow={Math.round(ratio * 100)}
            tabIndex={0}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              setDragging(true);
            }}
            onPointerMove={(event) => {
              if (dragging) resizeTo(event.clientX);
            }}
            onPointerUp={() => setDragging(false)}
            onPointerCancel={() => setDragging(false)}
            onDoubleClick={() => setRatio(0.5)}
            onKeyDown={(event) => {
              const step = event.shiftKey ? 0.1 : 0.025;
              if (event.key === "ArrowLeft") setRatio((r) => clamp(r - step));
              else if (event.key === "ArrowRight")
                setRatio((r) => clamp(r + step));
              else if (event.key === "Home") setRatio(0.25);
              else if (event.key === "End") setRatio(0.75);
              else return;
              event.preventDefault();
            }}
            style={{ order: 1 }}
            className="group/divider flex w-3 shrink-0 cursor-col-resize touch-none items-center justify-center outline-none max-page-md:hidden"
          >
            <span
              className={cn(
                "h-10 w-1 rounded-full bg-border-strong transition-[height,background-color] group-hover/divider:h-16 group-hover/divider:bg-primary group-focus-visible/divider:h-16 group-focus-visible/divider:bg-primary",
                dragging && "h-16 bg-primary",
              )}
            />
          </div>
        )}

        {split === PICK && quota.allowed && (
          <Pane side="beside" grow={1 - ratio}>
            <SidePicker
              services={services.filter((service) => service.id !== focus)}
              running={sessions.map((session) => session.appId)}
              onPick={openBeside}
              onCancel={() => setSplit(null)}
            />
          </Pane>
        )}
      </div>
      <PlaytimeWarning quota={quota} />
    </div>
  );
}

/** One side of the stage. Not on the stage at all when `side` is null. */
function Pane({
  side,
  grow,
  children,
}: {
  side: "front" | "beside" | null;
  grow: number;
  children: ReactNode;
}) {
  return (
    <div
      hidden={side === null}
      style={
        {
          order: side === "beside" ? 2 : 0,
          flex: `${grow} 1 0%`,
        } as CSSProperties
      }
      className={cn(
        "min-w-0 overflow-hidden rounded-2xl border border-border bg-surface",
        side === "beside" && "max-page-md:hidden",
      )}
    >
      {children}
    </div>
  );
}

function Launcher({
  services,
  running,
  onOpen,
}: {
  services: ExperienceService[];
  running: string[];
  onOpen: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const search = useRef<HTMLInputElement>(null);
  const starred = useStoredList(STARRED_KEY);
  const recent = useStoredList(RECENT_KEY);

  // `/` jumps to the search from anywhere on the launcher that isn't a field.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable='true']")) return;
      event.preventDefault();
      search.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const term = query.trim().toLowerCase();
  const matches = term
    ? services.filter((service) =>
        `${service.label} ${service.host} ${shelfOf(service.id)}`
          .toLowerCase()
          .includes(term),
      )
    : [];

  const pick = (ids: string[]) =>
    ids.flatMap((id) => {
      const service = serviceFor(services, id);
      return service ? [service] : [];
    });

  const shelves = useMemo(() => {
    const placed = new Set(SHELVES.flatMap((shelf) => shelf.ids));
    const rest = services
      .filter((service) => !placed.has(service.id))
      .map((service) => service.id);
    return [...SHELVES, { label: "More", ids: rest }]
      .map((shelf) => ({
        label: shelf.label,
        items: shelf.ids.flatMap((id) => {
          const service = serviceFor(services, id);
          return service ? [service] : [];
        }),
      }))
      .filter((shelf) => shelf.items.length > 0);
  }, [services]);

  const tile = (service: ExperienceService, size?: "wide") => (
    <AppTile
      key={service.id}
      service={service}
      running={running.includes(service.id)}
      starred={starred.includes(service.id)}
      onOpen={() => onOpen(service.id)}
      onStar={() => toggleStarred(service.id)}
      size={size}
    />
  );

  const recentApps = pick(recent)
    .filter((service) => !starred.includes(service.id))
    .slice(0, 4);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
      <div className="min-h-full rounded-2xl border border-border bg-surface">
        <div className="mx-auto w-full max-w-5xl px-5 pt-6 pb-16 page-sm:px-8 page-sm:pt-8">
          <form
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              if (matches[0]) onOpen(matches[0].id);
            }}
            className="flex h-11 w-full items-center gap-2.5 rounded-xl border border-border bg-background px-3.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20"
          >
            <MagnifyingGlassIcon className="size-4 shrink-0 text-muted-foreground" />
            <input
              ref={search}
              type="search"
              aria-label="Find an app"
              placeholder="Find an app"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setQuery("");
              }}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
            />
            {!query && <Kbd className="max-page-sm:hidden">/</Kbd>}
          </form>

          {term ? (
            <Shelf
              label={`${matches.length} ${matches.length === 1 ? "match" : "matches"}`}
            >
              {matches.length ? (
                matches.map((service) => tile(service))
              ) : (
                <p className="col-span-full py-10 text-center text-sm text-muted-foreground">
                  Nothing called “{query.trim()}”.
                </p>
              )}
            </Shelf>
          ) : (
            <>
              {starred.length > 0 && (
                <Shelf label="Starred" wide>
                  {pick(starred).map((service) => tile(service, "wide"))}
                </Shelf>
              )}
              {recentApps.length > 0 && (
                <Shelf label="Jump back in">
                  {recentApps.map((service) => tile(service))}
                </Shelf>
              )}
              {shelves.map((shelf) => (
                <Shelf key={shelf.label} label={shelf.label}>
                  {shelf.items.map((service) => tile(service))}
                </Shelf>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Shelf({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">
        {label}
      </h2>
      <div
        className={cn(
          "grid gap-3",
          wide
            ? "grid-cols-1 page-sm:grid-cols-2 page-lg:grid-cols-3"
            : "grid-cols-2 page-sm:grid-cols-3 page-lg:grid-cols-4",
        )}
      >
        {children}
      </div>
    </section>
  );
}

function AppTile({
  service,
  running,
  starred,
  onOpen,
  onStar,
  size,
}: {
  service: ExperienceService;
  running: boolean;
  starred: boolean;
  onOpen: () => void;
  onStar: () => void;
  size?: "wide";
}) {
  const brand = brandOf(service.id);
  return (
    <div
      className={cn(
        "group/tile relative isolate overflow-hidden rounded-2xl border border-border bg-background transition-colors duration-150 hover:bg-muted",
        size === "wide" ? "h-28" : "h-36",
      )}
    >
      <span
        aria-hidden="true"
        className="absolute -top-16 -right-16 -z-10 size-44 rounded-full opacity-[0.18] blur-2xl"
        style={{ background: brand }}
      />
      <button
        onClick={onOpen}
        className={cn(
          "flex h-full w-full rounded-2xl p-4 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          size === "wide" ? "items-center gap-4" : "flex-col justify-between",
        )}
      >
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-surface shadow-[0_0_0_1px_var(--border)]">
          <ExperienceAppIcon id={service.id} className="size-7" />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-medium">{service.label}</span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {running ? (
              <>
                <span
                  aria-hidden="true"
                  className="size-1.5 rounded-full"
                  style={{ background: brand }}
                />
                Running
              </>
            ) : (
              <span className="truncate">{displayHost(service.start)}</span>
            )}
          </span>
        </span>
      </button>
      <button
        onClick={onStar}
        aria-label={
          starred ? `Unstar ${service.label}` : `Star ${service.label}`
        }
        aria-pressed={starred}
        className={cn(
          "absolute top-2.5 right-2.5 grid size-8 place-items-center rounded-full transition-opacity hover:bg-foreground/[0.06] focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring",
          starred
            ? "text-amber-500"
            : "text-muted-foreground opacity-0 group-hover/tile:opacity-100 max-page-md:opacity-100",
        )}
      >
        {starred ? (
          <StarIcon className="size-4" />
        ) : (
          <StarOutlineIcon className="size-4" />
        )}
      </button>
    </div>
  );
}

/** The empty side of a split: every other app, one click from filling it. */
function SidePicker({
  services,
  running,
  onPick,
  onCancel,
}: {
  services: ExperienceService[];
  running: string[];
  onPick: (id: string) => void;
  onCancel: () => void;
}) {
  const ordered = [
    ...services.filter((service) => running.includes(service.id)),
    ...services.filter((service) => !running.includes(service.id)),
  ];
  return (
    <div className="flex h-full flex-col overflow-y-auto p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Open beside</h2>
          <p className="text-sm text-muted-foreground">
            Pick an app for this side.
          </p>
        </div>
        <BarButton label="Cancel" onClick={onCancel}>
          <XMarkIcon className="size-4" />
        </BarButton>
      </div>
      <ul className="grid gap-1">
        {ordered.map((service) => (
          <li key={service.id}>
            <button
              onClick={() => onPick(service.id)}
              className="flex w-full items-center gap-3 rounded-xl p-2 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-background shadow-[0_0_0_1px_var(--border)]">
                <ExperienceAppIcon id={service.id} className="size-5" />
              </span>
              <span className="min-w-0 flex-1 truncate font-medium">
                {service.label}
              </span>
              {running.includes(service.id) && (
                <span className="text-xs text-muted-foreground">Running</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BarButton({
  label,
  onClick,
  children,
  pressed,
  className,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  pressed?: boolean;
  className?: string;
}) {
  return (
    <Button
      variant="ghost"
      size="icon-lg"
      shape="circle"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className={cn(
        "text-foreground",
        pressed && "bg-foreground/[0.08]",
        className,
      )}
    >
      {children}
    </Button>
  );
}

function serviceFor(services: ExperienceService[], id: string) {
  return services.find((service) => service.id === id);
}

function brandOf(id: string) {
  return BRAND[id] ?? "var(--primary)";
}

function shelfOf(id: string) {
  return SHELVES.find((shelf) => shelf.ids.includes(id))?.label ?? "";
}

function displayHost(url: string) {
  return new URL(url).host.replace(/^www\./, "");
}

/** Neither pane narrower than a quarter of the stage. */
function clamp(ratio: number) {
  return Math.min(0.75, Math.max(0.25, ratio));
}

/*
 * Starred and recent apps, per device. Kept in storage rather than on the
 * account: they are a convenience, and a browser that blocks storage just
 * shows the shelves without them.
 */

const STARRED_KEY = "browse:starred";
const RECENT_KEY = "browse:recent";
const RECENT_LIMIT = 8;
const STORED_LIST_EVENT = "browse:stored-list";
const EMPTY: string[] = [];
const listCache = new Map<string, { raw: string | null; list: string[] }>();

function readList(key: string): string[] {
  const value = readStoredJson<unknown>(key);
  const raw = JSON.stringify(value);
  const cached = listCache.get(key);
  // `useSyncExternalStore` needs the same array back until the data changes.
  if (cached && cached.raw === raw) return cached.list;
  const list = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : EMPTY;
  listCache.set(key, { raw, list });
  return list;
}

function writeList(key: string, list: string[]) {
  writeStoredJson(key, list);
  window.dispatchEvent(new Event(STORED_LIST_EVENT));
}

function subscribeLists(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(STORED_LIST_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(STORED_LIST_EVENT, onChange);
  };
}

function useStoredList(key: string): string[] {
  return useSyncExternalStore(
    subscribeLists,
    () => readList(key),
    () => EMPTY,
  );
}

function toggleStarred(id: string) {
  const list = readList(STARRED_KEY);
  writeList(
    STARRED_KEY,
    list.includes(id) ? list.filter((item) => item !== id) : [...list, id],
  );
}

function rememberRecent(id: string) {
  const list = readList(RECENT_KEY);
  if (list[0] === id) return;
  writeList(
    RECENT_KEY,
    [id, ...list.filter((item) => item !== id)].slice(0, RECENT_LIMIT),
  );
}
