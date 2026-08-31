import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    // Clerk user id — this is `identity.subject` on the Convex side
    // and `data.id` in Clerk webhook payloads.
    clerkId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    imageUrl: v.optional(v.string()),

    /**
     * The daily streak, kept on the user row rather than in a table of visits.
     *
     * A row per day would be the honest log, but nothing ever asks for the
     * log: the only questions are "how many days in a row" and "is today one
     * of them", and both are answered by these three fields without reading
     * anything but the document the caller already has. It also bounds the
     * write: `convex/streaks.ts` patches this at most once per user per day,
     * and every other visit that day is a read that finds `streakLastDay`
     * already set and returns.
     *
     * `streakLastDay` is a `YYYY-MM-DD` key in the *user's* local day, not
     * UTC — a streak is a human counting bedtimes, so the boundary has to be
     * their midnight. The client sends its UTC offset and the server does the
     * arithmetic; see `convex/streaks.ts` for why the date itself is never
     * taken from the client.
     *
     * `streakCount` is the run that ended on `streakLastDay`, which is not the
     * same as the run in effect now — a count of 9 last seen three weeks ago
     * is a lapsed streak, and it stays 9 here because it is a record of what
     * happened. Deciding whether it is still alive is the reader's job.
     *
     * `streakBest` is the high-water mark, and is the reason a lapse is
     * allowed to reset `streakCount` to 1 without losing anything.
     *
     * All optional: every account that existed before this shipped has none of
     * them, and an absent field reads as "no streak yet" rather than needing a
     * backfill.
     */
    streakCount: v.optional(v.number()),
    streakBest: v.optional(v.number()),
    streakLastDay: v.optional(v.string()),
  }).index("byClerkId", ["clerkId"]),

  /**
   * One row per invitation a user has spent, which is what makes this table
   * the quota rather than a log of one. Clerk has no notion of an invite
   * budget — `invitations.createInvitation` is a Backend API call with a
   * secret key behind it and no per-user accounting — so the allowance is
   * counted here and enforced before that call is ever made.
   *
   * Counting rows rather than decrementing a number on the user is what makes
   * revoking refund the credit for free: the row leaves the count instead of
   * some other write having to put a number back. It also survives a lost
   * response, which a read-modify-write on Clerk's `publicMetadata` would not.
   *
   * `email` is always normalized (see `normalizeEmail`), because it is a key
   * here — the duplicate check and the webhook that marks an invite accepted
   * both look rows up by it.
   */
  invites: defineTable({
    /** The Clerk id of whoever spent the credit. */
    inviterClerkId: v.string(),
    email: v.string(),
    /**
     * `sending` is the reservation held while the Clerk call is in flight, so
     * two fast clicks cannot both pass the quota check. Every status but
     * `revoked` counts against the allowance.
     */
    status: v.union(
      v.literal("sending"),
      v.literal("sent"),
      v.literal("accepted"),
      v.literal("revoked"),
    ),
    /** Set once Clerk has the invitation; the handle needed to revoke it. */
    clerkInvitationId: v.optional(v.string()),
    /** Set by the `user.created` webhook when the recipient signs up. */
    acceptedClerkId: v.optional(v.string()),
    acceptedAt: v.optional(v.number()),
  })
    .index("byInviter", ["inviterClerkId"])
    .index("byEmail", ["email"]),

  /**
   * One row per user, holding the choices that are theirs rather than the
   * device's.
   *
   * The browser keeps a copy of all of this in `localStorage` and is what the
   * page actually reads — a preference that needs a round trip to apply would
   * paint the wrong accent first, and the panic key has to work on a page that
   * has not finished loading. This table is what makes those choices follow
   * the person to their next browser, and it is the side that wins on a
   * conflict: on sign-in the row is copied down over whatever the device had.
   *
   * The theme is deliberately not here. It is a property of the screen you are
   * looking at — a laptop in a bright room and a phone in bed want different
   * answers from the same account — so it stays in `localStorage` alone.
   *
   * Every field is optional so a row written by an older client is still a
   * valid row; the client fills the gaps from its own defaults.
   */
  preferences: defineTable({
    clerkId: v.string(),
    /** The drifting mesh behind the dashboard rail. */
    constellation: v.optional(v.boolean()),
    /**
     * An id from `accents` in `src/lib/preferences.ts`, not a colour. Storing
     * the name means the palette can be retuned — or a colour dropped — without
     * rewriting anyone's row, and it is the reason a bad value here is a
     * fallback to the default rather than an arbitrary colour on the page.
     */
    accent: v.optional(v.string()),
    /**
     * The panic key: a canonical combo string (`"shift+`"`, `"f9"`) and the
     * page to replace the tab with — `about:blank` by default, which is the
     * one destination that needs no request to reach. Held together because
     * either one alone is not a working setting.
     */
    panicEnabled: v.optional(v.boolean()),
    panicKey: v.optional(v.string()),
    panicUrl: v.optional(v.string()),
  }).index("byClerkId", ["clerkId"]),

  /**
   * One row per account per activity, holding everything that account has ever
   * done with it.
   *
   * A row per *view* would be the honest log and is what a real analytics
   * pipeline keeps. Nothing here ever asks a question that needs one: the home
   * page wants "what do I open most", "what did I open last", and "how long
   * have I spent", and all three are a running total that a view folds into.
   * Keeping the total means the reads are a handful of indexed rows rather
   * than a scan over every session an account has ever had, and it bounds the
   * table at one row per activity you have opened — 318 in the worst case,
   * against a log that grows forever.
   *
   * What it gives up is history: this cannot say what you opened on a Tuesday
   * in March. `userDays` carries the shape of that answer at day resolution,
   * which is the only resolution anything on the dashboard draws.
   *
   * `count` is opens and `seconds` is time actually spent with the frame on
   * screen, and they are deliberately two numbers. Opening something and
   * bouncing straight out is a view and nearly no seconds, which is exactly
   * the difference between an activity you keep trying and one you keep using.
   */
  views: defineTable({
    clerkId: v.string(),
    /** A slug from `src/lib/activities.ts`. Not validated against the
     *  catalogue here — see `convex/views.ts` for why the shape is the check. */
    slug: v.string(),
    /** Times this account has opened it. */
    count: v.number(),
    /** Seconds the frame has been open *and visible*, accumulated. */
    seconds: v.number(),
    firstViewedAt: v.number(),
    lastViewedAt: v.number(),
  })
    // The upsert path: find this account's row for this activity, or learn there
    // isn't one.
    .index("byUserActivity", ["clerkId", "slug"])
    // "Your favourites" — descending on this index is most-viewed-first,
    // without reading a row that isn't in the answer.
    .index("byUserCount", ["clerkId", "count"])
    // "Jump back in", the same way.
    .index("byUserLastViewed", ["clerkId", "lastViewedAt"]),

  /**
   * The global daily board: one row per activity per day, across everyone.
   *
   * Separate from `views` because it answers a question no per-account table
   * can — what the *room* is opening — and because it has to be cheap to read
   * top-first. A "most popular today" computed by scanning every account's
   * rows would grow with the user count on every dashboard load; this is one
   * indexed range over a table whose size is bounded by (activities opened
   * today), and old days are simply never read again.
   *
   * ## The day here is UTC, and the day in `userDays` is not
   *
   * A global bucket has to have one definition or it is not a bucket: if the
   * key were each reader's local day, someone in Auckland and someone in Los
   * Angeles would write the same moment into two different rows and the
   * board would be counting two overlapping half-days. So this one is
   * UTC and the same for everybody. `userDays` is the opposite case — it is a
   * person's own record of their own day, and their midnight is the only
   * boundary that makes sense there.
   */
  activityDays: defineTable({
    /** `YYYY-MM-DD`, UTC. */
    day: v.string(),
    slug: v.string(),
    views: v.number(),
    seconds: v.number(),
  })
    .index("byDayActivity", ["day", "slug"])
    // The read: `eq(day)` then descending is the top of today's board.
    .index("byDayViews", ["day", "views"]),

  /**
   * One row per account per day they were here, in *their* local day.
   *
   * Two things read it. The stats card sums `seconds` over a window — today,
   * and the last seven days — which is a range over this index and nothing
   * else. And the streak strip asks which of the last seven days exist at all,
   * because a row existing is the record that the day was claimed.
   *
   * `visited` is written by the streak claim and `views`/`seconds` by the
   * viewer, so a row can exist with zero of either: turning up and opening
   * nothing is still a day on the streak. The reverse cannot happen — the
   * claim runs when the app shell mounts, which is strictly before any activity
   * can be opened inside it.
   */
  userDays: defineTable({
    clerkId: v.string(),
    /** `YYYY-MM-DD` in the account's local day — see `convex/days.ts`. */
    day: v.string(),
    /** The streak claim landed on this day. */
    visited: v.boolean(),
    views: v.number(),
    seconds: v.number(),
  }).index("byUserDay", ["clerkId", "day"]),
});
