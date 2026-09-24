/// <reference types="vite/client" />
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";
import {
  generatePuzzle,
  solve,
  type PuzzleParams,
} from "../../convex/geometry";
import { PUZZLE_GOAL, PUZZLE_TIME_MS } from "../../convex/timeoutPuzzles";

const modules = import.meta.glob("../../convex/**/*.ts");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 8, 21, 12));
  vi.stubEnv("STAFF_ROLES", JSON.stringify({ head: "head_moderator" }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function setup() {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  await t.run(async (ctx) => {
    for (const clerkId of ["head", "member"]) {
      await ctx.db.insert("users", { clerkId, username: clerkId });
    }
  });
  await t.withIdentity({ subject: "head" }).mutation(api.timeouts.set, {
    clerkId: "member",
    enabled: true,
    reason: "Repeated disruption",
    durationMinutes: 60,
  });
  return { t, member: t.withIdentity({ subject: "member" }) };
}

async function begin(member: Awaited<ReturnType<typeof setup>>["member"]) {
  const started = await member.mutation(api.timeoutPuzzles.start, {});
  if (started.status !== "started") throw new Error("expected a run");
  return started;
}

const right = (params: PuzzleParams) => solve(params).answer;

test("the server hands out givens only, never the answer", async () => {
  const { member } = await setup();
  const { puzzle } = await begin(member);
  expect(puzzle.streak).toBe(0);
  expect(puzzle.goal).toBe(PUZZLE_GOAL);
  expect(JSON.stringify(puzzle)).not.toMatch(/answer|solution|working/);
});

test("twenty right in a row lifts the timeout", async () => {
  const { member } = await setup();
  const started = await begin(member);
  const { session } = started;
  let { puzzle } = started;
  for (let i = 1; i < PUZZLE_GOAL; i++) {
    const result = await member.mutation(api.timeoutPuzzles.answer, {
      session,
      guess: right(puzzle.params),
    });
    if (result.status !== "correct") throw new Error(result.status);
    expect(result.puzzle.streak).toBe(i);
    puzzle = result.puzzle;
  }
  const last = await member.mutation(api.timeoutPuzzles.answer, {
    session,
    guess: right(puzzle.params),
  });
  expect(last.status).toBe("passed");
  expect(await member.query(api.timeouts.mine, {})).toBeNull();
  expect((await member.mutation(api.timeoutPuzzles.start, {})).status).toBe(
    "clear",
  );
});

test("a wrong answer, a late answer or leaving the tab resets the streak", async () => {
  const { member } = await setup();
  const { session, puzzle } = await begin(member);
  const first = await member.mutation(api.timeoutPuzzles.answer, {
    session,
    guess: right(puzzle.params),
  });
  if (first.status !== "correct") throw new Error(first.status);
  expect(first.puzzle.streak).toBe(1);

  const wrong = await member.mutation(api.timeoutPuzzles.answer, {
    session,
    guess: right(first.puzzle.params) + 1000,
  });
  if (wrong.status !== "wrong") throw new Error(wrong.status);
  expect(wrong.puzzle.streak).toBe(0);

  const again = await member.mutation(api.timeoutPuzzles.answer, {
    session,
    guess: right(wrong.puzzle.params),
  });
  if (again.status !== "correct") throw new Error(again.status);
  const left = await member.mutation(api.timeoutPuzzles.forfeit, { session });
  if (left.status !== "reset") throw new Error(left.status);
  expect(left.puzzle.streak).toBe(0);
  // The puzzle seen before leaving is retired along with the streak.
  expect(left.puzzle.params).not.toEqual(again.puzzle.params);

  const warmUp = await member.mutation(api.timeoutPuzzles.answer, {
    session,
    guess: right(left.puzzle.params),
  });
  if (warmUp.status !== "correct") throw new Error(warmUp.status);
  vi.advanceTimersByTime(PUZZLE_TIME_MS + 1);
  const late = await member.mutation(api.timeoutPuzzles.answer, {
    session,
    guess: right(warmUp.puzzle.params),
  });
  if (late.status !== "late") throw new Error(late.status);
  expect(late.puzzle.streak).toBe(0);
});

test("a reload or a second tab restarts the run and retires the old session", async () => {
  const { member } = await setup();
  const first = await begin(member);
  const ok = await member.mutation(api.timeoutPuzzles.answer, {
    session: first.session,
    guess: right(first.puzzle.params),
  });
  expect(ok.status).toBe("correct");

  const second = await begin(member);
  expect(second.puzzle.streak).toBe(0);
  expect(
    await member.mutation(api.timeoutPuzzles.answer, {
      session: first.session,
      guess: 0,
    }),
  ).toEqual({ status: "stale" });
  expect(
    await member.mutation(api.timeoutPuzzles.forfeit, {
      session: first.session,
    }),
  ).toEqual({ status: "stale" });
});

test("nobody else's session works, and there is nothing to play without a timeout", async () => {
  const { t, member } = await setup();
  const { session } = await begin(member);
  const head = t.withIdentity({ subject: "head" });
  expect(await head.mutation(api.timeoutPuzzles.start, {})).toEqual({
    status: "clear",
  });
  expect(
    await head.mutation(api.timeoutPuzzles.answer, { session, guess: 0 }),
  ).toEqual({ status: "stale" });
});

test("every kind of puzzle has an answer it accepts", () => {
  let seed = 7;
  const rng = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const kinds = new Set<string>();
  for (let i = 0; i < 400; i++) {
    const params = generatePuzzle(undefined, rng);
    kinds.add(params.kind);
    const { answer, display } = solve(params);
    expect(Number.isFinite(answer)).toBe(true);
    expect(answer).toBeGreaterThan(0);
    expect(display).not.toBe("");
  }
  expect(kinds.size).toBe(9);
});
