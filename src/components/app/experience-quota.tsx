"use client";

import { Popover } from "@base-ui/react/popover";
import { Button, ButtonLink } from "@/components/ui/button";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { api } from "@convex/_generated/api";

import { playtimeDay, REWARD_REQUIREMENTS } from "@config/playtime";

export function useExperienceQuota(active = false) {
  const { isAuthenticated } = useConvexAuth();
  const statusOffset = useRef(0);
  const [clockOffset, setClockOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState(false);
  const [lease, setLease] = useState({ until: 0, offset: 0 });
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
      void fetch("/experience/release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: id }),
        keepalive: true,
      }).catch(() => {});
    };
    const stop = () => {
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
        setError(false);
        const delay =
          result.remainingSeconds <= 0
            ? result.resetsAt - result.serverNow
            : result.leaseUntil - result.serverNow - 5_000;
        nextCheck.current = receivedAt + Math.max(1000, delay);
      } catch {
        if (!cancelled) setError(true);
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
    isAuthenticated &&
    visible &&
    lease.until > serverNow &&
    (status?.leaseUntil ?? 0) > serverNow;
  const remaining = status
    ? Math.max(
        0,
        Math.ceil(
          status.remainingSeconds +
            Math.max(0, status.leaseUntil - serverNow) / 1000,
        ),
      )
    : null;
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
        className={
          quota.remaining === 0 ? "text-muted-foreground" : "text-primary"
        }
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
        20 minutes shared across games, the proxy, entertainment, and
        simulators. Time runs only while a player or proxy app is open in a
        visible tab; browsing is free.
      </p>
      <p>
        When time runs out, send a qualifying chat message to earn 2 more
        minutes. {REWARD_REQUIREMENTS}
      </p>
      <p>
        Chat stays available. Each message can earn time once; near-copies do
        not count.
      </p>
      <p className="text-muted-foreground">
        Resets to 20 minutes every day at 7:35 a.m. Central Time. Extra minutes
        do not carry over.
      </p>
      <ButtonLink href="/chat" size="sm">
        Open chat
      </ButtonLink>
    </div>
  );
}

/** Always visible above the account menu, including the narrow icon rail. */
export function PlaytimeSidebar({ quota }: { quota: Quota }) {
  const seconds = quota.remaining;
  const label =
    seconds === null
      ? "—:—"
      : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return (
    <div className="shrink-0 pb-2 pl-3">
      <Popover.Root>
        <Popover.Trigger
          className="flex w-full flex-col items-center gap-1 rounded-lg px-1 py-2 text-foreground hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-ring wide:flex-row wide:gap-3 wide:px-3"
          aria-label={`Playtime: ${label} remaining. View details`}
        >
          <span className="hidden wide:block">
            <QuotaRing quota={quota} />
          </span>
          <span className="text-xs font-semibold tabular-nums wide:text-sm">
            {label}
          </span>
          <span className="hidden text-xs text-muted-foreground wide:block">
            {seconds === 0 ? "Chat for +2m" : "Playtime"}
          </span>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner
            side="right"
            align="end"
            sideOffset={12}
            className="z-50"
          >
            <Popover.Popup className="max-w-[calc(100vw-6rem)] rounded-xl border border-border bg-surface p-4 text-foreground shadow-xl outline-none">
              <Popover.Title className="mb-3 font-semibold">
                Your daily playtime
              </Popover.Title>
              <PlaytimeDetails quota={quota} />
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
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
            Send a new chat message to get 2 more minutes of
            playtime.
          </p>
          <p className="text-sm text-muted-foreground">
            {REWARD_REQUIREMENTS} Previously rewarded messages and near-copies
            do not earn more time.
          </p>
          <ButtonLink href="/chat" target="_top">
            Go to chat
          </ButtonLink>
          <p className="text-sm text-muted-foreground">
            Your shared allowance resets to 20 minutes at 7:35 a.m. Central
            Time. Chat stays fully available.
          </p>
        </div>
      </section>
    );
  return (
    <div
      role="status"
      className="flex min-h-full items-center justify-center p-8 text-center text-sm text-muted-foreground"
    >
      {quota.error
        ? "Unable to check your playtime. Retrying…"
        : !quota.visible
          ? "Playtime is paused while this tab is hidden."
          : "Checking your playtime…"}
    </div>
  );
}

/** Unmount the actual player on expiry: an overlay would leave it running. */
export function PlaytimeGate({ children }: { children: ReactNode }) {
  const quota = useExperienceQuota(true);
  return quota.allowed ? children : <PlaytimeBlocked quota={quota} />;
}
