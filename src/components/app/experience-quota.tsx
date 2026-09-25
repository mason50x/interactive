"use client";

import { Popover } from "@base-ui/react/popover";
import { PacketCover } from "@/components/app/packet-cover";
import { Card } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { ChevronDownIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
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
import {
  availablePlaytimeSeconds,
  stablePlaytimeSeconds,
  type PlaytimeDisplay,
} from "@/lib/playtime-display";

export function useExperienceQuota(active = false) {
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
      if (document.hidden || pending || Date.now() < nextCheck.current) return;
      pending = true;
      const requestSession = sessionId;
      try {
        const result = await acquire({ sessionId: requestSession });
        if (cancelled || document.hidden || requestSession !== sessionId) {
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
        const delay =
          result.remainingSeconds <= 0
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
      if (document.hidden) stop();
      else void tick();
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
    isAuthenticated,
    acquire,
    release,
    status?.allowanceSeconds,
    status?.resetsAt,
  ]);

  useEffect(() => {
    const hasTime = (status?.remainingSeconds ?? 0) > 0;
    if (hasTime && !hadTime.current) nextCheck.current = 0;
    hadTime.current = hasTime;
  }, [status?.remainingSeconds]);

  useEffect(() => {
    if (status) statusOffset.current = status.serverNow - Date.now();
  }, [status]);
  const serverNow = now + (active ? lease.offset : clockOffset);
  const allowed =
    active &&
    (paused ||
      (isAuthenticated &&
        visible &&
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
        visible tab; browsing is free.
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

/** The time left, as text in the header; its details drop open over the page. */
export function PlaytimeSidebar({
  quota,
  compact = false,
}: {
  quota: Quota;
  compact?: boolean;
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
    <div ref={root} className="relative shrink-0">
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
          "flex h-9 items-center gap-1 rounded-lg px-2 text-[0.8125rem] font-medium text-muted-foreground tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
          compact
            ? "cursor-default"
            : "cursor-pointer transition-colors hover:text-foreground",
        )}
      >
        <span
          className="inline-block min-w-[5ch] text-right leading-none"
          aria-hidden="true"
        >
          {label}
        </span>
        {!compact && (
          <ChevronDownIcon
            aria-hidden="true"
            className={cn(
              "playtime-spring size-3.5 transition-transform duration-[440ms] motion-reduce:transition-none",
              open && "rotate-180",
            )}
          />
        )}
      </button>
      <div
        id={detailsId}
        aria-hidden={!open}
        inert={!open}
        className={cn(
          "playtime-spring absolute top-full right-0 mt-1 w-64 transition-[opacity,transform,visibility] duration-[350ms] motion-reduce:transition-none",
          open
            ? "visible translate-y-0 opacity-100"
            : "invisible -translate-y-2 opacity-0",
        )}
      >
        <Card
          radius="sm"
          className="space-y-1.5 px-3 py-2.5 text-xs leading-snug text-foreground/85"
        >
          {seconds === 0 && (
            <p className="font-medium">Chat for more playtime.</p>
          )}
          <p>Your daily time counts only in an open player or proxy app.</p>
          <p>
            Resets at 7:30 a.m. CT. Room messages add 1.5 minutes, direct
            messages 45 seconds.
          </p>
          <Link
            href="/chat"
            className="inline-block font-medium text-primary hover:underline"
          >
            Open chat →
          </Link>
        </Card>
      </div>
    </div>
  );
}

export function PlaytimeBlocked({ quota }: { quota: Quota }) {
  if (quota.remaining === 0)
    return (
      <section
        role="status"
        className="flex min-h-full items-center justify-center bg-surface p-6 text-foreground sm:p-10"
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
