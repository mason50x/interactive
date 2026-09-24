"use client";

import { Popover } from "@base-ui/react/popover";
import { PacketCover } from "@/components/app/packet-cover";
import { Card } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { ChevronDownIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { api } from "@convex/_generated/api";

import {
  playtimeDay,
  REWARD_REQUIREMENTS,
} from "@config/playtime";
import { cn } from "@/lib/utils";
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
        Your daily minutes are shared across games, the proxy,
        entertainment, and simulators. Time runs only while a player or proxy
        app is open in a visible tab; browsing is free.
      </p>
      <p>
        Qualifying chat messages add 2 minutes each, even while time remains.{" "}
        {REWARD_REQUIREMENTS}
      </p>
      <p>
        Chat stays available. Sending the same message again, or a near-copy,
        within 30 minutes does not count.
      </p>
      <p className="text-muted-foreground">
        Resets to your daily limit every day at 7:30 a.m. Central
        Time. Extra minutes do not carry over.
      </p>
      <ButtonLink href="/chat" size="sm">
        Open chat
      </ButtonLink>
    </div>
  );
}

function RollingDigit({
  value,
  increasing,
}: {
  value: string;
  increasing: boolean;
}) {
  const [shown, setShown] = useState({
    current: value,
    change: 0,
  });
  if (shown.current !== value) {
    setShown({
      current: value,
      change: shown.change + 1,
    });
  }
  return (
    <span className="relative inline-block h-[1.125em] w-[0.64em] overflow-hidden text-center leading-[1.125]">
      <span
        key={shown.change}
        className={cn(
          "absolute inset-0",
          shown.change > 0 &&
            (increasing ? "playtime-digit-in-increase" : "playtime-digit-in"),
        )}
      >
        {shown.current}
      </span>
    </span>
  );
}

function RollingTime({
  label,
  seconds,
  minutesOnly = false,
}: {
  label: string;
  seconds: number | null;
  minutesOnly?: boolean;
}) {
  const [motion, setMotion] = useState({ value: seconds, increasing: false });
  if (motion.value !== seconds) {
    setMotion({
      value: seconds,
      increasing:
        motion.value !== null && seconds !== null && seconds > motion.value,
    });
  }
  const [minutes, remainder] = label.split(":");
  return (
    <span aria-hidden="true" className="inline-flex items-center leading-none">
      {Array.from(minutes).map((character, index) => (
        <RollingDigit
          key={index}
          value={character}
          increasing={motion.increasing}
        />
      ))}
      <span
        className={cn(
          "inline-flex shrink-0 items-center overflow-hidden transition-[width,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
          minutesOnly ? "w-0 opacity-0" : "w-[1.56em] opacity-100",
        )}
      >
        <span className="inline-block w-[0.28em] shrink-0 text-center">:</span>
        {Array.from(remainder).map((character, index) => (
          <RollingDigit
            key={index}
            value={character}
            increasing={motion.increasing}
          />
        ))}
      </span>
    </span>
  );
}

/** A rail card with details that open in the rail's own layout. */
export function PlaytimeSidebar({
  quota,
  compact = false,
}: {
  quota: Quota;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (compact && open) setOpen(false);
  const [showMinutes, setShowMinutes] = useState(false);
  if (!compact && showMinutes) setShowMinutes(false);
  useEffect(() => {
    if (!compact) return;
    const timer = window.setTimeout(() => setShowMinutes(true), 3500);
    return () => window.clearTimeout(timer);
  }, [compact]);
  const detailsId = useId();
  const seconds = quota.remaining;
  const minutesOnly = compact && showMinutes && seconds !== null && seconds >= 60;
  const label =
    seconds === null
      ? "—:—"
      : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return (
    <div className="min-w-0" style={{ viewTransitionName: "rail-playtime" }}>
      <div
        aria-label={`Playtime: ${label} remaining`}
        className={cn(
          "flex h-11 w-full items-center justify-center font-medium text-muted-foreground tabular-nums rail-narrow wide:hidden",
          compact ? "text-[0.625rem]" : "text-[0.75rem]",
        )}
      >
        <RollingTime label={label} seconds={seconds} minutesOnly={minutesOnly} />
      </div>
      <Card
        radius="sm"
        className="relative hidden h-full overflow-hidden rail-wide wide:block wide:w-full"
      >
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
            "playtime-spring flex w-full items-center justify-center transition-[background-color,scale] duration-300 outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset motion-reduce:transition-none",
            compact
              ? "h-full min-h-14 cursor-default px-1 py-1"
              : "cursor-pointer px-3 py-2 hover:bg-foreground/[0.03] active:scale-[0.985]",
          )}
        >
          <span className="flex flex-col items-center">
            <span
              className={cn(
                "flex items-center justify-center font-semibold tabular-nums",
                compact ? "text-[2rem]" : "text-[2.5rem]",
              )}
              style={{ lineHeight: 1 }}
            >
              <RollingTime label={label} seconds={seconds} minutesOnly={minutesOnly} />
            </span>
            {!compact && (
              <span className="mt-1.5 flex items-center gap-1 text-[0.75rem] text-muted-foreground">
                {seconds === 0 ? "Chat for +2m" : "Time remaining"}
                <ChevronDownIcon
                  aria-hidden="true"
                  className={cn(
                    "playtime-spring size-3 transition-transform duration-[440ms] motion-reduce:transition-none",
                    open && "rotate-180",
                  )}
                />
              </span>
            )}
          </span>
        </button>
        <div
          id={detailsId}
          aria-hidden={!open || compact}
          inert={!open || compact}
          className={cn(
            "playtime-spring grid transition-[grid-template-rows] duration-[440ms] motion-reduce:transition-none",
            open && !compact ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <div
              className={cn(
                "space-y-1.5 border-t border-border px-3 py-2.5 text-xs leading-snug text-foreground/85 transition-[opacity,transform] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                open && !compact
                  ? "translate-y-0 opacity-100 delay-75 duration-[350ms]"
                  : "-translate-y-2 opacity-0 duration-150",
              )}
            >
              <p>
                Your daily time counts only in an
                open player or proxy app.
              </p>
              <p>
                Resets at 7:30 a.m. CT. Qualifying chats add 2 minutes each.
              </p>
              <Link
                href="/chat"
                className="inline-block font-medium text-primary hover:underline"
              >
                Open chat →
              </Link>
            </div>
          </div>
        </div>
      </Card>
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
          <p>Send a new chat message to get 2 more minutes of playtime.</p>
          <p className="text-sm text-muted-foreground">
            {REWARD_REQUIREMENTS}
          </p>
          <ButtonLink href="/chat" target="_top">
            Go to chat
          </ButtonLink>
          <p className="text-sm text-muted-foreground">
            Your activity allowance resets at
            7:30 a.m. Central Time. Chat stays fully available.
          </p>
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

/** Unmount the actual player on expiry: an overlay would leave it running. */
export function PlaytimeGate({ children }: { children: ReactNode }) {
  const quota = useExperienceQuota(true);
  return quota.allowed ? children : <PlaytimeBlocked quota={quota} />;
}
