import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, type MutationCtx } from "./_generated/server";
import { generatePuzzle, isCorrect, puzzleParams, solve } from "./geometry";
import { activeTimeout } from "./timeoutState";

/**
 * Working off a timeout: twenty geometry puzzles right in a row lifts it.
 *
 * Only when the timeout was issued with `mathBypass` on, the default. With it
 * off the puzzles are for fun: the streak still counts and answers are still
 * graded, but there is no goal, no clock and no penalty for leaving, and no
 * streak ever lifts anything.
 *
 * The streak lives here, not in the browser. Every puzzle is issued, timed
 * and graded by the server, and the answer never leaves until the guess is
 * in. A wrong answer, a late one, leaving the tab (reported by the page
 * through `forfeit`) or starting again from any page load or second tab puts
 * the streak back to zero. Each `start` mints a new session and retires the
 * last one, so an older tab cannot keep answering once a newer one opens.
 */

export const PUZZLE_GOAL = 20;
/** Long enough to work one out by hand, too short to go and ask someone. */
export const PUZZLE_TIME_MS = 2 * 60_000;

const puzzleView = v.object({
  params: puzzleParams,
  streak: v.number(),
  /** Null when the timeout has no math bypass and this is only for fun. */
  goal: v.union(v.number(), v.null()),
  deadline: v.union(v.number(), v.null()),
});
const solutionView = v.object({ display: v.string(), working: v.string() });
const stale = v.object({ status: v.literal("stale") });

async function timedOutCaller(ctx: MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Sign in required.");
  const timeout = await activeTimeout(ctx, identity.subject);
  return { clerkId: identity.subject, timeout };
}

async function puzzleRow(ctx: MutationCtx, clerkId: string) {
  return ctx.db
    .query("timeoutPuzzles")
    .withIndex("byClerkId", (q) => q.eq("clerkId", clerkId))
    .unique();
}

/** The caller's row, but only for this session and this very timeout. */
async function liveRow(ctx: MutationCtx, session: string) {
  const { clerkId, timeout } = await timedOutCaller(ctx);
  const row = await puzzleRow(ctx, clerkId);
  if (
    !timeout ||
    !row ||
    row.session !== session ||
    row.timeoutId !== timeout._id ||
    row.timeoutExpiresAt !== timeout.expiresAt
  )
    return null;
  return { row, timeout };
}

const bypassable = (timeout: Doc<"userTimeouts">) => timeout.mathBypass !== false;

function view(
  row: Pick<Doc<"timeoutPuzzles">, "params" | "streak" | "issuedAt">,
  timeout: Doc<"userTimeouts">,
) {
  const counts = bypassable(timeout);
  return {
    params: row.params,
    streak: row.streak,
    goal: counts ? PUZZLE_GOAL : null,
    deadline: counts ? row.issuedAt + PUZZLE_TIME_MS : null,
  };
}

async function reissue(
  ctx: MutationCtx,
  row: Doc<"timeoutPuzzles">,
  timeout: Doc<"userTimeouts">,
  streak: number,
) {
  const next = {
    streak,
    params: generatePuzzle(row.params.kind),
    issuedAt: Date.now(),
  };
  await ctx.db.patch(row._id, next);
  return view(next, timeout);
}

export const start = mutation({
  args: {},
  returns: v.union(
    v.object({ status: v.literal("started"), session: v.string(), puzzle: puzzleView }),
    v.object({ status: v.literal("clear") }),
  ),
  handler: async (ctx) => {
    const { clerkId, timeout } = await timedOutCaller(ctx);
    if (!timeout) return { status: "clear" as const };
    const data = {
      clerkId,
      timeoutId: timeout._id,
      timeoutExpiresAt: timeout.expiresAt,
      session: crypto.randomUUID(),
      streak: 0,
      params: generatePuzzle(),
      issuedAt: Date.now(),
    };
    const existing = await puzzleRow(ctx, clerkId);
    if (existing) await ctx.db.replace(existing._id, data);
    else await ctx.db.insert("timeoutPuzzles", data);
    return { status: "started" as const, session: data.session, puzzle: view(data, timeout) };
  },
});

export const answer = mutation({
  args: { session: v.string(), guess: v.number() },
  returns: v.union(
    stale,
    v.object({ status: v.literal("passed"), solution: solutionView }),
    v.object({
      status: v.union(v.literal("correct"), v.literal("wrong"), v.literal("late")),
      solution: solutionView,
      puzzle: puzzleView,
    }),
  ),
  handler: async (ctx, { session, guess }) => {
    const live = await liveRow(ctx, session);
    if (!live) return { status: "stale" as const };
    const { row, timeout } = live;
    const { display, working } = solve(row.params);
    const solution = { display, working };
    const now = Date.now();

    const counts = bypassable(timeout);

    if (counts && now > row.issuedAt + PUZZLE_TIME_MS)
      return { status: "late" as const, solution, puzzle: await reissue(ctx, row, timeout, 0) };
    if (!isCorrect(row.params, guess))
      return { status: "wrong" as const, solution, puzzle: await reissue(ctx, row, timeout, 0) };

    const streak = row.streak + 1;
    if (!counts || streak < PUZZLE_GOAL)
      return {
        status: "correct" as const,
        solution,
        puzzle: await reissue(ctx, row, timeout, streak),
      };

    await ctx.db.delete(row._id);
    await ctx.db.patch(timeout._id, { enabled: false, updatedAt: now });
    await ctx.db.insert("timeoutAudit", {
      clerkId: row.clerkId,
      actor: row.clerkId,
      action: "off",
      reason: timeout.reason,
      expiresAt: timeout.expiresAt,
      at: now,
    });
    return { status: "passed" as const, solution };
  },
});

/** The page reports leaving the tab; the streak and the puzzle go with it. */
export const forfeit = mutation({
  args: { session: v.string() },
  returns: v.union(
    stale,
    v.object({ status: v.literal("reset"), puzzle: puzzleView }),
  ),
  handler: async (ctx, { session }) => {
    const live = await liveRow(ctx, session);
    if (!live) return { status: "stale" as const };
    const { row, timeout } = live;
    // Nothing rides on a for-fun streak, so there is nothing to forfeit.
    const streak = bypassable(timeout) ? 0 : row.streak;
    return {
      status: "reset" as const,
      puzzle: await reissue(ctx, row, timeout, streak),
    };
  },
});
