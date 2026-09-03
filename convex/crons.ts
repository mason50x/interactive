import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

/**
 * The jobs nobody has to remember to run.
 *
 * Both are housekeeping and neither is load-bearing: expired strikes are
 * already ignored where standing is computed, and the global room reads
 * correctly whether or not last month has been cleared out of it. See
 * `convex/chat/sweep.ts` for why each one takes a fixed bite and reschedules
 * itself rather than trying to finish in a single pass.
 *
 * Eight in the morning UTC is the middle of the night in the Americas and the
 * middle of the school day in Europe, which is about as close to nobody's
 * evening as one hour gets.
 */
const crons = cronJobs();

crons.daily(
  "expire strikes",
  { hourUTC: 8, minuteUTC: 0 },
  internal.chat.sweep.expireStrikes,
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

// Pictures uploaded and never sent, and files nothing ever claimed. Hourly
// rather than daily, because unlike every table above this one is billed by
// the byte — see `sweep` in `convex/chat/attachments.ts` for what it walks.
crons.interval(
  "reclaim unsent pictures",
  { hours: 1 },
  internal.chat.attachments.sweep,
  {},
);

export default crons;
