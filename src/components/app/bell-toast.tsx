"use client";

import { XMarkIcon } from "@heroicons/react/24/outline";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useSecondClock } from "@/components/app/home/school-schedule";
import { usePreferences } from "@/components/preferences-provider";
import type { Preferences } from "@/lib/preferences";
import {
  type Bell,
  formatClockTime,
  nextBell,
  schoolClock,
} from "@/lib/school-schedule";
import { cn } from "@/lib/utils";

/** How long a bell that has just rung stays on screen. */
const RING_SECONDS = 6;
/** The last stretch, where the countdown turns to the accent and pulses. */
const FINAL_SECONDS = 10;
const PREVIEW_SECONDS = 15;

/*
 * A preview from Settings: a made-up bell a few seconds out, so the toast can
 * be seen outside school hours. One module-level value, because the button
 * and the toast are nowhere near each other in the tree.
 */
let previewAt: number | null = null;
const previewListeners = new Set<() => void>();

function setPreview(at: number | null) {
  previewAt = at;
  for (const notify of previewListeners) notify();
}

export function previewBell() {
  setPreview(Date.now() + PREVIEW_SECONDS * 1000);
}

function subscribePreview(listener: () => void) {
  previewListeners.add(listener);
  return () => previewListeners.delete(listener);
}

function usePreview() {
  return useSyncExternalStore(
    subscribePreview,
    () => previewAt,
    () => null,
  );
}

function previewFor(at: number, now: number): Bell {
  const { date, seconds } = schoolClock(at);
  return {
    event: "end",
    period: { name: "Block 2", kind: "block", start: 0, end: 0 },
    next: null,
    last: false,
    date,
    at: seconds,
    remaining: Math.min(PREVIEW_SECONDS, Math.ceil((at - now) / 1000)),
  };
}

/** Whether `bell` is one the reader asked to be counted down to. */
function wanted(bell: Bell, which: Preferences["bellFor"]) {
  if (which === "day") return bell.last;
  if (which === "class")
    return bell.event === "end" && (bell.period.kind === "block" || bell.last);
  return true;
}

/** Lunch starting the moment a class stops, as on either side of a split Block 3. */
function intoLunch(bell: Bell) {
  return (
    bell.event === "end" &&
    bell.next?.kind === "lunch" &&
    bell.next.start === bell.period.end
  );
}

/** "Block 2", "lunch", "snack break": a period as it reads mid-sentence. */
function inSentence(bell: Bell) {
  const { name, kind } = bell.period;
  return kind === "lunch"
    ? "lunch"
    : kind === "break"
      ? name.toLowerCase()
      : name;
}

function headline(bell: Bell) {
  const { remaining } = bell;
  if (remaining <= 0) {
    if (bell.event === "start") return `${bell.period.name} is starting`;
    if (bell.last) return "School’s out";
    if (intoLunch(bell)) return "Lunch time";
    if (bell.period.kind === "lunch") return "Lunch is over";
    return `${bell.period.name} is over`;
  }
  const minutes = Math.ceil(remaining / 60);
  const amount =
    remaining < 60
      ? "Less than a minute"
      : `${minutes} minute${minutes === 1 ? "" : "s"}`;
  if (bell.event === "start") {
    return remaining < 60
      ? `${bell.period.name} starts in under a minute`
      : `${bell.period.name} starts in ${amount}`;
  }
  if (bell.last) return `${amount} left in the school day`;
  if (intoLunch(bell)) return `${amount} until lunch`;
  return `${amount} left of ${inSentence(bell)}`;
}

/** `4:59`, or `1:04:59` for anything past the hour. */
function formatCountdown(total: number) {
  const seconds = Math.max(0, total);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** Two soft strikes of a bell, drawn by the browser rather than downloaded. */
function chime() {
  try {
    const audio = new AudioContext();
    for (const [delay, pitch] of [
      [0, 880],
      [0.28, 660],
    ] as const) {
      const tone = audio.createOscillator();
      const gain = audio.createGain();
      tone.type = "sine";
      tone.frequency.value = pitch;
      const at = audio.currentTime + delay;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 1.2);
      tone.connect(gain).connect(audio.destination);
      tone.start(at);
      tone.stop(at + 1.25);
    }
    setTimeout(() => void audio.close(), 2000);
  } catch {
    // No audio (or none allowed yet): the toast is the bell.
  }
}

/**
 * A countdown to the next bell, in the corner of every page of the app.
 *
 * It appears a few minutes out — five unless Settings says otherwise — with
 * the time left in words and then the seconds, big, ticking down; rings for a
 * moment when it gets there, then goes. Every kind of bell counts by default:
 * the end of a class, of lunch or advisory, and the start of the next one
 * across passing time. Settings can narrow that to the end of each class or
 * only the end of the day, and turn the whole thing off.
 */
export function BellToast() {
  const now = useSecondClock();
  const preview = usePreview();
  const { preferences } = usePreferences();
  const { bellCountdown, bellLead, bellFor, bellChime, lunch, clock24 } =
    preferences;
  const [dismissed, setDismissed] = useState<string | null>(null);

  const lead = Number(bellLead) * 60;
  let bell: Bell | null = null;
  let span = lead;
  if (now !== null && preview !== null) {
    bell = previewFor(preview, now);
    span = PREVIEW_SECONDS;
  } else if (now !== null && bellCountdown) {
    // A bell read from a few seconds back that is due by now has just rung,
    // and gets its moment before the next one's countdown takes the corner.
    const earlier = nextBell(now - RING_SECONDS * 1000, lunch);
    const upcoming = nextBell(now, lunch);
    if (
      earlier &&
      wanted(earlier, bellFor) &&
      earlier.remaining <= RING_SECONDS
    ) {
      bell = { ...earlier, remaining: earlier.remaining - RING_SECONDS };
    } else if (
      upcoming &&
      wanted(upcoming, bellFor) &&
      upcoming.remaining <= lead
    ) {
      bell = upcoming;
    }
  }

  const expired = bell !== null && bell.remaining <= -RING_SECONDS;
  useEffect(() => {
    if (expired && preview !== null) setPreview(null);
  }, [expired, preview]);

  const key = bell ? `${bell.date}:${bell.at}:${bell.event}` : null;
  const ringing = bell !== null && bell.remaining <= 0;
  const rung = useRef<string | null>(null);
  useEffect(() => {
    if (!ringing || !key || rung.current === key) return;
    rung.current = key;
    // A split-view pane is another copy of the app; only the host rings.
    if (bellChime && !document.documentElement.hasAttribute("data-pane"))
      chime();
  }, [ringing, key, bellChime]);

  if (!bell || expired || (key === dismissed && preview === null)) return null;

  const { remaining } = bell;
  const final = remaining > 0 && remaining <= FINAL_SECONDS;
  const progress = Math.min(1, Math.max(0, remaining / span));

  return (
    <div
      key={key}
      role="status"
      className="fixed right-4 bottom-4 z-[90] w-[min(20rem,calc(100vw-2rem))] animate-in overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-xl shadow-black/[0.12] duration-300 fade-in-0 slide-in-from-bottom-4 [[data-pane]_&]:hidden"
    >
      <div className="flex items-start gap-2 px-4 pt-3.5">
        <p
          aria-live="polite"
          className="min-w-0 flex-1 text-[0.9375rem] leading-snug font-semibold"
        >
          {headline(bell)}
        </p>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => {
            if (preview !== null) setPreview(null);
            else setDismissed(key);
          }}
          className="-mt-0.5 -mr-1.5 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <XMarkIcon className="size-4" />
        </button>
      </div>

      <div className="flex items-end justify-between gap-3 px-4 pt-1 pb-3.5">
        <span
          role="timer"
          aria-label={`${formatCountdown(remaining)} left`}
          key={final ? remaining : undefined}
          className={cn(
            "text-[4rem] leading-none font-bold tabular-nums",
            ringing || final ? "text-primary" : "text-foreground",
            final && "animate-in duration-300 zoom-in-110",
            ringing && "animate-pulse",
          )}
        >
          {formatCountdown(remaining)}
        </span>
        <span className="pb-1.5 text-right text-[0.8125rem] text-muted-foreground">
          {ringing ? "Bell" : "Bell at"}
          <br />
          <span className="font-medium text-foreground tabular-nums">
            {formatClockTime(Math.floor(bell.at / 60), clock24)}
          </span>
        </span>
      </div>

      <div className="h-1 bg-foreground/[0.06]">
        <div
          className="h-full bg-primary transition-[width] duration-1000 ease-linear"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
    </div>
  );
}
