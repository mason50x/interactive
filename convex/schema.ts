import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

import { publishedFields } from "./simulator/publishedModel";
import { htmlFields } from "./simulator/htmlModel";
import { entryFields, saveFields } from "./simulator/model";
import { legacyPuzzleParams, puzzleParams } from "./calculus";

export default defineSchema({
  leaderboardScores: defineTable({
    key: v.string(), clerkId: v.string(), score: v.number(), expiresAt: v.optional(v.number()),
  }).index("by_key_and_clerk", ["key", "clerkId"])
    .index("by_key_and_score", ["key", "score"])
    .index("by_clerk", ["clerkId"])
    .index("by_expiry", ["expiresAt"]),
  leaderboardPages: defineTable({
    day: v.number(), path: v.string(), views: v.number(),
  }).index("by_day_and_path", ["day", "path"])
    .index("by_day_and_views", ["day", "views"])
    .index("by_day", ["day"]),
  // Compact aggregates only: no sessions, heartbeats, or raw view events.
  personalGameViews: defineTable({
    clerkId: v.string(), slug: v.string(), views: v.number(), lastOpenedAt: v.number(),
  }).index("by_clerkId_and_slug", ["clerkId", "slug"])
    .index("by_clerkId_and_lastOpenedAt", ["clerkId", "lastOpenedAt"]),
  globalGameViews: defineTable({
    slug: v.string(), views: v.number(),
    days: v.array(v.object({ day: v.number(), views: v.number() })),
  }).index("by_slug", ["slug"]),
  experienceLeases: defineTable({
    clerkId: v.string(),
    day: v.number(),
    until: v.number(),
    allowanceSeconds: v.optional(v.number()),
    bonusSeconds: v.optional(v.number()),
    activitySpentOverageSeconds: v.optional(v.number()),
    /** Listening in the background: the reserved time is charged at half. */
    half: v.optional(v.boolean()),
    sessions: v.optional(v.array(v.object({ id: v.string(), until: v.number(), half: v.optional(v.boolean()) }))),
  }).index("by_clerkId_and_day", ["clerkId", "day"]),
  playtimeRewards: defineTable({
    clerkId: v.string(), hash: v.string(), normalized: v.string(),
    /** Where the rewarded message was sent. The receipt, not the message
     * row, is what holds the sender's turn there: a message can be unsent
     * for thirty seconds, and the receipt outlives it. Absent on receipts
     * from before turns were tracked. */
    conversationId: v.optional(v.id("conversations")),
  }).index("by_clerkId_and_hash", ["clerkId", "hash"])
    .index("by_clerkId", ["clerkId"])
    .index("by_clerkId_and_conversation", ["clerkId", "conversationId"]),
  publishedHtmlSimulators: defineTable(publishedFields)
    .index("by_publishKey", ["publishKey"])
    .index("by_storageId", ["storageId"])
    .index("by_createdBy", ["createdBy"])
    .index("by_updatedBy", ["updatedBy"]),
  htmlSimulatorEntries: defineTable(htmlFields)
    .index("by_ownerClerkId_and_contentHash", ["ownerClerkId", "contentHash"]),
  simulatorEntries: defineTable(entryFields)
    .index("by_ownerClerkId_and_contentHash", ["ownerClerkId", "contentHash"])
    .index("by_ownerClerkId_and_lastOpenedAt", ["ownerClerkId", "lastOpenedAt"]),
  simulatorSaves: defineTable(saveFields)
    .index("by_entryId_and_slot", ["entryId", "slot"])
    .index("by_ownerClerkId", ["ownerClerkId"]),
  users: defineTable({
    // Clerk user id — this is `identity.subject` on the Convex side
    // and `data.id` in Clerk webhook payloads.
    clerkId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    username: v.optional(v.string()),
    usernameKey: v.optional(v.string()),
    clerkCreatedAt: v.optional(v.number()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    clerkUpdatedAt: v.optional(v.number()),
    activityLimitMinutes: v.optional(v.number()),
    onboardingComplete: v.optional(v.boolean()),
    /**
     * Whether the account has got past the invite gate. New rows start
     * `false`; absent means a row from before invites, which reads as in.
     */
    invited: v.optional(v.boolean()),
    inviteCodeId: v.optional(v.id("inviteCodes")),
    /**
     * When the account was first told that a message earned no playtime
     * because it was not their turn. Set once, inside the send that did it,
     * so the note shows a single time per person rather than per browser.
     */
    turnNoticeAt: v.optional(v.number()),
  }).index("byClerkId", ["clerkId"])
    .index("byUsernameKey", ["usernameKey"])
    .index("byFirstName", ["firstName"])
    .searchIndex("searchUsername", { searchField: "username" }),

  // One replaceable snapshot per account, not a page-view or heartbeat log.
  // Separate from users so frequent beats do not invalidate profile readers.
  userActivity: defineTable({
    clerkId: v.string(),
    currentPath: v.string(),
    lastActiveAt: v.number(),
    lastCountedAt: v.optional(v.number()),
    /**
     * Seconds this account has had the site open on weekdays of the week
     * `weekKey` names (`weekKey` in `convex/leaderboard.ts`: Monday UTC).
     * Added up by the heartbeat from the gaps between its own beats, so it
     * costs no write the beat was not already making. Read by the Friday
     * inactivity job (`convex/inactivity.ts`); a row from another week reads
     * as zero. Absent on rows from before the job.
     */
    weekKey: v.optional(v.number()),
    weekSeconds: v.optional(v.number()),
  }).index("byClerkId", ["clerkId"])
    .index("byLastActiveAt", ["lastActiveAt"]),

  userTimeouts: defineTable({
    clerkId: v.string(),
    reason: v.string(),
    expiresAt: v.number(),
    enabled: v.boolean(),
    ceoCleared: v.optional(v.boolean()),
    issuedBy: v.string(),
    issuedByRole: v.union(
      v.literal("ceo"),
      v.literal("co_owner"),
      v.literal("head_moderator"),
    ),
    /**
     * Whether twenty calculus problems in a row lift this timeout early (see
     * `timeoutPuzzles.ts`). Missing on rows from before the option, which
     * read as on, the default.
     */
    mathBypass: v.optional(v.boolean()),
    updatedAt: v.number(),
  }).index("byClerkId", ["clerkId"])
    .index("byIssuedBy", ["issuedBy"])
    .index("byCeoClearedAndUpdatedAt", ["ceoCleared", "updatedAt"])
    .index("byEnabledAndUpdatedAt", ["enabled", "updatedAt"]),
  /** One working-off streak per timed-out user; see `timeoutPuzzles.ts`. */
  timeoutPuzzles: defineTable({
    clerkId: v.string(),
    timeoutId: v.id("userTimeouts"),
    timeoutExpiresAt: v.number(),
    session: v.string(),
    streak: v.number(),
    /**
     * The legacy half of the union is only for rows written before the
     * switch from geometry to calculus; see `legacyPuzzleParams`.
     */
    params: v.union(puzzleParams, legacyPuzzleParams),
    issuedAt: v.number(),
  }).index("byClerkId", ["clerkId"]),
  timeoutAudit: defineTable({
    clerkId: v.string(),
    actor: v.string(),
    action: v.union(v.literal("on"), v.literal("off")),
    reason: v.string(),
    expiresAt: v.number(),
    at: v.number(),
  }).index("byClerkId", ["clerkId"])
    .index("byActor", ["actor"]),

  /**
   * The one site-wide announcement, on or off for everyone at once. A single
   * row, created on the first save; absent means nothing has ever been
   * written. While `enabled` and `display` is `screen`, every public function
   * refuses a caller who is not an admin. See
   * `convex/announcement.ts` and `convex/functions.ts`.
   */
  siteAnnouncement: defineTable({
    enabled: v.boolean(),
    heading: v.string(),
    message: v.optional(v.string()),
    /** `screen` takes the whole viewport; `banner` is a card over the app. */
    display: v.union(v.literal("screen"), v.literal("banner")),
    updatedAt: v.number(),
    updatedBy: v.string(),
    /** When and by whom it was last turned on. Absent until the first time. */
    enabledAt: v.optional(v.number()),
    enabledBy: v.optional(v.string()),
  }),

  /**
   * The Friday inactivity removal's switch and its last outcome. A single
   * row, created the first time a CEO flips the switch or the job runs;
   * absent means on, which is how the job shipped. See `convex/inactivity.ts`.
   */
  inactivitySettings: defineTable({
    enabled: v.boolean(),
    updatedAt: v.optional(v.number()),
    updatedBy: v.optional(v.string()),
    lastRun: v.optional(v.object({
      at: v.number(),
      outcome: v.union(
        v.literal("removed"),
        v.literal("nobody"),
        v.literal("failed"),
        v.literal("skipped"),
      ),
      /** Who was removed, or who Clerk refused to remove. */
      name: v.optional(v.string()),
      handle: v.optional(v.string()),
    })),
  }),

  /**
   * Retired. Per-account restrictions were replaced by `siteAnnouncement`,
   * and nothing reads or writes this table any more except the account purge
   * (`convex/accountCleanup.ts`), which still drains it. The definition stays
   * until the table is empty in every deployment: Convex refuses a schema
   * that drops a table still holding documents. Clear it in the dashboard,
   * then delete this block and the purge stage together.
   */
  accountRestrictions: defineTable({
    clerkId: v.string(),
    kind: v.union(v.literal("banned"), v.literal("error")),
    title: v.optional(v.string()),
    heading: v.optional(v.string()),
    message: v.optional(v.string()),
    footer: v.optional(v.string()),
    updatedAt: v.number(),
    updatedBy: v.string(),
  }).index("byClerkId", ["clerkId"]),

  /**
   * CEO-editable role overrides, read alongside the server-owned `STAFF_ROLES`
   * env map (see `config/roles.ts`). The env map is deployment config and has
   * no runtime write API, so anything a CEO client can change has to live in
   * a table. A row here always wins over the env map for that Clerk id —
   * including an explicit `member`, which is how a CEO demotes somebody the
   * env map still names.
   */
  /** CEO-made invite codes. See `convex/invites.ts`. */
  inviteCodes: defineTable({
    code: v.string(),
    note: v.optional(v.string()),
    /** Absent means unlimited. */
    maxUses: v.optional(v.number()),
    uses: v.number(),
    /** Absent means it never expires. */
    expiresAt: v.optional(v.number()),
    disabled: v.boolean(),
    createdBy: v.string(),
  }).index("byCode", ["code"]),

  staffRoles: defineTable({
    clerkId: v.string(),
    role: v.union(
      v.literal("ceo"),
      v.literal("co_owner"),
      v.literal("head_moderator"),
      v.literal("moderator"),
      v.literal("builder"),
      v.literal("member"),
    ),
    /**
     * Cosmetic only: hides the staff badge everywhere chat shows one. The
     * role's powers are untouched. Absent means shown.
     */
    hideBadge: v.optional(v.boolean()),
    updatedAt: v.number(),
    updatedBy: v.string(),
  }).index("byClerkId", ["clerkId"])
    .index("byUpdatedBy", ["updatedBy"]),

  /**
   * Retired. Remote sound, which played a sound on an account's devices from
   * the Admin user directory, was removed, and nothing reads or writes this
   * table any more. The definition stays until the table is empty in every
   * deployment: Convex refuses a schema that drops a table still holding
   * documents. Clear it in the dashboard, then delete this block.
   */
  soundPings: defineTable({
    clerkId: v.string(),
    sound: v.string(),
    /** Percent of the sound's natural level, 50–200. Absent means 100. */
    volume: v.optional(v.number()),
    sentBy: v.string(),
    sentAt: v.number(),
  }).index("byClerkId", ["clerkId"]),

  /**
   * CEO-raised topics every member votes yes or no on. `forced` holds the
   * member's playtime until they vote; otherwise the vote is only asked for.
   * The tallies live on the row so the admin list never scans the votes.
   * See `convex/votes.ts`.
   */
  voteTopics: defineTable({
    title: v.string(),
    description: v.string(),
    forced: v.boolean(),
    closed: v.boolean(),
    yes: v.number(),
    no: v.number(),
    createdBy: v.string(),
  }).index("byClosed", ["closed"]),

  /** One immutable ballot per account per topic. */
  votes: defineTable({
    topicId: v.id("voteTopics"),
    clerkId: v.string(),
    choice: v.union(v.literal("yes"), v.literal("no")),
  }).index("byClerkIdAndTopicId", ["clerkId", "topicId"])
    .index("byTopicId", ["topicId"]),

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
    /** Legacy: the removed background animation. Kept so old rows stay valid. */
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
    /**
     * Which of River Falls High School's three lunches this person has (1–3),
     * so the home page's bell schedule can split Block 3 around it.
     */
    lunch: v.optional(v.number()),
    /**
     * Everything else the Settings page can change — the look, the layout,
     * home, chat, privacy and accessibility — keyed by the names in
     * `customSpec` in `src/lib/customize.ts`. One record rather than a column
     * each: there are dozens, they are all small values the client checks
     * against its own table, and a setting added there needs nothing here.
     */
    custom: v.optional(
      v.record(
        v.string(),
        v.union(v.string(), v.number(), v.boolean(), v.array(v.string())),
      ),
    ),
  }).index("byClerkId", ["clerkId"]),

  /**
   * A GIF somebody hearted in the picker, so it is one tap away next time.
   *
   * Two KLIPY links and nothing else: the one a message keeps (`gif`, the
   * same shape `messages.gif` takes) and the small rendition the picker's grid
   * draws (`preview`). Only links, for the reason `messages.gif` is only a
   * link — KLIPY's terms forbid copying the media — and the same host check
   * guards both on the way in. `gifFavorites.save` caps the rows per account,
   * so this table is bounded by the number of accounts and not by enthusiasm.
   */
  gifFavorites: defineTable({
    clerkId: v.string(),
    gif: v.object({
      slug: v.string(),
      url: v.string(),
      width: v.number(),
      height: v.number(),
      title: v.optional(v.string()),
    }),
    preview: v.object({ url: v.string(), width: v.number(), height: v.number() }),
  })
    .index("byClerkId", ["clerkId"])
    .index("byClerkIdAndSlug", ["clerkId", "gif.slug"]),

  /** Per-account moderation counters, separate from Clerk identity. */
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
   * messages and reads — is identical, and the differences are three
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
    kind: v.union(v.literal("global"), v.literal("announcements"), v.literal("admins"), v.literal("dm"), v.literal("group")),
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
    .index("byKind", ["kind"])
    .index("byCreatedBy", ["createdBy"]),

  /**
   * Staff switches on the Everyone room: a lock and a slow mode.
   *
   * Its own table rather than fields on `conversations`, so a send can read
   * it without putting the room's document in its read set. Only staff
   * write here, and rarely, so busy senders still share no write. No row
   * means both are off. No author is kept, so deleting an account leaves
   * nothing here to scrub.
   */
  roomControls: defineTable({
    conversationId: v.id("conversations"),
    locked: v.boolean(),
    /** 0 is off. One of `SLOW_MODE_SECONDS` in `convex/chat/roomControls.ts`. */
    slowModeSeconds: v.number(),
    updatedAt: v.number(),
  }).index("byConversation", ["conversationId"]),

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
    kind: v.union(v.literal("global"), v.literal("announcements"), v.literal("admins"), v.literal("dm"), v.literal("group")),
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
    /** Legacy preference retained for existing membership rows. */
    favorite: v.optional(v.boolean()),
    invitedBy: v.optional(v.string()),
    /** Direct messages only: the Clerk id of the other person. */
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
   * Direct messages keep no rows here. Their peer status reads app activity.
   */
  presence: defineTable({
    conversationId: v.id("conversations"),
    clerkId: v.string(),
    lastSeenAt: v.number(),
  })
    .index("byConversationSeen", ["conversationId", "lastSeenAt"])
    .index("byConversationUser", ["conversationId", "clerkId"])
    .index("byClerkId", ["clerkId"])
    // For the sweep alone: rows nobody has refreshed in a long time, across
    // every conversation at once. See `sweepPresence` in `convex/chat/sweep.ts`.
    .index("bySeen", ["lastSeenAt"]),

  /**
   * Who is writing something right now.
   *
   * The same shape as `presence` above and for the same reasons, only faster
   * and shorter-lived: one row per person per conversation, written by that
   * person alone while their box has words in it, and read by everybody else
   * in the conversation. Nothing is ever marked "stopped typing" — a row
   * simply carries the instant it stops counting, and a browser that closed
   * mid-sentence falls out of the answer on its own a few seconds later.
   *
   * `until` rather than `lastSeenAt`, because the question the reader asks
   * is "is this still true", and the window is short enough that the client
   * has to answer it on its own clock between pushes — see `who` in
   * `convex/chat/typing.ts` for how it is handed over without trusting two
   * clocks to agree.
   *
   * The handle and name are copied onto the row so the reader's query can
   * draw a face and a caption without a profile read per typist. They are
   * seconds old at most, which is well inside how stale a name may be.
   */
  typing: defineTable({
    conversationId: v.id("conversations"),
    clerkId: v.string(),
    handle: v.string(),
    displayName: v.optional(v.string()),
    until: v.number(),
    /** Only the synthetic bot uses this to isolate overlapping generations. */
    token: v.optional(v.id("messages")),
  })
    .index("byConversationUntil", ["conversationId", "until"])
    .index("byConversationUser", ["conversationId", "clerkId"])
    .index("byClerkId", ["clerkId"])
    // For the sweep alone. See `sweepTyping` in `convex/chat/sweep.ts`.
    .index("byUntil", ["until"]),

  /**
   * Flame staying in a room conversation after a tag, so follow-ups do not
   * each need another `@flame`. One row per conversation, rewritten by the
   * bot alone — a send only reads it — so busy rooms never contend on it.
   * See `followUp` in `convex/chat/bot.ts`.
   */
  botEngagements: defineTable({
    conversationId: v.id("conversations"),
    /** Untagged messages before this instant may still get an answer. */
    until: v.number(),
    /** Untagged messages the model has been asked about since the last tag. */
    considered: v.number(),
    /** Of those, how many Flame actually answered. */
    replies: v.number(),
  }).index("byConversation", ["conversationId"]),

  /**
   * What was said.
   *
   * Ordered by `_creationTime` through `byConversation`, which is what the
   * paginated thread query reads backwards. There is no `createdAt` field
   * because Convex already keeps one and a second copy could only ever disagree
   * with it.
   *
   * Author fields are snapshots for optimistic sends; reads resolve current Clerk identity.
   *
   * ## Only survivors are here
   *
   * A message that fails the filter is never inserted. There is no row for it,
   * no id, and nothing to leak: the refusal happens in `convex/chat/messages.ts`
   * before any write. `hidden` is retained for legacy messages. An author taking their
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
    /** Internal diagnostics for a failed bot request; never included in chat DTOs. */
    botFailure: v.optional(v.object({
      model: v.string(),
      reason: v.string(),
      durationMs: v.number(),
      timedOut: v.boolean(),
      at: v.number(),
    })),
    editedAt: v.optional(v.number()),
    /** Stable across network retries, scoped to the authenticated author. */
    clientNonce: v.optional(v.string()),
    /** Immutable original request fingerprint; edits do not change retries. */
    clientRequestHash: v.optional(v.string()),
    poll: v.optional(v.object({
      options: v.array(v.string()),
      votes: v.array(v.object({ clerkId: v.string(), option: v.number() })),
    })),
    /**
     * The message this one answers, when it is a reply.
     *
     * Only the id is stored. The thread query resolves the current author and a
     * short preview, which means a message hidden after it was replied to does
     * not survive inside a copied quote. The field is optional for every row
     * written before replies existed.
     */
    replyToId: v.optional(v.id("messages")),
    /**
     * Who this message names, resolved by the server from the `@words` in
     * its body — see `resolveMentions` in `convex/chat/messages.ts`.
     *
     * Denormalised for the reason `authorHandle` is: the thread draws the
     * chips from this and the body alone, and an optimistic send can build
     * both. `handle` is the handle as it was when the message was sent, and
     * like `authorHandle` it is not rewritten by a rename; `clerkId` is what
     * the chip opens a card for. Absent on every message that names nobody,
     * which is nearly all of them.
     *
     * `mentionsEveryone` is `@everyone`, which is a mention with no `clerkId`
     * and no profile. The Everyone room only, staff only, enforced on the
     * way in.
     *
     * Neither is what the conversation list reads to say "mentioned you" —
     * that is the `mentions` table below, which is indexed by who was named.
     */
    mentions: v.optional(
      v.array(v.object({ clerkId: v.string(), handle: v.string() })),
    ),
    mentionsEveryone: v.optional(v.boolean()),
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
    /**
     * A GIF picked from KLIPY, as the link KLIPY handed the sender's browser.
     *
     * Only the link is kept: KLIPY's terms require media to load straight
     * from their CDN and forbid storing or re-hosting it, so there is no file
     * here to delete with the message. `send` accepts only KLIPY media hosts.
     * `slug` is KLIPY's id for it, and what the duplicate rule remembers.
     */
    gif: v.optional(
      v.object({
        slug: v.string(),
        url: v.string(),
        width: v.number(),
        height: v.number(),
        title: v.optional(v.string()),
      }),
    ),
  })
    .index("byConversation", ["conversationId"])
    .index("byAuthor", ["authorClerkId"])
    .index("byAuthorNonce", ["authorClerkId", "clientNonce"])
    .index("byConversationStatus", ["conversationId", "status"]),

  /**
   * One row per person a message names, so "mentioned you" is a lookup.
   *
   * The message already carries its mentions — see `mentions` above — but
   * an array on a document is not something an index can point into, and
   * the question the conversation list asks is the other way round: not "who
   * does this message name" but "does anything unread in here name *me*". The
   * honest way to answer that from the messages table is to read every
   * unread message in every conversation, which for the global room is the
   * one query this schema is built never to run.
   *
   * So a message that names people writes one of these per person, and the
   * list asks `byTargetConversation` for rows newer than its reading position
   * and takes one. That read is bounded, indexed, and invalidated only when
   * somebody names the caller in that conversation — not by anybody talking.
   *
   * `target` is a Clerk id, or the literal `everyone` for `@everyone`, which
   * is one row rather than one per member: the list asks about both targets,
   * and a hundred writes per message would be the cost of not doing so.
   *
   * Mention rows are removed with their message and target account.
   */
  mentions: defineTable({
    conversationId: v.id("conversations"),
    messageId: v.id("messages"),
    target: v.string(),
    authorClerkId: v.string(),
  })
    .index("byTargetConversation", ["target", "conversationId"])
    .index("byMessage", ["messageId"]),

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
   * `ready` passed moderation and has not been sent. `sent` belongs to a message
   * and is removed with that message by `deleteMessage`.
   *
   * A picture that fails has no state. The file is deleted and so is this row —
   * there is nothing to keep, for the same reason a refused message is never
   * inserted.
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
   */
  attachmentUploadReservations: defineTable({
    ownerClerkId: v.string(),
    purpose: v.literal("message"),
    expiresAt: v.number(),
  })
    .index("byOwner", ["ownerClerkId"])
    .index("byExpiresAt", ["expiresAt"]),

  attachments: defineTable({
    storageId: v.id("_storage"),
    ownerClerkId: v.string(),
    status: v.union(
      v.literal("checking"),
      v.literal("ready"),
      v.literal("sent"),
    ),
    purpose: v.optional(v.literal("message")),
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

});
