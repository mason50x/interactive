/**
 * Every number this system can be argued about, in one file.
 *
 * The rest of this directory decides *what* is wrong. This decides how wrong,
 * how often, and for how long — which is the half that needs changing when the
 * room turns out calmer or nastier than it was designed for, and the half that
 * should never require reading a regular expression to adjust.
 *
 * Nothing here is imported from `src/`. See `convex/moderation/lexicon.ts` for
 * why that matters and what enforces it.
 */

/** The three places a message can be sent. */
export type Surface = "global" | "dm" | "group";

/**
 * The longest a message may be, per surface.
 *
 * The global room is capped far lower than a private one on purpose. A wall of
 * text in a room of strangers is a denial of service on everyone else's screen,
 * and nothing that genuinely needs two thousand characters needs to be said to
 * everybody at once.
 */
export const MAX_BODY: Record<Surface, number> = {
  global: 500,
  dm: 2000,
  group: 2000,
};

/** Anything shorter than this, after trimming, is not a message. */
export const MIN_BODY = 1;

/** Newlines past this are a stretched-out shout rather than a paragraph. */
export const MAX_NEWLINES = 12;

/**
 * The longest run of one repeated character that survives.
 *
 * Not a violation — the run is collapsed before matching, so `fuuuuck` and
 * `fuck` are the same word to the lexicon. This cap is only about the message
 * as *rendered*: two hundred exclamation marks is a layout attack.
 */
export const MAX_CHAR_RUN = 16;

/**
 * Combining marks stacked deeper than this on one base character is Zalgo, and
 * Zalgo is never anything else. Two is enough for every real language that
 * stacks (Thai, Devanagari, Vietnamese all fit).
 */
export const MAX_COMBINING_RUN = 2;

/**
 * How long a strike counts against you.
 *
 * Thirty days is the whole reason the ladder is survivable: someone who had one
 * bad afternoon in March is clear by April without anybody lifting it by hand,
 * which matters a great deal in a system where nobody is available to.
 */
export const STRIKE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * The ladder, read as "at or above this standing, this consequence".
 *
 * Ordered heaviest first; `consequenceFor` in `convex/moderation/standing.ts`
 * takes the first match. A `durationMs` of `null` is a ban, which is the only
 * step that does not lift on its own.
 */
export const LADDER: { at: number; durationMs: number | null }[] = [
  { at: 25, durationMs: null },
  { at: 15, durationMs: 24 * 60 * 60 * 1000 },
  { at: 8, durationMs: 60 * 60 * 1000 },
  { at: 4, durationMs: 10 * 60 * 1000 },
];

/**
 * The most a pile of reports can ever add to someone's standing.
 *
 * This is the anti-brigade guard, and it is a cap rather than a clever
 * weighting scheme because a cap cannot be gamed by coordinating harder. Twelve
 * tops out inside the 24-hour mute step: a group that decides to bury someone
 * can cost them a day. It cannot cost them the account. Only the filter, which
 * reads what was actually said, can do that.
 */
export const MAX_REPORT_STANDING = 12;

/** What one upheld report adds, before the reporter's weight is applied. */
export const REPORT_STRIKE_WEIGHT = 2;

/**
 * Reports needed on one message before it is hidden and its author struck.
 *
 * Counted as summed reporter weight *and* as distinct reporters, because either
 * alone is weak: three accounts is cheap to make on an invite-only site if you
 * have friends, and one furious regular should not be able to hide anything.
 */
export const REPORTS_TO_HIDE = { weight: 3, distinct: 3 };

/** The most reports one account's opinion is worth in a day. */
export const MAX_REPORTS_PER_DAY = 10;

/**
 * What a reporter's report is worth, by their own standing.
 *
 * Someone currently muted has an opinion worth exactly nothing, which is the
 * cheapest possible defence against a retaliation ring: the accounts most
 * motivated to mass-report are the ones that just got struck.
 */
export function reporterWeight(standing: number, muted: boolean): number {
  if (muted) return 0;
  if (standing >= 4) return 0.25;
  if (standing > 0) return 0.5;
  return 1;
}

/** How long a new account waits before it may speak to the whole room. */
export const GLOBAL_COOLDOWN_MS = 15 * 60 * 1000;

/**
 * How long after sending a message may still be deleted outright.
 *
 * Short on purpose. Long enough to cover the whole of why anybody wants it —
 * the wrong thread, the wrong words, sent before it was finished — and too
 * short to be a way of editing a conversation after the fact. Past this the
 * message belongs to the conversation as much as to the person who wrote it,
 * and the people replying to it deserve it to stay put.
 */
export const DELETE_WINDOW_MS = 30 * 1000;

/**
 * How many recent sends are remembered on the sender's own profile.
 *
 * This one bounded array is the entire cross-message memory of the system —
 * rate windows, duplicate detection, broadcast detection and repeat-targeting
 * all read it, and none of them needs a table or a second document because of
 * it. Twenty covers the longest window below with room to spare.
 */
export const RECENT_RING = 20;

/**
 * The rate windows, by trust tier. Each is "at most `count` in `ms`".
 *
 * Two windows per tier rather than one: the short window stops a paste-bomb,
 * the long one stops a patient flood that stays under it. A tier only ever
 * relaxes these — there is no tier that can send faster than `trusted`.
 */
export const RATES = {
  fresh: [
    { count: 3, ms: 10_000 },
    { count: 20, ms: 5 * 60_000 },
  ],
  regular: [
    { count: 5, ms: 10_000 },
    { count: 40, ms: 5 * 60_000 },
  ],
  trusted: [
    { count: 8, ms: 10_000 },
    { count: 80, ms: 5 * 60_000 },
  ],
} as const;

export type Tier = keyof typeof RATES;

/** What it takes to stop being new, and what it takes to be trusted. */
export const TRUST = {
  freshUntilMs: 24 * 60 * 60 * 1000,
  freshUntilMessages: 10,
  trustedAfterMs: 7 * 24 * 60 * 60 * 1000,
  trustedAfterMessages: 200,
};

/** Saying the same thing twice inside this window is saying it twice. */
export const DUPLICATE_WINDOW_MS = 10 * 60_000;

/** The same text into this many conversations this fast is a broadcast. */
export const BROADCAST = { conversations: 3, ms: 5 * 60_000 };

/** Flagged messages at one conversation this fast is someone being hounded. */
export const TARGETING = { count: 3, ms: 10 * 60_000 };

/**
 * Whether ordinary profanity is masked on its way in.
 *
 * Ships off, and should stay off. Masking `shit` to `s***` is defeated by
 * anyone who cares in about four seconds, reads as patronising to the many more
 * who do not, and — the real objection — throws away the word, which is the
 * signal the targeting rule in `convex/moderation/rules.ts` actually needs.
 * Flagging it and keeping it is strictly more useful than hiding it.
 */
export const SOFTEN_TIER_3 = false;

/**
 * Hosts a link may point at. Ships empty, which means no links at all.
 *
 * Kept as a set rather than a boolean so that relaxing this is a list of hosts
 * somebody chose, not a switch somebody flipped. See the link rule in
 * `convex/moderation/rules.ts` for why the default is nothing.
 */
export const ALLOWED_LINK_HOSTS: ReadonlySet<string> = new Set<string>([]);

/**
 * How long the global room keeps what was said in it.
 *
 * Every other table here is bounded by the number of accounts or the number of
 * conversations. This one is bounded by nothing at all, so it is bounded by
 * time instead, and thirty days is well past the point where anyone scrolls.
 */
export const GLOBAL_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/** How much of an offending message is kept on the strike that it caused. */
export const EXCERPT_CHARS = 120;

/** Reaction emoji, fixed here so there is nothing about them to moderate. */
export const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥"] as const;

/** The most distinct reactions one message may carry. */
export const MAX_REACTION_KINDS = 6;

/** The most reactors recorded per emoji. Past this, only the count moves. */
export const MAX_REACTORS = 100;

/** The longest a group may be called. */
export const MAX_TITLE = 40;

/**
 * The faces a group may wear, fixed for the same reason the reactions are.
 *
 * A closed set is what makes a group's picture unmoderatable in the good sense:
 * there is no upload, no text, and nothing a person can put here that was not
 * already chosen. Anything outside this list is refused rather than sanitised —
 * see `setLook` in `convex/chat/groups.ts`.
 */
export const GROUP_EMOJI = [
  "🎮", "🎵", "⚽", "🎨", "📚", "🍕", "🌟", "🚀",
  "🐙", "🌵", "🍀", "🧩", "🎲", "🛹", "🪐", "🦊",
] as const;

/** The hues a group may be drawn on. Twelve steps around the wheel. */
export const GROUP_HUES = [
  10, 40, 70, 100, 130, 160, 190, 220, 250, 280, 310, 340,
] as const;


/**
 * The same wheel, for a person.
 *
 * Shared with `GROUP_HUES` on purpose: a person and a group drawn from two
 * different palettes would read as two different kinds of object in a list
 * that is deliberately one list.
 */
export const AVATAR_HUES = GROUP_HUES;

/**
 * How many letters somebody may put on their own disc.
 *
 * Two, because that is initials. It is also the whole of why this is not a
 * display name: two characters cannot carry a sentence, an address, or an
 * insult, so the field needs no moderation pass — only a shape check. See
 * `setAvatar` in `convex/chat/profiles.ts`.
 */
export const MAX_INITIALS = 2;

/**
 * How many times an account may change its handle. Ever, not per period.
 *
 * The old rule was none, and the reason was good: somebody who has made
 * themselves unpleasant should not be able to shed the name people know them
 * by. Two is the compromise — enough for a name typed wrong or regretted early,
 * few enough that it cannot be used to keep moving. There is no reset.
 *
 * Note that renaming does not rewrite history: `authorHandle` is stored on
 * every message and stays as it was, so old messages keep the name they were
 * sent under. That is a feature of this limit rather than a defect of it.
 */
export const MAX_HANDLE_CHANGES = 2;
