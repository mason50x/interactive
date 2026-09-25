"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePreferences } from "@/components/preferences-provider";
import {
  formatClockTime,
  isLunchNumber,
  LUNCHES,
  type LunchNumber,
  schoolStatus,
  type Period,
  type SchoolStatus,
} from "@/lib/school-schedule";
import { cn } from "@/lib/utils";

/** Ticks every second once mounted, so the server and client agree first. */
function useSecondClock() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const initial = setTimeout(update, 0);
    const timer = setInterval(update, 1000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, []);
  return now;
}

export type SchoolDay = ReturnType<typeof useSchoolDay>;

/**
 * Everything the bell schedule needs, for the home card and the header
 * button alike: the clock, today's status, and the lunch — saved to the
 * account, so picking it in one place answers the other.
 */
export function useSchoolDay() {
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
  return { status, lunch, choose, needsLunch: loaded && lunch === null };
}

/**
 * The River Falls High School bell schedule, where "Recently played" used to
 * sit: every period with a ring that fills as it runs, or a beach when there
 * is no class to count.
 *
 * The first time through it asks which lunch you have, so Block 3 can be
 * split around it; the answer is saved to the account and changed from the
 * dropdown at the top.
 */
export function SchoolSchedule() {
  const day = useSchoolDay();
  return (
    <Card radius="xl" className="flex flex-col p-6">
      <SchoolDayContent day={day} />
    </Card>
  );
}

/** The schedule's contents, shared by the home card and the header popover. */
export function SchoolDayContent({
  day: { status, lunch, choose, needsLunch },
  compact = false,
}: {
  day: SchoolDay;
  compact?: boolean;
}) {
  const late = status?.state === "in-session" && status.schedule === "late";
  return (
    <>
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
      ) : needsLunch ? (
        <LunchPicker onChoose={choose} />
      ) : status.state === "off" ? (
        <OffHours status={status} compact={compact} />
      ) : (
        <InSession status={status} />
      )}
    </>
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

/**
 * A line of text that opens into the three lunches. Its list sits above the
 * header popover (`z-[60]`), which it also opens from.
 */
function LunchSelect({
  value,
  onChange,
}: {
  value: LunchNumber;
  onChange: (lunch: LunchNumber) => void;
}) {
  return (
    <Select
      value={String(value)}
      onValueChange={(next) => {
        const lunch = Number(next);
        if (isLunchNumber(lunch)) onChange(lunch);
      }}
    >
      <SelectTrigger
        aria-label="Your lunch"
        className="h-auto w-auto gap-0.5 rounded-md border-0 bg-transparent px-1 py-0.5 text-[0.8125rem] font-medium text-muted-foreground hover:bg-transparent hover:text-foreground data-popup-open:bg-transparent data-popup-open:text-foreground"
      >
        <SelectValue>
          {(current: string | null) => `Lunch ${current ?? value}`}
        </SelectValue>
      </SelectTrigger>
      <SelectContent positionerClassName="z-[70]">
        {LUNCHES.map((lunch) => (
          <SelectItem key={lunch} value={String(lunch)}>
            Lunch {lunch}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** A ring that fills clockwise from the top as time passes. */
export function Donut({
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

/** `1h 16m 5s`, dropping the leading units that are zero. */
function formatDuration(total: number) {
  const seconds = Math.max(0, Math.round(total));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h) return `${h}h ${m}m ${s}s`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

function InSession({
  status,
}: {
  status: Extract<SchoolStatus, { state: "in-session" }>;
}) {
  const { periods, seconds, index, passing } = status;
  // Between classes the gap gets a row of its own, so something is always
  // the one counting down.
  const rows: readonly Period[] = passing
    ? [
        ...periods.slice(0, index),
        {
          name: "Passing time",
          kind: "break",
          start: periods[index - 1].end,
          end: periods[index].start,
        },
        ...periods.slice(index),
      ]
    : periods;

  return (
    <ol className="mt-3 flex flex-1 flex-col divide-y divide-border">
      {rows.map((period) => {
        const done = seconds >= period.end * 60;
        const current = !done && seconds >= period.start * 60;
        const length = (period.end - period.start) * 60;
        const elapsed = seconds - period.start * 60;
        return (
          <li
            key={`${period.name}-${period.start}`}
            aria-current={current ? "step" : undefined}
            className="flex min-h-11 items-center gap-3 py-1.5"
          >
            {done ? (
              <DoneMark />
            ) : current ? (
              <Donut filled={elapsed / length} size={24} stroke={3.5} active />
            ) : (
              <UpcomingMark />
            )}
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-[0.9375rem]",
                current
                  ? "font-semibold text-foreground"
                  : done
                    ? "font-medium text-faint"
                    : "font-medium text-muted-foreground",
              )}
            >
              {period.name}
              {period.lunches && (
                <LunchChips lunches={period.lunches} seconds={seconds} />
              )}
            </span>
            {!done && (
              <span
                className={cn(
                  "shrink-0 text-[0.8125rem] tabular-nums",
                  current ? "font-semibold text-primary" : "text-faint",
                )}
              >
                {current
                  ? `${formatDuration(length - elapsed)} left`
                  : formatClockTime(period.start)}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Before a lunch is picked, Block 3 names all three and lights the one on. */
function LunchChips({
  lunches,
  seconds,
}: {
  lunches: readonly Period[];
  seconds: number;
}) {
  return (
    <span className="ml-2 inline-flex gap-1 align-middle">
      {lunches.map((lunch, i) => (
        <span
          key={lunch.name}
          className={cn(
            "rounded-full px-1.5 text-[0.6875rem] font-semibold",
            seconds >= lunch.start * 60 && seconds < lunch.end * 60
              ? "bg-primary text-primary-foreground"
              : "bg-foreground/[0.06] text-muted-foreground",
          )}
        >
          L{i + 1}
        </span>
      ))}
    </span>
  );
}

/** A finished period: a filled green circle with a white tick. */
function DoneMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-6 shrink-0" aria-hidden>
      <circle cx="12" cy="12" r="12" className="fill-emerald-500" />
      <path
        d="M7.5 12.5l3 3 6-6.5"
        fill="none"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-white"
      />
    </svg>
  );
}

/** A period still to come: the ring's track colour, filled, with a dash. */
function UpcomingMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-6 shrink-0" aria-hidden>
      <circle cx="12" cy="12" r="12" className="fill-foreground/[0.08]" />
      <path
        d="M8 12h8"
        strokeWidth="2.25"
        strokeLinecap="round"
        className="stroke-foreground/35"
      />
    </svg>
  );
}

function OffHours({
  status,
  compact,
}: {
  status: Extract<SchoolStatus, { state: "off" }>;
  compact: boolean;
}) {
  const { reason, occasion, next } = status;
  const headline =
    reason === "before"
      ? "Not yet"
      : reason === "after"
        ? "School’s out"
        : (occasion ?? "It’s the weekend");
  // Only before the bell is there anything worth adding to the headline.
  const message =
    reason === "before"
      ? `${status.schedule === "late" ? "Late start today · " : ""}Block 1 starts at ${formatClockTime(next!.start)}.`
      : null;

  return (
    <>
      <div
        className={cn(
          "flex flex-1 flex-col items-center justify-center text-center",
          compact ? "py-3" : "py-8",
        )}
      >
        <BeachIcon className={compact ? "size-16" : "size-24"} />
        <p className="mt-5 text-[1.25rem] font-semibold">{headline}</p>
        {message && (
          <p className="mt-1.5 max-w-64 text-[0.875rem] text-balance text-muted-foreground">
            {message}
          </p>
        )}
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
