import { describe, expect, test } from "vitest";
import { schoolStatus } from "../../src/lib/school-schedule";

/** A wall-clock time in River Falls (CDT until Nov 1, CST after). */
const central = (date: string, time: string) =>
  Date.parse(
    `${date}T${time}:00${date >= "2026-11-01" && date < "2027-03-14" ? "-06:00" : "-05:00"}`,
  );

describe("RFHS bell schedule", () => {
  test("mid-block on a regular day", () => {
    const status = schoolStatus(central("2026-09-24", "08:00"));
    expect(status.state).toBe("in-session");
    if (status.state !== "in-session") return;
    expect(status.schedule).toBe("regular");
    expect(status.periods[status.index].name).toBe("Block 1");
    expect(status.passing).toBe(false);
  });

  test("snack break sits between Block 1 and Block 2", () => {
    const status = schoolStatus(central("2026-09-24", "09:10"));
    if (status.state !== "in-session") throw new Error(status.state);
    expect(status.periods[status.index].name).toBe("Snack break");
  });

  test("passing time points at the next period", () => {
    const status = schoolStatus(central("2026-09-24", "10:45"));
    if (status.state !== "in-session") throw new Error(status.state);
    expect(status.passing).toBe(true);
    expect(status.periods[status.index].name).toBe("W.I.N./Advisory");
  });

  test("late-start Mondays begin at 8:15", () => {
    const early = schoolStatus(central("2026-09-28", "08:00"));
    expect(early).toMatchObject({ state: "off", reason: "before" });
    const status = schoolStatus(central("2026-09-28", "08:20"));
    if (status.state !== "in-session") throw new Error(status.state);
    expect(status.schedule).toBe("late");
    expect(status.periods[status.index].name).toBe("Block 1");
  });

  test("after 2:55 points at the next school day", () => {
    const status = schoolStatus(central("2026-09-25", "15:00"));
    expect(status).toMatchObject({
      state: "off",
      reason: "after",
      next: { date: "2026-09-28", label: "Monday", schedule: "late" },
    });
  });

  test("holidays and breaks are days off", () => {
    expect(schoolStatus(central("2026-11-26", "10:00"))).toMatchObject({
      state: "off",
      occasion: "Thanksgiving break",
      next: { date: "2026-11-30" },
    });
    // Listed as a late start, but MLK Day wins.
    expect(schoolStatus(central("2027-01-18", "10:00"))).toMatchObject({
      state: "off",
      occasion: "MLK Day",
    });
  });

  test("summer has no next day once the year is over", () => {
    expect(schoolStatus(central("2027-06-10", "10:00"))).toMatchObject({
      state: "off",
      occasion: "Summer break",
      next: null,
    });
  });
});

test("a chosen lunch splits Block 3 around it", () => {
  const status = schoolStatus(central("2026-09-24", "12:10"), 2);
  if (status.state !== "in-session") throw new Error(status.state);
  expect(
    status.periods.slice(4, 7).map((p) => [p.name, p.start, p.end]),
  ).toEqual([
    ["Block 3", 11 * 60 + 24, 12 * 60 + 8],
    ["Lunch", 12 * 60 + 8, 12 * 60 + 33],
    ["Block 3", 12 * 60 + 33, 13 * 60 + 21],
  ]);
  expect(status.periods[status.index].name).toBe("Lunch");
  // Lunch 1 opens Block 3, so there is no class before it.
  const first = schoolStatus(central("2026-09-24", "12:10"), 1);
  if (first.state !== "in-session") throw new Error(first.state);
  expect(first.periods.map((p) => p.name)).toEqual([
    "Block 1", "Snack break", "Block 2", "W.I.N./Advisory", "Lunch", "Block 3", "Block 4",
  ]);
});
