import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, type MutationCtx } from "./_generated/server";
import { generatePuzzle, isCorrect, puzzleParams, solve } from "./geometry";
import { activeTimeout } from "./timeoutState";

/**
 * Working off a timeout: twenty geometry puzzles right in a row lifts it.
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
  goal: v.number(),
  deadline: v.number(),
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

function view(row: Pick<Doc<"timeoutPuzzles">, "params" | "streak" | "issuedAt">) {
  return {
    params: row.params,
    streak: row.streak,
    goal: PUZZLE_GOAL,
    deadline: row.issuedAt + PUZZLE_TIME_MS,
  };
}

async function reissue(
  ctx: MutationCtx,
  row: Doc<"timeoutPuzzles">,
  streak: number,
) {
  const next = {
    streak,
    params: generatePuzzle(row.params.kind),
    issuedAt: Date.now(),
  };
  await ctx.db.patch(row._id, next);
  return view(next);
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
    return { status: "started" as const, session: data.session, puzzle: view(data) };
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

    if (now > row.issuedAt + PUZZLE_TIME_MS)
      return { status: "late" as const, solution, puzzle: await reissue(ctx, row, 0) };
    if (!isCorrect(row.params, guess))
      return { status: "wrong" as const, solution, puzzle: await reissue(ctx, row, 0) };

    const streak = row.streak + 1;
    if (streak < PUZZLE_GOAL)
      return { status: "correct" as const, solution, puzzle: await reissue(ctx, row, streak) };

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
    return { status: "reset" as const, puzzle: await reissue(ctx, live.row, 0) };
  },
});
