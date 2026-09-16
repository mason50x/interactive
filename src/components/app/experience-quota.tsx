"use client";

import { Popover } from "@base-ui/react/popover";
import { Button } from "@/components/ui/button";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useEffect, useState, type RefObject } from "react";
import { api } from "@convex/_generated/api";

const DAY = 86_400_000;

export function useExperienceQuota(active = false) {
  const { isAuthenticated } = useConvexAuth();
  const [now, setNow] = useState(() => Date.now());
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState(false);
  const [lease, setLease] = useState({ until: 0, offset: 0 });
  const acquire = useMutation(api.experience.acquire);
  const release = useMutation(api.experience.release);
  const status = useQuery(
    api.experience.status,
    isAuthenticated ? { day: Math.floor(now / DAY) } : "skip",
  );

  useEffect(() => {
    const tick = () => {
      setNow(Date.now());
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
    let nextCheck = 0;
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
      nextCheck = 0;
      setLease({ until: 0, offset: 0 });
      releaseOnExit(sessionId);
      // A late stop must never release a subsequently resumed session.
      sessionId = crypto.randomUUID();
    };
    const unload = () => releaseOnExit(sessionId);
    const tick = async () => {
      if (document.hidden || pending || Date.now() < nextCheck) return;
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
        nextCheck = receivedAt + Math.max(1000, delay);
      } catch {
        if (!cancelled) setError(true);
        nextCheck = Date.now() + 5000;
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
  }, [active, isAuthenticated, acquire, release]);

  const serverNow = now + lease.offset;
  const allowed = isAuthenticated && visible && lease.until > serverNow;
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
      ? "Daily Experience time: checking allowance"
      : `Daily Experience time: ${Math.ceil(quota.remaining / 60)} minutes remaining`;
  return (
    <Popover.Root>
      <Popover.Trigger
        render={<Button variant="ghost" size="icon" shape="circle" />}
        aria-label={label}
        title="Daily Experience time"
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
            <Popover.Title className="sr-only">
              Daily Experience time
            </Popover.Title>
            <ExperienceQuotaNotice quota={quota} />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
