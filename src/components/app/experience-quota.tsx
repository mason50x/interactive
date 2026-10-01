"use client";

import { Popover } from "@base-ui/react/popover";
import { PacketCover } from "@/components/app/packet-cover";
import { Card } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { ChevronUpIcon } from "@heroicons/react/20/solid";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { api } from "@convex/_generated/api";

import { playtimeDay, REWARD_REQUIREMENTS } from "@config/playtime";
import { cn } from "@/lib/utils";
import { useClickOutside } from "@/lib/use-click-outside";
import { useReportPlaytimeActivity } from "@/components/app/playtime-activity";
import { VoteBlocked } from "@/components/app/vote-prompt";
import {
  availablePlaytimeSeconds,
  stablePlaytimeSeconds,
  type PlaytimeDisplay,
} from "@/lib/playtime-display";

/**
 * `background` keeps a hidden tab's lease instead of stopping it, bought at
 * the background rate (see `acquire`). It was for music playing out of
 * sight; music is free now (`FREE_EXPERIENCE_APPS`), so nothing passes it.
 */
export function useExperienceQuota(
  active = false,
  { background = false }: { background?: boolean } = {},
) {
  const { isAuthenticated } = useConvexAuth();
  const statusOffset = useRef(0);
  const [clockOffset, setClockOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [visible, setVisible] = useState(false);
  useReportPlaytimeActivity(active && visible);
  const [error, setError] = useState(false);
  const [lease, setLease] = useState({ until: 0, offset: 0 });
  const [lastDisplay, setLastDisplay] = useState<PlaytimeDisplay | null>(null);
  // Leaving the tab stops the clock but must not unmount the player. While
  // paused, whatever was open stays open; the first lease after coming back
  // decides whether it may carry on.
  const [paused, setPaused] = useState(false);
  const wasAllowed = useRef(false);
  if (!active && paused) setPaused(false);
  const nextCheck = useRef(0);
  const hadTime = useRef(false);
  const acquire = useMutation(api.experience.acquire);
  const release = useMutation(api.experience.release);
  const status = useQuery(
    api.experience.status,
    isAuthenticated ? { day: playtimeDay(now).day } : "skip",
  );

  useEffect(() => {
    const tick = () => {
      setNow(Date.now());
      setClockOffset(statusOffset.current);
      setVisible(!document.hidden);
    };
    tick();
    const timer = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  useEffect(() => {
    if (!active || !isAuthenticated) return;
    let sessionId = crypto.randomUUID();
    let cancelled = false;
    let pending = false;
    nextCheck.current = 0;
    // A same-origin keepalive request survives page teardown; an ordinary
    // Convex WebSocket mutation cannot be relied on after the tab closes.
    const releaseOnExit = (id: string) => {
      void fetch("/browse/release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: id }),
        keepalive: true,
      }).catch(() => {});
    };
    const stop = () => {
      if (wasAllowed.current) setPaused(true);
      nextCheck.current = 0;
      setLease({ until: 0, offset: 0 });
      releaseOnExit(sessionId);
      // A late stop must never release a subsequently resumed session.
      sessionId = crypto.randomUUID();
    };
    const unload = () => releaseOnExit(sessionId);
    const tick = async () => {
      const hidden = document.hidden;
      if ((hidden && !background) || pending || Date.now() < nextCheck.current)
        return;
      pending = true;
      const requestSession = sessionId;
      try {
        const result = await acquire({
          sessionId: requestSession,
          ...(background && hidden ? { background: true } : {}),
        });
        if (
          cancelled ||
          (document.hidden && !background) ||
          requestSession !== sessionId
        ) {
          // Covers leaving while the start/renew request was in flight.
          void release({ sessionId: requestSession }).catch(() => {});
          return;
        }
        const receivedAt = Date.now();
        setLease({
          until: result.leaseUntil,
          offset: result.serverNow - receivedAt,
        });
        setPaused(false);
        setError(false);
        // A vote hold lifts through the `status` subscription, which resets
        // this check; the slow poll is only a backstop.
        const delay = result.voteRequired
          ? 30_000
          : result.remainingSeconds <= 0
            ? result.resetsAt - result.serverNow
            : result.leaseUntil - result.serverNow - 5_000;
        nextCheck.current = receivedAt + Math.max(1000, delay);
      } catch {
        if (!cancelled) {
          setPaused(false);
          setError(true);
        }
        nextCheck.current = Date.now() + 5000;
      } finally {
        pending = false;
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), 1000);
    const visibilityChanged = () => {
      if (document.hidden && !background) return stop();
      // The rate changes with visibility; say so at once rather than at renewal.
      nextCheck.current = 0;
      void tick();
    };
    document.addEventListener("visibilitychange", visibilityChanged);
    window.addEventListener("pagehide", unload);
    return () => {
      // A session re-check drops `isAuthenticated` for a moment; hold the
      // player through it until the next lease answers.
      if (wasAllowed.current) setPaused(true);
      cancelled = true;
      unload();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visibilityChanged);
      window.removeEventListener("pagehide", unload);
    };
  }, [
    active,
    background,
    isAuthenticated,
    acquire,
    release,
    status?.allowanceSeconds,
    status?.resetsAt,
  ]);

  useEffect(() => {
    const hasTime =
      (status?.remainingSeconds ?? 0) > 0 && !status?.voteRequired;
    if (hasTime && !hadTime.current) nextCheck.current = 0;
    hadTime.current = hasTime;
  }, [status?.remainingSeconds, status?.voteRequired]);

  useEffect(() => {
    if (status) statusOffset.current = status.serverNow - Date.now();
  }, [status]);
  const serverNow = now + (active ? lease.offset : clockOffset);
  // A forced vote stops the player at once rather than at the lease's end.
  const allowed =
    active &&
    !status?.voteRequired &&
    (paused ||
      (isAuthenticated &&
        (visible || background) &&
        lease.until > serverNow &&
        (status?.leaseUntil ?? 0) > serverNow));
  useEffect(() => {
    wasAllowed.current = allowed;
  });
  const rawRemaining = status
    ? availablePlaytimeSeconds(status, serverNow)
    : null;
  const remaining =
    status && rawRemaining !== null
      ? stablePlaytimeSeconds(rawRemaining, status, serverNow, lastDisplay)
      : null;
  if (
    status &&
    remaining !== null &&
    (lastDisplay?.remaining !== remaining ||
      lastDisplay.allowanceSeconds !== status.allowanceSeconds ||
      lastDisplay.resetsAt !== status.resetsAt)
  ) {
    setLastDisplay({
      remaining,
      allowanceSeconds: status.allowanceSeconds,
      resetsAt: status.resetsAt,
    });
  }
  return { status, remaining, allowed, error, visible };
}

type Quota = ReturnType<typeof useExperienceQuota>;

export function ExperienceQuotaNotice({ quota }: { quota: Quota }) {
  const seconds = quota.remaining;
  const remaining =
    seconds === null
      ? "Checking daily time…"
      : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} remaining`;
  return (
    <div className="flex items-center gap-2 text-sm">
      <QuotaRing quota={quota} />
      <p className="font-medium tabular-nums">{remaining}</p>
    </div>
  );
}

export function ExperienceDailyQuota() {
  const quota = useExperienceQuota();
  return <ExperienceQuotaNotice quota={quota} />;
}

function QuotaRing({ quota }: { quota: Quota }) {
  const fraction =
    quota.status && quota.remaining !== null
      ? Math.min(1, quota.remaining / quota.status.allowanceSeconds)
      : 0;
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-5 shrink-0 -rotate-90"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        className="text-muted-foreground/30"
      />
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        pathLength="100"
        strokeDasharray={`${fraction * 100} 100`}
        className={cn(
          "transition-[stroke-dasharray,color] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
          quota.remaining === 0 ? "text-muted-foreground" : "text-primary",
        )}
      />
    </svg>
  );
}

/** Kept inside the browser shell so the popup is also visible in fullscreen. */
export function ExperienceQuotaDonut({
  quota,
  container,
}: {
  quota: Quota;
  container: RefObject<HTMLElement | null>;
}) {
  const label =
    quota.remaining === null
      ? "Daily playtime: checking allowance"
      : `Daily playtime: ${Math.ceil(quota.remaining / 60)} minutes remaining`;
  return (
    <Popover.Root>
      <Popover.Trigger
        render={<Button variant="ghost" size="icon" shape="circle" />}
        aria-label={label}
        title="Daily playtime"
      >
        <QuotaRing quota={quota} />
      </Popover.Trigger>
      <Popover.Portal container={container}>
        <Popover.Positioner
          side="bottom"
          align="end"
          sideOffset={10}
          className="z-50"
        >
          <Popover.Popup className="max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-surface p-4 text-foreground shadow-xl outline-none">
            <Popover.Title className="sr-only">Daily playtime</Popover.Title>
            <PlaytimeDetails quota={quota} />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function PlaytimeDetails({ quota }: { quota: Quota }) {
  return (
    <div className="w-72 max-w-full space-y-3 text-sm">
      <ExperienceQuotaNotice quota={quota} />
      <p>
        Your daily minutes are shared across games, the proxy, entertainment,
        and simulators. Time runs only while a player or proxy app is open in a
        visible tab; browsing is free, and so are Spotify, Apple Music, and
        Gemini.
      </p>
      <p>
        Qualifying chat messages add time, even while time remains.{" "}
        {REWARD_REQUIREMENTS}
      </p>
      <p>
        Chat stays available. A third similar message in a row does not earn
        time.
      </p>
      <p className="text-muted-foreground">
        Resets to your daily limit every day at 7:30 a.m. Central Time. Extra
        minutes do not carry over.
      </p>
      <ButtonLink href="/chat" size="sm">
        Open chat
      </ButtonLink>
    </div>
  );
}

/** The time left, as text in the rail; its details open beside it over the page. */
/**
 * The rail's playtime clock: its own raised card above the rail's foot. Just
 * the time in the icon rail, where there is no room to say more; once the
 * rail is wide it is labelled, and opens upward — the card grows into the
 * rail above it — to say how playtime works, with the way to get more.
 */
export function PlaytimeSidebar({
  quota,
  compact = false,
  className,
}: {
  quota: Quota;
  compact?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  if (compact && open) setOpen(false);
  const root = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(root, close, open);
  const detailsId = useId();
  const seconds = quota.remaining;
  const label =
    seconds === null
      ? "—:—"
      : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return (
    <div ref={root} className={cn("shrink-0", className)}>
      <Card radius="sm" className="overflow-hidden bg-surface shadow-card">
        {/* Rows 0fr → 1fr: the details open to their own height, however
            the sentence wraps, without measuring it. The content fades and
            rises on the same curve and clock as the height, both ways, so
            the card changes as one piece. */}
        <div
          id={detailsId}
          aria-hidden={!open}
          inert={!open}
          className={cn(
            "hidden duration-[440ms] ease-(--ease-workspace) motion-safe:transition-[grid-template-rows] wide:grid",
            open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
        >
          <div className="min-h-0">
            <div
              className={cn(
                "space-y-3 px-3 pt-3 pb-1 duration-[440ms] ease-(--ease-workspace) motion-safe:transition-[opacity,translate]",
                open ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
              )}
            >
              <p className="text-[0.8125rem] leading-snug text-muted-foreground">
                {seconds === 0
                  ? "You're out for today. Chatting earns more."
                  : "Counts down only while you play, and resets at 7:30 a.m. Chatting earns more."}
              </p>
              <ButtonLink
                href="/chat"
                variant="secondary"
                size="lg"
                className="w-full"
                onClick={close}
              >
                Open chat
              </ButtonLink>
            </div>
          </div>
        </div>
        <button
          type="button"
          disabled={compact}
          aria-expanded={compact ? undefined : open}
          aria-controls={compact ? undefined : detailsId}
          aria-label={
            compact
              ? `Playtime: ${label} remaining`
              : `Playtime: ${label} remaining. ${open ? "Hide" : "View"} details`
          }
          onClick={() => setOpen((value) => !value)}
          className={cn(
            "flex h-11 w-full items-center justify-center gap-1.5 rounded-[inherit] px-1 text-sm font-medium text-foreground tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset wide:px-3",
            // Only the wide card opens; in the icon rail it's a readout.
            compact
              ? "cursor-default"
              : "pointer-events-none wide:pointer-events-auto wide:cursor-pointer wide:transition-colors wide:hover:bg-foreground/[0.03]",
          )}
        >
          <span
            aria-hidden="true"
            className="mr-auto hidden text-[0.8125rem] text-muted-foreground wide:inline"
          >
            Playtime
          </span>
          <span className="leading-none" aria-hidden="true">
            {label}
          </span>
          {!compact && (
            <ChevronUpIcon
              aria-hidden="true"
              className={cn(
                "hidden size-3.5 text-muted-foreground duration-[440ms] ease-(--ease-workspace) motion-safe:transition-transform wide:block",
                open && "rotate-180",
              )}
            />
          )}
        </button>
      </Card>
    </div>
  );
}

export function PlaytimeBlocked({ quota }: { quota: Quota }) {
  if (quota.status?.voteRequired) return <VoteBlocked />;
  if (quota.remaining === 0)
    return (
      <section
        role="status"
        className="flex min-h-full items-center justify-center bg-surface p-6 text-foreground page-sm:p-10"
      >
        <div className="w-full max-w-lg space-y-5">
          <h1 className="text-3xl font-semibold">Your playtime is used up</h1>
          <p>
            Send a real chat message to get 1.5 more minutes of playtime, or 45
            seconds in a direct message.
          </p>
          <ButtonLink href="/chat" target="_top">
            Go to chat
          </ButtonLink>
        </div>
      </section>
    );
  if (!quota.error)
    return (
      <div className="relative min-h-full flex-1 self-stretch">
        <PacketCover label="Playtime" holdMs={null} />
      </div>
    );
  return (
    <div
      role="status"
      className="flex min-h-full items-center justify-center p-8 text-center text-sm text-muted-foreground"
    >
      Unable to check your playtime. Retrying…
    </div>
  );
}

/** How long before the cutoff a running player warns to save. */
const WARNING_SECONDS = 60;

/**
 * The last minute, shown over the player. Activities are cross-origin, so the
 * app cannot save for them; the warning is what gives players the chance to
 * save before the gate unmounts the game. Clicks pass through to the game.
 */
export function PlaytimeWarning({
  quota,
  fixed = false,
}: {
  quota: Quota | null;
  fixed?: boolean;
}) {
  const seconds = quota?.remaining;
  if (!quota?.allowed || seconds == null || seconds <= 0) return null;
  if (seconds > WARNING_SECONDS) return null;
  return (
    <div
      className={cn(
        "pointer-events-none inset-x-0 bottom-4 z-30 flex justify-center px-4",
        fixed ? "fixed" : "absolute",
      )}
    >
      <p
        role="status"
        className="flex items-center gap-2 rounded-full border border-white/15 bg-black/70 px-4 py-2 text-sm text-white shadow-lg backdrop-blur-md"
      >
        <span>Playtime is almost up. Save your progress now.</span>
        <span aria-hidden="true" className="font-medium tabular-nums">
          0:{String(seconds).padStart(2, "0")}
        </span>
      </p>
    </div>
  );
}

const GateQuotaContext = createContext<Quota | null>(null);

/** The gate's own clock, for a player that places the warning itself. */
export function usePlaytimeGateQuota() {
  return useContext(GateQuotaContext);
}

/**
 * Unmount the actual player on expiry: an overlay would leave it running.
 * The warning shows fixed to the viewport unless `placesWarning` says the
 * player renders `PlaytimeWarning` itself, as a fullscreen stage must.
 */
export function PlaytimeGate({
  children,
  placesWarning = false,
}: {
  children: ReactNode;
  placesWarning?: boolean;
}) {
  const quota = useExperienceQuota(true);
  if (!quota.allowed) return <PlaytimeBlocked quota={quota} />;
  return (
    <GateQuotaContext.Provider value={quota}>
      {children}
      {!placesWarning && <PlaytimeWarning quota={quota} fixed />}
    </GateQuotaContext.Provider>
  );
}
