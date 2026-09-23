import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

/**
 * The jobs nobody has to remember to run.
 *
 * Housekeeping is not load-bearing: the global room reads correctly whether or
 * not last month has been cleared out of it. See `convex/chat/sweep.ts` for why
 * each job takes a fixed bite and reschedules itself rather than trying to
 * finish in a single pass.
 *
 * Eight in the morning UTC is the middle of the night in the Americas and the
 * middle of the school day in Europe, which is about as close to nobody's
 * evening as one hour gets.
 */
const crons = cronJobs();

// New clears schedule their own expiry; sweep legacy records as a fallback.
crons.interval(
  "expire stale CEO timeout clears",
  { hours: 1 },
  internal.timeouts.expireCeoClears,
  {},
);

crons.daily(
  "trim the global room",
  { hourUTC: 8, minuteUTC: 20 },
  internal.chat.sweep.trimGlobal,
  {},
);

crons.daily(
  "prune orphaned memberships",
  { hourUTC: 8, minuteUTC: 40 },
  internal.chat.sweep.pruneMemberships,
  {},
);

// Long-cold presence rows. Nothing reads them — see `sweepPresence` — so this
// is the one job here that is purely about the size of a table.
crons.daily(
  "clear out old presence",
  { hourUTC: 9, minuteUTC: 0 },
  internal.chat.sweep.sweepPresence,
  {},
);

// Long-cold typing rows, for the same reason and with even less at stake —
// see `sweepTyping`.
crons.daily(
  "clear out old typing",
  { hourUTC: 9, minuteUTC: 10 },
  internal.chat.sweep.sweepTyping,
  {},
);

// Pictures uploaded and never sent, and files nothing ever claimed. Hourly
// rather than daily, because unlike every table above this one is billed by
// the byte — see `sweep` in `convex/chat/attachments.ts` for what it walks.
crons.interval(
  "reclaim unsent pictures",
  { hours: 1 },
  internal.chat.attachments.sweep,
  {},
);

crons.daily("prune leaderboard buckets", { hourUTC: 9, minuteUTC: 20 }, internal.leaderboard.prune, {});

crons.daily("prune timeout history", { hourUTC: 9, minuteUTC: 30 }, internal.dataMaintenance.pruneTimeoutHistory, {});
crons.daily("prune inactive timeouts", { hourUTC: 9, minuteUTC: 35 }, internal.dataMaintenance.pruneInactiveTimeouts, {});
crons.daily("prune reward receipts", { hourUTC: 9, minuteUTC: 40 }, internal.dataMaintenance.pruneRewardReceipts, {});
crons.daily("prune old activity snapshots", { hourUTC: 9, minuteUTC: 45 }, internal.dataMaintenance.pruneUserActivity, {});

export default crons;
