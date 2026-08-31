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
     * page to replace the tab with. Held together because either one alone is
     * not a working setting.
     */
    panicEnabled: v.optional(v.boolean()),
    panicKey: v.optional(v.string()),
    panicUrl: v.optional(v.string()),
  }).index("byClerkId", ["clerkId"]),
});
