/**
 * River Falls High School's bell schedule, 2026-27.
 *
 * Transcribed from the school's "A-B Day & Bell Schedule" page and the
 * district's 2026-27 calendar (revised 4-15-2026). The school keeps Central
 * time, so every reading here is taken on the clock in River Falls rather than
 * the one on the reader's device.
 *
 * The published schedule lists blocks, W.I.N./Advisory and lunches; the
 * thirteen minutes between Block 1 and Block 2 on a regular day is snack
 * break. Late-start days skip it and run Block 1 at 8:15, with early arrival
 * breakfast before then — that counts as off hours here, since class hasn't
 * started.
 */

export const SCHOOL_TIME_ZONE = "America/Chicago";

export type PeriodKind = "block" | "break" | "advisory" | "lunch";

export type Period = {
  name: string;
  kind: PeriodKind;
  /** Minutes after midnight, school time. */
  start: number;
  end: number;
  /** Block 3 is split into three lunches; each student has one of them. */
  lunches?: readonly Period[];
};

export type ScheduleKind = "regular" | "late";

export type LunchNumber = 1 | 2 | 3;

export const LUNCHES: readonly LunchNumber[] = [1, 2, 3];

export function isLunchNumber(value: unknown): value is LunchNumber {
  return value === 1 || value === 2 || value === 3;
}

/**
 * The day as one student lives it: with a lunch picked, Block 3 becomes the
 * class on either side of it and the lunch itself, so the list is every
 * stretch of the day in order. Without one, Block 3 stays whole and keeps
 * all three lunches attached.
 */
export function personalPeriods(
  periods: readonly Period[],
  lunch: LunchNumber | null,
): readonly Period[] {
  if (!lunch) return periods;
  return periods.flatMap((period) => {
    const chosen = period.lunches?.[lunch - 1];
    if (!chosen) return [period];
    const block = { ...period, lunches: undefined };
    return [
      { ...block, end: chosen.start },
      { ...chosen, name: "Lunch" },
      { ...block, start: chosen.end },
    ].filter((part) => part.end > part.start);
  });
}

const at = (hours: number, minutes: number) => hours * 60 + minutes;

const lunch = (name: string, start: number, end: number): Period => ({
  name,
  kind: "lunch",
  start,
  end,
});

export const BELL_SCHEDULES: Record<ScheduleKind, readonly Period[]> = {
  regular: [
    { name: "Block 1", kind: "block", start: at(7, 35), end: at(9, 2) },
    { name: "Snack break", kind: "break", start: at(9, 2), end: at(9, 15) },
    { name: "Block 2", kind: "block", start: at(9, 15), end: at(10, 42) },
    {
      name: "W.I.N./Advisory",
      kind: "advisory",
      start: at(10, 49),
      end: at(11, 19),
    },
    {
      name: "Block 3",
      kind: "block",
      start: at(11, 24),
      end: at(13, 21),
      lunches: [
        lunch("Lunch 1", at(11, 24), at(11, 49)),
        lunch("Lunch 2", at(12, 8), at(12, 33)),
        lunch("Lunch 3", at(12, 51), at(13, 21)),
      ],
    },
    { name: "Block 4", kind: "block", start: at(13, 28), end: at(14, 55) },
  ],
  late: [
    { name: "Block 1", kind: "block", start: at(8, 15), end: at(9, 33) },
    { name: "Block 2", kind: "block", start: at(9, 40), end: at(10, 58) },
    {
      name: "W.I.N./Advisory",
      kind: "advisory",
      start: at(11, 5),
      end: at(11, 35),
    },
    {
      name: "Block 3",
      kind: "block",
      start: at(11, 40),
      end: at(13, 30),
      lunches: [
        lunch("Lunch 1", at(11, 40), at(12, 5)),
        lunch("Lunch 2", at(12, 20), at(12, 45)),
        lunch("Lunch 3", at(13, 0), at(13, 30)),
      ],
    },
    { name: "Block 4", kind: "block", start: at(13, 37), end: at(14, 55) },
  ],
};

export const FIRST_DAY = "2026-09-01";
export const LAST_DAY = "2027-06-04";

/** Days without a high school bell schedule, between the first and last day. */
export const NO_SCHOOL: Readonly<Record<string, string>> = {
  "2026-09-07": "Labor Day",
  "2026-10-05": "Virtual day",
  "2026-11-02": "Teacher in-service",
  "2026-11-25": "Thanksgiving break",
  "2026-11-26": "Thanksgiving break",
  "2026-11-27": "Thanksgiving break",
  "2026-12-23": "Winter break",
  "2026-12-24": "Winter break",
  "2026-12-25": "Winter break",
  "2026-12-28": "Winter break",
  "2026-12-29": "Winter break",
  "2026-12-30": "Winter break",
  "2026-12-31": "Winter break",
  "2027-01-01": "Winter break",
  "2027-01-18": "MLK Day",
  "2027-02-15": "Virtual day",
  "2027-03-15": "Spring break",
  "2027-03-16": "Spring break",
  "2027-03-17": "Spring break",
  "2027-03-18": "Spring break",
  "2027-03-19": "Spring break",
  "2027-04-02": "Teacher in-service",
  "2027-05-07": "No school",
  "2027-05-31": "Memorial Day",
};

/** Late-start Mondays. Jan 18 and Feb 15 are listed too but are no-school
 *  days, which win. */
export const LATE_START = new Set([
  "2026-09-14",
  "2026-09-21",
  "2026-09-28",
  "2026-10-12",
  "2026-10-19",
  "2026-10-26",
  "2026-11-09",
  "2026-11-16",
  "2026-11-23",
  "2026-11-30",
  "2026-12-07",
  "2026-12-14",
  "2026-12-21",
  "2027-01-04",
  "2027-01-11",
  "2027-01-18",
  "2027-01-25",
  "2027-02-01",
  "2027-02-08",
  "2027-02-15",
  "2027-02-22",
  "2027-03-01",
  "2027-03-08",
  "2027-03-22",
  "2027-03-29",
  "2027-04-05",
  "2027-04-12",
  "2027-04-19",
  "2027-04-26",
  "2027-05-03",
  "2027-05-10",
  "2027-05-17",
  "2027-05-24",
]);

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const parts = new Intl.DateTimeFormat("en-US", {
  timeZone: SCHOOL_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** The date (`YYYY-MM-DD`) and seconds after midnight on the school's clock. */
export function schoolClock(now: number): { date: string; seconds: number } {
  const field: Record<string, string> = {};
  for (const part of parts.formatToParts(now)) field[part.type] = part.value;
  return {
    date: `${field.year}-${field.month}-${field.day}`,
    seconds:
      Number(field.hour) * 3600 +
      Number(field.minute) * 60 +
      Number(field.second),
  };
}

function weekday(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

function addDays(date: string, days: number): string {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

/** Why there is no bell schedule on `date`, or `null` if there is one. */
export function dayOff(date: string): string | null {
  if (date < FIRST_DAY) return "Summer break";
  if (date > LAST_DAY) return "Summer break";
  const day = weekday(date);
  if (day === 0 || day === 6) return "Weekend";
  return NO_SCHOOL[date] ?? null;
}

export function scheduleFor(date: string): ScheduleKind | null {
  if (dayOff(date)) return null;
  return LATE_START.has(date) ? "late" : "regular";
}

export function formatClockTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const suffix = hours < 12 ? "am" : "pm";
  const hour12 = hours % 12 || 12;
  return `${hour12}:${String(minutes % 60).padStart(2, "0")} ${suffix}`;
}

export type NextDay = {
  date: string;
  /** "tomorrow", a weekday name, or a short date further out. */
  label: string;
  schedule: ScheduleKind;
  start: number;
};

/** The next day after `date` with a bell schedule, within the school year. */
export function nextSchoolDay(date: string): NextDay | null {
  let cursor = date < FIRST_DAY ? addDays(FIRST_DAY, -1) : date;
  for (let i = 0; i < 120; i++) {
    cursor = addDays(cursor, 1);
    if (cursor > LAST_DAY) return null;
    const schedule = scheduleFor(cursor);
    if (!schedule) continue;
    const gap = Math.round(
      (Date.parse(`${cursor}T12:00:00Z`) - Date.parse(`${date}T12:00:00Z`)) /
        86_400_000,
    );
    const label =
      gap === 1
        ? "tomorrow"
        : gap < 7
          ? WEEKDAYS[weekday(cursor)]
          : new Date(`${cursor}T12:00:00Z`).toLocaleDateString("en-US", {
              timeZone: "UTC",
              weekday: "short",
              month: "short",
              day: "numeric",
            });
    return {
      date: cursor,
      label,
      schedule,
      start: BELL_SCHEDULES[schedule][0].start,
    };
  }
  return null;
}

export type SchoolStatus =
  | {
      state: "off";
      /** "before" and "after" are school days outside the bell. */
      reason: "before" | "after" | "day-off";
      /** The holiday or break, for a day off. */
      occasion: string | null;
      schedule: ScheduleKind | null;
      next: NextDay | null;
    }
  | {
      state: "in-session";
      schedule: ScheduleKind;
      periods: readonly Period[];
      /** Seconds after midnight, school time. */
      seconds: number;
      /** Index of the period under way, or of the one being passed to. */
      index: number;
      passing: boolean;
      dayStart: number;
      dayEnd: number;
    };

export function schoolStatus(
  now: number,
  lunch: LunchNumber | null = null,
): SchoolStatus {
  const { date, seconds } = schoolClock(now);
  const schedule = scheduleFor(date);
  if (!schedule) {
    const occasion = dayOff(date);
    return {
      state: "off",
      reason: "day-off",
      occasion: occasion === "Weekend" ? null : occasion,
      schedule: null,
      next: nextSchoolDay(date),
    };
  }

  const periods = personalPeriods(BELL_SCHEDULES[schedule], lunch);
  const dayStart = periods[0].start;
  const dayEnd = periods[periods.length - 1].end;
  if (seconds < dayStart * 60 || seconds >= dayEnd * 60) {
    const before = seconds < dayStart * 60;
    return {
      state: "off",
      reason: before ? "before" : "after",
      occasion: null,
      schedule,
      next: before
        ? {
            date,
            label: "today",
            schedule,
            start: dayStart,
          }
        : nextSchoolDay(date),
    };
  }

  const index = periods.findIndex((period) => seconds < period.end * 60);
  return {
    state: "in-session",
    schedule,
    periods,
    seconds,
    index,
    passing: seconds < periods[index].start * 60,
    dayStart,
    dayEnd,
  };
}
