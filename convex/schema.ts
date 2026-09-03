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

    /**
     * The terms this account has accepted, mirrored onto the user.
     *
     * The record of the acceptance is the `agreements` row — that is the table
     * with the index the gate reads and the one that survives a user row being
     * rebuilt by the Clerk webhook. These two fields are the same fact written
     * where anyone looking at an account will actually see it: a support
     * question is always "pull up this user", and an answer that needs a second
     * table joined by hand is an answer nobody looks up.
     *
     * `convex/agreement.ts` writes both in one transaction, so they cannot
     * disagree. If they ever do, the `agreements` row is the one that counts —
     * nothing gates on these.
     *
     * Optional, because every account that existed before this shipped has
     * neither, which reads as "has not agreed" without a backfill.
     */
    agreementVersion: v.optional(v.number()),
    agreedAt: v.optional(v.number()),
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
   * One row per account that has accepted the terms in the rail's agreement
   * card, and the gate every activity is behind.
   *
   * A row rather than a flag on the user: what is worth keeping is *when* and
   * *which version*, and both of those are the record if the account is ever
   * taken down. The row is also written by the account itself — see
   * `convex/agreement.ts` — so it does not wait on the Clerk webhook that
   * creates the `users` row, and an account that signed up before that webhook
   * existed can still agree.
   *
   * `version` is what makes the terms re-agreeable. The current version lives
   * in `convex/agreement.ts`; a row below it reads as not agreed, which is the
   * whole migration for a change of wording — nobody is grandfathered into
   * terms they never saw.
   */
  agreements: defineTable({
    clerkId: v.string(),
    /** The version of the terms this account accepted. */
    version: v.number(),
    agreedAt: v.number(),
  }).index("byClerkId", ["clerkId"]),

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
    /**
     * An id from `tabMasks` in `src/lib/tab-mask.ts` — the site whose title and
     * favicon this account's tabs wear instead of ours. A name and not the
     * title-and-icon pair itself, for the same reason `accent` is a name: the
     * disguise can be retuned when a site redesigns without rewriting anyone's
     * row, and an id nobody recognises falls back to no mask rather than to an
     * arbitrary string in the tab strip.
     */
    tabMask: v.optional(v.string()),
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
   * else. And the streak strip asks which of the last seven days are marked
   * `visited`.
   *
   * The strip does not trust this table alone, though, and it should not: the
   * table began mid-streak for every account that existed when it was added,
   * so the count on the user row knows about days no row here has ever
   * described. `runDays` in `convex/streaks.ts` reconciles the two on read, and
   * `healRun` writes the difference back on the next claim — which is why this
   * is a table that converges rather than one that was ever backfilled.
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

  /**
   * Who somebody is in chat, and how much trouble they are in.
   *
   * ## Why this is not fields on `users`
   *
   * Because `users` is not ours. It is rebuilt by the Clerk webhook — see
   * `upsertFromClerk` in `convex/users.ts` — and it holds a real name and a real
   * email address, which are exactly the two things chat must never show. A
   * separate row keyed by the Clerk id is the same shape `agreements` uses and
   * for the same reason: it survives the webhook, and it can exist before the
   * webhook has ever run.
   *
   * ## Why a handle instead of a name
   *
   * The account has a real first name on it because Clerk collected one at
   * signup. Putting that in a room of strangers, on a site whose users are
   * thirteen and up, is the single worst default available, and it is a default
   * nobody would have chosen deliberately — it happens by reaching for the name
   * that was already there. So chat has an identity of its own, chosen once, and
   * no query in `convex/chat/` returns anything from `users` at all.
   *
   * `handleKey` is what uniqueness is actually enforced on: the handle with
   * confusables and leet folded and separators removed, so `adm1n`, `а𝖽min` and
   * `a_d_m_i_n` all collapse onto `admin` and cannot be claimed to shadow it.
   * `handle` is what gets displayed. They are written together and only here.
   *
   * ## What is not here any more
   *
   * The send counter and the ring of recent sends, which are `chatSenders`
   * below. They were the only two fields on this row that a message rewrote,
   * and a row that a message rewrites is a row no other query can afford to
   * join — which this one is joined by nearly all of them, for a handle.
   *
   * What is left is written when somebody renames themselves, picks a disc,
   * changes who may reach them, or earns a mute. So a profile read is a read of
   * something that mostly does not change, and the subscriptions that join one
   * stop being recomputed by other people talking.
   */
  chatProfiles: defineTable({
    clerkId: v.string(),
    /** What everyone sees. Claimed once, and changeable twice after that. */
    handle: v.string(),
    /**
     * The name shown over the handle, when one has been set.
     *
     * Free text, which is the one thing the handle is not — so it goes through
     * `screenStatic` on the way in, the same as a group's title, and it is
     * denormalised onto messages as `authorName` for the same reason the handle
     * is. It is not unique and not searchable: the handle stays the address.
     */
    displayName: v.optional(v.string()),
    /** Folded, and the thing uniqueness is on. See above. */
    handleKey: v.string(),
    /**
     * Renames spent, of `MAX_HANDLE_CHANGES`. Absent on every profile made
     * before renaming existed, which reads as zero — the correct answer for
     * them, and cheaper than a migration.
     */
    handleChanges: v.optional(v.number()),
    /**
     * The disc, when it has been chosen rather than derived.
     *
     * All three optional and the hue independent of the other two: a hue with
     * no face is your first letter on a colour you picked, a face with no hue
     * is what you chose on the colour your handle hashes to. Absent means
     * derived, which is what every profile started as — see `Monogram` in the
     * app for the fallbacks.
     *
     * `avatarEmoji` and `avatarInitials` are alternatives rather than layers,
     * exactly as they are on a conversation below: the disc has room for one
     * thing, and `setAvatar` clears the letters when a face arrives.
     *
     * Every part is checked against a closed set on the way in — the hue
     * against `AVATAR_HUES`, the emoji against `AVATAR_EMOJI`, the initials
     * against a two-character shape — because a disc a person picks must not
     * become a field a person writes in.
     */
    avatarHue: v.optional(v.number()),
    avatarEmoji: v.optional(v.string()),
    avatarInitials: v.optional(v.string()),
    createdAt: v.number(),
    /**
     * Who may open a direct message. Defaults to `friends`, which is what makes
     * a friend request a gate rather than a formality: a stranger cannot reach
     * you until you have said they may.
     */
    dmPolicy: v.union(
      v.literal("friends"),
      v.literal("anyone"),
      v.literal("nobody"),
    ),
    /** Whether handle search returns you. */
    discoverable: v.boolean(),
    /**
     * Where the send counter and the ring used to live. Both moved to
     * `chatSenders`; see the note there. They stay declared, and optional,
     * because every profile written before the move still carries the totals
     * this table was keeping — `senderState` in `convex/chat/shared.ts` reads
     * them once, as the seed for that account's first sender row, and nothing
     * writes either field again.
     */
    messagesSent: v.optional(v.number()),
    /**
     * The mute, and the rule that caused it. Both, because a mute somebody
     * cannot see the reason for is indistinguishable from the app being broken,
     * and there is nobody to ask.
     */
    mutedUntil: v.optional(v.number()),
    mutedRule: v.optional(v.string()),
    /** The one thing here that does not lift on its own. */
    bannedAt: v.optional(v.number()),
    banRule: v.optional(v.string()),
    recent: v.optional(
      v.array(
        v.object({
          at: v.number(),
          conversationId: v.string(),
          hash: v.string(),
          flagged: v.boolean(),
        }),
      ),
    ),
  })
    .index("byClerkId", ["clerkId"])
    .index("byHandleKey", ["handleKey"])
    // Convex allows one search field per index, which is the whole reason chat
    // identity is a handle and nothing else: there is no display name to search
    // as well, so one index is all this ever needed.
    .searchIndex("searchHandle", { searchField: "handle" }),

  /**
   * The two things about a sender that change every time they say something.
   *
   * They were fields on `chatProfiles` and they were the most expensive two
   * fields in the schema, for the same reason `lastMessageAt` is deliberately
   * not written for the global room: a document that is rewritten on every
   * message recomputes every subscription that has read it. And a profile is
   * read by almost every query in `convex/chat/` — the conversation list joins
   * one per direct message to get a handle, the friends list joins one per
   * friend, invitations join the inviter's. So one person talking in the global
   * room invalidated the left-hand column of everybody who had ever befriended
   * them, and each of those re-runs re-read every profile it joined.
   *
   * Splitting them out leaves `chatProfiles` a cold table: a handle, a disc, a
   * policy and a standing, written when somebody changes one of them. The
   * documents got smaller too — `recent` is twenty objects, and it was being
   * read by every join that only ever wanted `handle`.
   *
   * One row per account, made on that account's first send. There is no
   * backfill: a profile written before this existed still carries the two
   * fields, and `senderState` in `convex/chat/shared.ts` reads them as the seed
   * for the row it is about to write. After that the profile's copies are dead
   * and nothing looks at them again.
   *
   * `messagesSent` feeds the trust tier, and is shown back to the account
   * itself in the settings panel. `recent` is the last twenty sends — when,
   * where, a hash of what, and a `flagged` that is now always false for the
   * reason `flags` on `messages` is empty. It is the entire cross-message
   * memory of the moderation system: rate windows, duplicate detection,
   * broadcast detection and repeat-targeting all read this one bounded array on
   * the sender's own row, which means none of them costs a second index or a
   * read of anybody else's. It is a hash rather than the text because twenty
   * copies of everything everyone said, kept forever, is a different product
   * than this one.
   *
   * It is deleted with the profile, never separately — see `eraseMine` in
   * `convex/chat/erase.ts`. A ring that outlived the identity it belongs to
   * would be a rate limit on a stranger, and a `messagesSent` that outlived one
   * would hand a new handle the trust tier the old one earned.
   */
  chatSenders: defineTable({
    clerkId: v.string(),
    /** Feeds the trust tier, and the one number the settings panel shows. */
    messagesSent: v.number(),
    recent: v.array(
      v.object({
        at: v.number(),
        conversationId: v.string(),
        hash: v.string(),
        flagged: v.boolean(),
      }),
    ),
  }).index("byClerkId", ["clerkId"]),

  /**
   * A room, a group, or a pair.
   *
   * One table for all three because everything above them — membership,
   * messages, reads, reports — is identical, and the differences are three
   * fields. `kind` is the only thing that varies behaviour, and it is copied
   * onto every membership row so that sending a message never has to read this
   * document at all. That is not a micro-optimisation: reading the conversation
   * on every send would put it in the read set of every send, and two people
   * talking at once would start conflicting with each other over a row neither
   * of them was writing.
   *
   * `dmKey` is the two Clerk ids sorted and joined. It exists so that opening a
   * direct message is idempotent — both people "creating" it land on the same
   * row — rather than a race that leaves two half-populated conversations.
   *
   * `lastMessageAt` is written for direct messages and groups, which are
   * low-traffic and sort by it, and deliberately *not* for the global room. Every
   * message in a busy room would rewrite this one document, and every
   * subscription that had read it would be recomputed because of it. The room
   * is pinned to the top of the list instead, which is where it belongs anyway.
   */
  conversations: defineTable({
    kind: v.union(v.literal("global"), v.literal("dm"), v.literal("group")),
    /** Set only on direct messages: both Clerk ids, sorted, joined. */
    dmKey: v.optional(v.string()),
    /** Groups only. Screened like a message before it is accepted. */
    title: v.optional(v.string()),
    createdBy: v.string(),
    createdAt: v.number(),
    /** Absent on the global room, on purpose. See above. */
    lastMessageAt: v.optional(v.number()),
    /** Groups only. `request` is the one that needs an owner to approve. */
    joinPolicy: v.optional(
      v.union(v.literal("invite"), v.literal("request"), v.literal("open")),
    ),
    /**
     * A group's face: one of a fixed set of emoji *or* up to two letters, on
     * one of a fixed set of hues. Groups only, and all three optional — a group
     * that has never been given one is drawn from its name, the same way a
     * person with no `avatarHue` is drawn from their handle.
     *
     * A picked emoji rather than an uploaded picture, and that is the whole
     * design. See `monogram.tsx` for why this app holds no photographs of its
     * users; a group avatar anybody could upload would be the same hole opened
     * from the other side, on a site with nobody to look at what came through
     * it. An emoji from a closed set cannot carry anything that was not already
     * in the app, and two characters cannot carry a sentence — which is the
     * same reasoning `MAX_INITIALS` is under.
     *
     * `emoji` and `initials` are alternatives rather than layers: `setLook`
     * clears one when the other is set, because a disc has room for one thing.
     */
    emoji: v.optional(v.string()),
    initials: v.optional(v.string()),
    hue: v.optional(v.number()),
  })
    .index("byDmKey", ["dmKey"])
    .index("byKind", ["kind"]),

  /**
   * One row per person per conversation, and the only thing a send reads.
   *
   * It carries membership, the group role, the read position, and a copy of the
   * conversation's `kind`. The copy is what lets the send path answer "may this
   * person speak here, and what are the limits" from a single indexed lookup of
   * a row that only that person writes — so two people sending at the same
   * moment touch no document in common.
   *
   * `status` is doing four jobs at once and they are all the same job: `invited`
   * is a group invitation waiting on the recipient, `requested` is a join
   * request waiting on the owner, `banned` is somebody the owner removed and who
   * may not come back, and `left` is a row kept rather than deleted so that
   * rejoining does not lose where they had read up to.
   *
   * `role` is scoped to one group. There is no global moderator anywhere in this
   * schema, because there are no moderators — see `convex/moderation/`.
   */
  conversationMembers: defineTable({
    conversationId: v.id("conversations"),
    clerkId: v.string(),
    /** Copied from the conversation, which never changes kind. */
    kind: v.union(v.literal("global"), v.literal("dm"), v.literal("group")),
    role: v.union(v.literal("owner"), v.literal("admin"), v.literal("member")),
    status: v.union(
      v.literal("active"),
      v.literal("invited"),
      v.literal("requested"),
      v.literal("banned"),
      v.literal("left"),
    ),
    joinedAt: v.number(),
    /** Everything after this is unread. Written only by its own owner. */
    lastReadAt: v.number(),
    invitedBy: v.optional(v.string()),
    /**
     * Direct messages only: the Clerk id of the other person.
     *
     * Copied here so the send path can check whether the two of you have
     * blocked each other without reading the conversation document or the other
     * member's row — the first would put a shared document in the read set of
     * every send, and the second would make your message conflict with them
     * marking the thread read.
     */
    dmPeer: v.optional(v.string()),
  })
    .index("byConversation", ["conversationId", "status"])
    .index("byUser", ["clerkId", "status"])
    .index("byConversationUser", ["conversationId", "clerkId"]),

  /**
   * Who has a conversation open right now.
   *
   * Membership says who belongs in a room; this says who is in it at this
   * moment, which is the only one of the two a green dot can honestly be about.
   * A group of forty where two people are reading is a quiet room, and the
   * number that used to sit in the thread header — active memberships — could
   * not tell those apart.
   *
   * One row per person per conversation, rewritten by that person alone every
   * `HEARTBEAT_MS` while they are looking at it. Nobody else's document is
   * touched, so two people in the same room at the same moment still conflict
   * over nothing.
   *
   * ## There is no "left" here
   *
   * A row is deleted when somebody navigates away, and otherwise it simply
   * stops being refreshed. Presence is therefore *derived* rather than
   * declared: a row counts if `lastSeenAt` is inside the window, and a browser
   * that was closed, crashed, or driven into a tunnel falls out of the count on
   * its own within a heartbeat or two. Anything that relied on an announced
   * departure would be wrong every time one did not arrive.
   *
   * That also means the count query is only ever as fresh as the last write to
   * this table for that conversation — which is fine, because the person
   * reading it is themselves heartbeating into it. Their own beat re-runs their
   * own subscription, and stale rows drop out of the answer.
   *
   * Direct messages keep no rows at all. Nothing reads a count of two.
   */
  presence: defineTable({
    conversationId: v.id("conversations"),
    clerkId: v.string(),
    lastSeenAt: v.number(),
  })
    .index("byConversationSeen", ["conversationId", "lastSeenAt"])
    .index("byConversationUser", ["conversationId", "clerkId"])
    // For the sweep alone: rows nobody has refreshed in a long time, across
    // every conversation at once. See `sweepPresence` in `convex/chat/sweep.ts`.
    .index("bySeen", ["lastSeenAt"]),

  /**
   * What was said.
   *
   * Ordered by `_creationTime` through `byConversation`, which is what the
   * paginated thread query reads backwards. There is no `createdAt` field
   * because Convex already keeps one and a second copy could only ever disagree
   * with it.
   *
   * ## `authorHandle` is stored on the message
   *
   * Denormalised on purpose, and it is the field that makes the thread work.
   * Resolving the author for each row would mean the thread query joined against
   * `chatProfiles`, and a joined row cannot be constructed on the client, which
   * is what an optimistic send has to do to put your own message on screen the
   * instant you press enter. Carrying the handle makes the page self-contained.
   * The cost is that a handle could go stale — which it cannot, because handles
   * are claimed once and never renamed.
   *
   * ## Only survivors are here
   *
   * A message that fails the filter is never inserted. There is no row for it,
   * no id, and nothing to leak: the refusal happens in `convex/chat/messages.ts`
   * before any write. `status` is therefore about the one thing that happens
   * *afterwards* — `hidden`, when reports pile up on it. An author taking their
   * own message back is not a status either: within `DELETE_WINDOW_MS` the row
   * is deleted outright, and after it nothing can be taken back at all.
   *
   * `flags` was the tier-three words that were allowed through, back when tier
   * three posted. It does not any more — ordinary swearing is refused in
   * `convex/moderation/verdict.ts` — so every new row writes an empty array.
   * The column stays because Convex validates the rows already in this table
   * against this schema, and the rows written before the change still have
   * words in it: dropping the field is a migration, not an edit, and the old
   * account of those decisions is worth more than the bytes.
   */
  messages: defineTable({
    conversationId: v.id("conversations"),
    authorClerkId: v.string(),
    /** See above: denormalised so a page of messages needs no join. */
    authorHandle: v.string(),
    /** The author's display name at the time, if they had one. Same rule. */
    authorName: v.optional(v.string()),
    body: v.string(),
    /**
     * The message this one answers, when it is a reply.
     *
     * Only the id is stored. The thread query resolves the current author and a
     * short preview, which means a message hidden after it was replied to does
     * not survive inside a copied quote. The field is optional for every row
     * written before replies existed.
     */
    replyToId: v.optional(v.id("messages")),
    status: v.union(v.literal("visible"), v.literal("hidden")),
    flags: v.array(v.string()),
    /**
     * Kept on the document rather than in a table of its own, so drawing fifty
     * messages is one range read instead of fifty. Bounded by the fixed emoji
     * set and by a cap on recorded reactors — past the cap the count is still
     * right, only the list of who stops growing.
     */
    reactions: v.optional(
      v.array(v.object({ emoji: v.string(), by: v.array(v.string()) })),
    ),
    /**
     * The pictures sent with it, in the order they were attached.
     *
     * Denormalised onto the message for the same reason `authorHandle` is:
     * drawing a page must not join anything. The thread query turns each
     * `storageId` into a URL and reads no other table for it, and an
     * optimistic send can build this array from the previews it already has
     * on screen. `attachmentId` is the row in `attachments` below, kept so
     * that deleting the message can take the file and its record with it —
     * see `deleteMessage` in `convex/chat/shared.ts`, which is the only way a
     * message with pictures is ever removed.
     *
     * `width` and `height` are what the client measured when it uploaded,
     * and are for layout alone: a box of the right shape is drawn before the
     * bytes arrive, so a thread does not jump as its pictures load.
     *
     * Absent on every message written before pictures existed, and on every
     * message without one — the common case, which a required empty array
     * would make everybody's history pay for.
     */
    images: v.optional(
      v.array(
        v.object({
          attachmentId: v.id("attachments"),
          storageId: v.id("_storage"),
          width: v.number(),
          height: v.number(),
        }),
      ),
    ),
  })
    .index("byConversation", ["conversationId"])
    .index("byAuthor", ["authorClerkId"])
    /**
     * What the rail's search reads.
     *
     * `status` is a filter field rather than something the handler drops
     * afterwards, because a hidden message must not consume one of the rows
     * the search returns — reports pile up on the worst things anybody said
     * here, so the hidden set is exactly the set most likely to match a
     * search and would otherwise crowd out the results that survive.
     *
     * Who is allowed to see a match is *not* expressible here. It depends on
     * the caller's membership rows, which no filter field can name, so the
     * index is deliberately unscoped and `search` in `convex/chat/messages.ts`
     * applies permissions to every row before any of it leaves the server.
     */
    .searchIndex("searchBody", {
      searchField: "body",
      filterFields: ["status"],
    }),

  /**
   * A picture somebody has uploaded, from the moment it lands until the
   * message it went out in is deleted.
   *
   * ## Why a row and not just a storage id
   *
   * Because the storage id is the one thing here the client hands back, and
   * a client can hand back anything. An upload URL from Convex is not tied to
   * the account that asked for it, and a storage id is not tied to anything
   * at all — so `messages.send` cannot be allowed to take a bare id and trust
   * that it was uploaded by this person and looked at by the filter. This row
   * is that proof. It is written by the server the moment a file is claimed,
   * it names the owner, and it holds the one fact the whole feature turns on:
   * `status`, which only reaches `ready` after the picture has been through
   * the check in `convex/moderation/images.ts`. A send is refused unless every
   * id it names is a row with this caller's id on it in exactly that state.
   *
   * ## The lifecycle
   *
   * `checking` is a file that has been claimed and is waiting on the verdict.
   * `ready` is one that passed and has not been sent yet. `sent` is on a
   * message — and from then on the message owns it: `deleteMessage` in
   * `convex/chat/shared.ts` deletes the file, this row and the message
   * together, and nothing else ever removes a `sent` row.
   *
   * A picture that fails has no state. The file is deleted and so is this row,
   * in the same mutation that records the strike — there is nothing to keep,
   * for the same reason a refused message is never inserted.
   *
   * ## What the sweep is for
   *
   * A file can be orphaned in three ways the row cannot see: the upload
   * finished but the tab closed before the claim, the action died between the
   * claim and the verdict, or the picture passed and was never sent. All three
   * are the same to `sweep` in `convex/chat/attachments.ts`, which walks the
   * storage table itself rather than this one and removes any file past
   * `IMAGE_TTL_MS` that no `sent` row is holding. This table is the index it
   * uses to tell, which is what `byStorage` is for.
   *
   * `byStorage` is also what makes a claim exclusive: one file, one row, and a
   * second claim on somebody else's storage id is refused before it is read.
   *
   * ## This is not an avatar
   *
   * The note on `emoji` in `conversations` above, and the longer one in
   * `monogram.tsx`, still hold: nobody's picture is a photograph, and there is
   * no upload path to a profile. What this table holds is something said in
   * a conversation, which is the thing chat already moderates — and it goes
   * through the same standing, the same ladder, and the same ledger as a
   * sentence, with a classifier reading it in place of the word lists.
   */
  attachments: defineTable({
    storageId: v.id("_storage"),
    ownerClerkId: v.string(),
    status: v.union(
      v.literal("checking"),
      v.literal("ready"),
      v.literal("sent"),
    ),
    /** The message it went out in. Set with `sent` and never cleared. */
    messageId: v.optional(v.id("messages")),
    contentType: v.string(),
    size: v.number(),
    /** As measured by the uploader, for layout. See `images` on `messages`. */
    width: v.number(),
    height: v.number(),
  })
    .index("byStorage", ["storageId"])
    // How many an account has in flight, and everything of theirs to remove
    // when they go. `status` second so the count skips what is already sent.
    .index("byOwner", ["ownerClerkId", "status"]),

  /**
   * One row per pair of people, in either state.
   *
   * `userA` is always the lexicographically smaller Clerk id, which is what
   * makes a friendship a single row rather than two that can disagree. The cost
   * is that listing your friends is two indexed reads — one for each side you
   * might be on — merged in the handler. That is cheaper than the alternative,
   * which is two mirrored rows and a bug the first time one of them fails to
   * update.
   *
   * `requestedBy` is kept because it is the only thing that distinguishes a
   * request you sent from one you received, and both appear in the same list.
   */
  friendships: defineTable({
    userA: v.string(),
    userB: v.string(),
    status: v.union(v.literal("pending"), v.literal("accepted")),
    requestedBy: v.string(),
    requestedAt: v.number(),
    respondedAt: v.optional(v.number()),
  })
    .index("byPair", ["userA", "userB"])
    .index("byUserA", ["userA", "status"])
    .index("byUserB", ["userB", "status"]),

  /**
   * One row per direction, because blocking is not mutual.
   *
   * Blocking somebody stops them reaching you and stops you seeing them, and
   * says nothing about what they can see of anybody else. The `byBlocked` index
   * exists so the send path can ask "has the person I am writing to blocked me"
   * without reading their profile, and `byBlocker` so a thread can be filtered
   * against the viewer's own list in one read.
   *
   * Not an array on the profile: Convex caps an array field at 8,192 elements
   * and a document at a megabyte, and more immediately, a list that has to be
   * rewritten in full to add one entry is a write conflict waiting to happen.
   */
  blocks: defineTable({
    blocker: v.string(),
    blocked: v.string(),
    createdAt: v.number(),
  })
    .index("byBlocker", ["blocker", "blocked"])
    .index("byBlocked", ["blocked"]),

  /**
   * Somebody saying that something was wrong.
   *
   * Nobody reads these. That is not an oversight — there are no moderators, by
   * design — so a report is not a message to a human, it is an input to the same
   * arithmetic that everything else feeds. Which makes the shape of this table
   * mostly about abuse of it.
   *
   * `byReporterMessage` enforces one report per person per message, so a single
   * account cannot become a crowd. `weight` is stored rather than recomputed
   * because it is a judgement made at the time — it depends on the reporter's
   * own standing when they filed it — and recomputing it later would let
   * somebody retroactively strengthen their old reports by keeping their record
   * clean, or weaken them by not.
   *
   * The rest of the guard is in `convex/moderation/limits.ts`: a daily cap per
   * reporter, and a hard ceiling on how much of anyone's standing can ever come
   * from reports at all. A group can get somebody muted for a day. It cannot get
   * them banned; only the filter, reading what was actually said, can do that.
   */
  reports: defineTable({
    reporterClerkId: v.string(),
    messageId: v.optional(v.id("messages")),
    targetClerkId: v.string(),
    conversationId: v.optional(v.id("conversations")),
    reason: v.union(
      v.literal("abuse"),
      v.literal("harassment"),
      v.literal("sexual"),
      v.literal("self-harm"),
      v.literal("spam"),
      v.literal("contact"),
      v.literal("other"),
    ),
    createdAt: v.number(),
    /** The reporter's weight at the moment they filed. Never recomputed. */
    weight: v.number(),
  })
    .index("byReporterMessage", ["reporterClerkId", "messageId"])
    .index("byMessage", ["messageId"])
    .index("byReporter", ["reporterClerkId", "createdAt"])
    .index("byTarget", ["targetClerkId"])
    // So a conversation being deleted can take the reports filed inside it.
    // Without this they outlive the messages they are about and point at ids
    // that no longer resolve.
    .index("byConversation", ["conversationId"]),

  /**
   * The ledger, and the whole of enforcement.
   *
   * Standing is the sum of the rows here that have not expired; the ladder in
   * `convex/moderation/limits.ts` turns that number into a mute or a ban.
   * Nothing else is consulted anywhere.
   *
   * It is a table of rows rather than a counter on the profile for one reason:
   * the person it happened to is shown it. A number that says `14` is an
   * accusation. Fourteen rows, each with a rule, a date, an excerpt of what was
   * said, and the day it stops counting, is an explanation — and on a system
   * with no appeal, an explanation is the only thing standing between automated
   * enforcement and somebody being punished by a machine for reasons they will
   * never learn.
   *
   * `expiresAt` is the index key so the nightly sweep can find what is dead
   * without scanning, and so a read can stop early. Expired rows are also
   * ignored at read time, because the sweep runs once a day and correctness
   * cannot wait on it.
   */
  strikes: defineTable({
    clerkId: v.string(),
    at: v.number(),
    weight: v.number(),
    /** A `Refusal` from `convex/moderation/rules.ts`. */
    rule: v.string(),
    source: v.union(
      v.literal("filter"),
      v.literal("reports"),
      v.literal("rate"),
    ),
    conversationId: v.optional(v.id("conversations")),
    /** Enough of the message to recognise. Never enough to republish. */
    excerpt: v.optional(v.string()),
    expiresAt: v.number(),
  })
    .index("byUser", ["clerkId", "expiresAt"])
    // The sweep's index. `byUser` cannot answer "everything dead everywhere",
    // because its first field is the account and there is no account to fix.
    .index("byExpiry", ["expiresAt"]),
});
