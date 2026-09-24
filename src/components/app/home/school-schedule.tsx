"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { usePreferences } from "@/components/preferences-provider";
import { ChevronDownIcon } from "@heroicons/react/16/solid";
import {
  formatClockTime,
  isLunchNumber,
  LUNCHES,
  type LunchNumber,
  schoolClock,
  schoolStatus,
  type NextDay,
  type Period,
  type SchoolStatus,
} from "@/lib/school-schedule";
import { cn } from "@/lib/utils";

// TEMP for UI work: pretend it is 7:45 am today (Central), ticking from there.
// Set to null to use the real clock.
const DEBUG_START: string | null = "07:45";

/** Ticks every second once mounted, so the server and client agree first. */
function useSecondClock() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const offset = DEBUG_START
      ? Date.parse(`${schoolClock(Date.now()).date}T${DEBUG_START}:00-05:00`) -
        Date.now()
      : 0;
    const update = () => setNow(Date.now() + offset);
    const initial = setTimeout(update, 0);
    const timer = setInterval(update, 1000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, []);
  return now;
}

/**
 * The River Falls High School bell schedule, where "Recently played" used to
 * sit: every period with a ring that fills as it runs, or a beach when there
 * is no class to count.
 *
 * The first time through it asks which lunch you have, so Block 3 can be
 * split around it; the answer is saved to the account and changed from the
 * dropdown in the header.
 */
export function SchoolSchedule() {
  const now = useSecondClock();
  const { preferences, update, loaded } = usePreferences();
  // Signed-out visitors have nowhere to save to, so their pick lives here.
  const [localLunch, setLocalLunch] = useState<LunchNumber | null>(null);
  const lunch = preferences.lunch ?? localLunch;
  const choose = (next: LunchNumber) => {
    setLocalLunch(next);
    update({ lunch: next });
  };

  const status = now === null ? null : schoolStatus(now, lunch);
  const late = status?.state === "in-session" && status.schedule === "late";

  return (
    <Card radius="xl" className="flex flex-col p-6">
      {(lunch !== null || late) && (
        <div className="-mt-2 flex items-center justify-center gap-1 text-[0.8125rem] text-muted-foreground">
          {late && <h2>Late start</h2>}
          {late && lunch !== null && <span aria-hidden>·</span>}
          {lunch !== null && <LunchSelect value={lunch} onChange={choose} />}
        </div>
      )}

      {status === null ? (
        <p className="text-[0.875rem] text-muted-foreground">
          Checking the bell schedule…
        </p>
      ) : loaded && lunch === null ? (
        <LunchPicker onChoose={choose} />
      ) : status.state === "off" ? (
        <OffHours status={status} />
      ) : (
        <InSession status={status} />
      )}
    </Card>
  );
}

function LunchPicker({ onChoose }: { onChoose: (lunch: LunchNumber) => void }) {
  return (
    <div className="flex flex-col">
      <h2 className="text-center text-[1.25rem] font-semibold">
        Which lunch do you have?
      </h2>
      <div className="mt-5 grid gap-2">
        {LUNCHES.map((lunch) => (
          <button
            key={lunch}
            type="button"
            onClick={() => onChoose(lunch)}
            className="group flex items-center gap-3 rounded-2xl border border-border px-3 py-2.5 text-left transition-colors outline-none hover:bg-foreground/[0.03] focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground/[0.06] text-[0.9375rem] font-bold tabular-nums transition-colors group-hover:bg-foreground/[0.1]">
              {lunch}
            </span>
            <span className="text-[0.9375rem] font-semibold">
              Lunch {lunch}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Native, so the list is the platform's own and never fights the page's
 *  layering; styled down to a line of text. */
function LunchSelect({
  value,
  onChange,
}: {
  value: LunchNumber;
  onChange: (lunch: LunchNumber) => void;
}) {
  return (
    <label className="relative flex cursor-pointer items-center gap-0.5 transition-colors hover:text-foreground">
      <select
        aria-label="Your lunch"
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (isLunchNumber(next)) onChange(next);
        }}
        className="cursor-pointer appearance-none bg-transparent pr-0.5 font-medium outline-none focus-visible:underline"
      >
        {LUNCHES.map((lunch) => (
          <option key={lunch} value={lunch}>
            Lunch {lunch}
          </option>
        ))}
      </select>
      <ChevronDownIcon aria-hidden className="pointer-events-none size-3" />
    </label>
  );
}

/** A ring that fills clockwise from the top as time passes. */
function Donut({
  filled,
  size,
  stroke,
  active = false,
}: {
  /** 0 to 1. */
  filled: number;
  size: number;
  stroke: number;
  active?: boolean;
}) {
  const radius = (size - stroke) / 2;
  const value = Math.min(1, Math.max(0, filled)) * 100;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden
      className="shrink-0 -rotate-90"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={stroke}
        className="stroke-foreground/[0.08]"
      />
      {value > 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${value} 100`}
          className={cn(
            "transition-[stroke-dasharray] duration-700",
            active ? "stroke-primary" : "stroke-foreground/25",
          )}
        />
      )}
    </svg>
  );
}

function formatSpan(seconds: number) {
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`;
}

function formatCountdown(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function range(period: Period) {
  return `${formatClockTime(period.start)} – ${formatClockTime(period.end)}`;
}

function InSession({
  status,
}: {
  status: Extract<SchoolStatus, { state: "in-session" }>;
}) {
  const { periods, seconds, index, passing } = status;

  return (
    <ol className="mt-4 flex flex-1 flex-col gap-0.5">
      {periods.map((period, i) => {
        const current = i === index && !passing;
        const next = i === index && passing;
        const done = i < index;
        const length = (period.end - period.start) * 60;
        const elapsed = current
          ? seconds - period.start * 60
          : done
            ? length
            : 0;
        return (
          <li
            key={`${period.name}-${period.start}`}
            aria-current={current ? "step" : undefined}
            className={cn(
              "-mx-2 rounded-2xl px-2 py-1.5",
              current && "bg-primary/[0.07]",
              done && "opacity-45",
            )}
          >
            <div className="flex items-center gap-3">
              <Donut
                filled={elapsed / length}
                size={30}
                stroke={4}
                active={current}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.9375rem] font-semibold">
                  {period.name}
                </span>
                <span className="block truncate text-[0.8125rem] text-muted-foreground tabular-nums">
                  {range(period)}
                </span>
              </span>
              <span
                className={cn(
                  "shrink-0 text-[0.8125rem] tabular-nums",
                  current || next
                    ? "font-semibold text-primary"
                    : "text-muted-foreground",
                )}
              >
                {current
                  ? `${formatCountdown(length - elapsed)} left`
                  : done
                    ? "Done"
                    : next
                      ? `in ${formatCountdown(period.start * 60 - seconds)}`
                      : `in ${formatSpan(period.start * 60 - seconds)}`}
              </span>
            </div>
            {period.lunches && (
              <ul className="mt-1.5 ml-[2.625rem] flex flex-wrap gap-1.5">
                {period.lunches.map((lunch) => {
                  const eating =
                    seconds >= lunch.start * 60 && seconds < lunch.end * 60;
                  const over = seconds >= lunch.end * 60;
                  return (
                    <li
                      key={lunch.name}
                      className={cn(
                        "flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.75rem] tabular-nums",
                        eating
                          ? "bg-primary text-primary-foreground"
                          : "bg-foreground/[0.05] text-muted-foreground",
                        over && !done && "opacity-50",
                      )}
                      title={range(lunch)}
                    >
                      {lunch.name.replace("Lunch ", "L")}
                      <span className="opacity-80">
                        {eating
                          ? `${formatSpan(lunch.end * 60 - seconds)} left`
                          : formatClockTime(lunch.start).replace(/ [ap]m$/, "")}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function nextLine(next: NextDay | null) {
  if (!next) return "Enjoy the summer.";
  const late = next.schedule === "late" ? "late start, " : "";
  return `Back ${next.label} · ${late}Block 1 at ${formatClockTime(next.start)}`;
}

function OffHours({
  status,
}: {
  status: Extract<SchoolStatus, { state: "off" }>;
}) {
  const { reason, occasion, next } = status;
  const headline =
    reason === "before"
      ? "Not yet"
      : reason === "after"
        ? "School’s out"
        : (occasion ?? "It’s the weekend");
  const message =
    reason === "before"
      ? `${status.schedule === "late" ? "Late start today · " : ""}Block 1 starts at ${formatClockTime(next!.start)}.`
      : occasion === "Summer break"
        ? next
          ? `First day is ${next.label}.`
          : "Enjoy the summer."
        : `${nextLine(next)}.`;

  return (
    <>
      <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
        <BeachIcon className="size-24" />
        <p className="mt-5 text-[1.25rem] font-semibold">{headline}</p>
        <p className="mt-1.5 max-w-64 text-[0.875rem] text-balance text-muted-foreground">
          {message}
        </p>
      </div>
    </>
  );
}

function BeachIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 96" fill="none" aria-hidden className={className}>
      <circle cx="74" cy="20" r="9" className="fill-amber-400" />
      {/* Umbrella canopy, pole and the sand it stands in. */}
      <path d="M16 46a30 30 0 0 1 52-14z" className="fill-primary" />
      <path
        d="M16 46c6-5 12-6 18-3M34 43c5-6 12-9 20-9"
        strokeWidth="2.5"
        strokeLinecap="round"
        className="stroke-primary-foreground/70"
      />
      <path
        d="M42 39l12 36"
        strokeWidth="3.5"
        strokeLinecap="round"
        className="stroke-foreground/60"
      />
      <path
        d="M8 78c14-6 30-7 44-4s26 3 36-2v16H8z"
        className="fill-amber-200 dark:fill-amber-300/70"
      />
      <path
        d="M10 64c5-3 9-3 14 0s9 3 14 0M56 62c5-3 9-3 14 0s9 3 14 0"
        strokeWidth="2.5"
        strokeLinecap="round"
        className="stroke-sky-400"
      />
    </svg>
  );
}
