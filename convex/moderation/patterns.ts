import { ALLOWED_LINK_HOSTS } from "./limits";

/**
 * Getting somebody's contact details out of a moderated room.
 *
 * This is the rule that matters most and reads as the most annoying. Everything
 * else here is about what is said inside the room; this is about the room being
 * used as a doorway to somewhere with no rules in it at all. A thirteen-year-old
 * who is talked into moving the conversation to a platform nobody is watching
 * has left the part of the system that can protect them, and every mechanism in
 * this directory stops at the door with them.
 *
 * So links, addresses, phone numbers and platform handles are refused
 * everywhere, including in private messages between accepted friends — the DM
 * is where this always happens, so exempting it would exempt the case.
 * `ALLOWED_LINK_HOSTS` in `convex/moderation/limits.ts` exists to reopen this
 * deliberately, host by host, and ships empty.
 *
 * ## Everything here is linear
 *
 * A mutation gets one second. A regular expression with a nested quantifier can
 * spend all of it on a two-thousand-character message built to make it, and the
 * user-visible result is not a slow message but a message that never sends. So
 * the quantifiers below are all bounded and none of them nests, and the two
 * genuinely awkward jobs — counting the digits in a phone number, and finding a
 * platform name near a verb — are written as scans rather than as patterns.
 */

export type PatternCategory = "contact" | "link" | "location";

export type PatternHit = { rule: string; category: PatternCategory };

/** Bounded on both sides, no nesting: the local part, then labelled domains. */
const EMAIL = /[a-z0-9._%+-]{1,64}@[a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63}){1,4}/i;

/**
 * The top-level domains worth knowing about, which is not all of them.
 *
 * A bare `something.com` is a link whether or not it was written as one, and
 * this list is what tells `chat.example` apart from `i saw it. also this`. It
 * leans towards the ones that actually turn up: the majors, the link shorteners
 * and the free registrars that nothing legitimate uses.
 */
const TLDS =
  "com|net|org|edu|gov|io|co|me|tv|gg|xyz|app|dev|link|site|online|club|fun|top|live|shop|store|blog|page|space|website|icu|cc|ws|tk|ml|ga|cf|gq|ru|cn|uk|us|de|fr|nl|info|biz|pro|lol|zip|mov";

const SCHEME = /(?:https?:\/\/|www\.)/i;
const BARE_DOMAIN = new RegExp(`\\b[a-z0-9-]{1,63}\\.(?:${TLDS})\\b`, "i");

/**
 * `example dot com`, `example [dot] com`, `example . com`.
 *
 * Written out because writing it out is the point — anybody typing it this way
 * has already been told once that links are not allowed.
 */
const OBFUSCATED_DOMAIN = new RegExp(
  `[a-z0-9-]{1,63}\\s{0,3}(?:\\[|\\()?\\s{0,3}(?:dot|d0t|\\.)\\s{0,3}(?:\\]|\\))?\\s{0,3}(?:${TLDS})\\b`,
  "i",
);

const IP_ADDRESS = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/;

/** An `@name`, which is how a handle is written on every platform there is. */
const AT_HANDLE = /(?:^|[\s(])@[a-z0-9._-]{3,30}\b/i;

const STREET = new RegExp(
  "\\b\\d{1,5}\\s{1,2}[a-z]{2,20}(?:\\s{1,2}[a-z]{2,20}){0,3}\\s{1,2}" +
    "(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|court|ct|way|circle|cir|place|pl|terrace|parkway)\\b",
  "i",
);

/** Places a conversation gets moved to. */
const PLATFORMS = new Set([
  "snap", "snapchat", "sc",
  "insta", "instagram", "ig",
  "tiktok", "tt",
  "discord", "disc", "dc",
  "telegram", "tg",
  "kik", "whatsapp", "wa", "signal", "wickr", "session",
  "roblox", "xbox", "psn", "steam", "twitch",
  "twitter", "reddit", "facebook", "fb", "messenger",
]);

/** The words that turn naming a platform into arranging to meet on it. */
const INVITATIONS = new Set([
  "add", "adds", "added", "dm", "dms", "pm", "message", "msg", "text",
  "follow", "friend", "hit", "join", "my", "im", "whats", "wats",
  "contact", "reach", "find",
]);

/**
 * A phone number, counted rather than matched.
 *
 * A run of digits with the punctuation people put in phone numbers, seven to
 * fifteen digits long. Seven is a local number and fifteen is the longest one
 * the international standard allows; below seven is a year or a score and above
 * fifteen is not a number anybody can dial.
 */
function hasPhoneNumber(clean: string): boolean {
  let digits = 0;
  let separatorRun = 0;

  const flush = (): boolean => {
    const found = digits >= 7 && digits <= 15;
    digits = 0;
    separatorRun = 0;
    return found;
  };

  for (const character of clean) {
    if (character >= "0" && character <= "9") {
      digits += 1;
      separatorRun = 0;
      continue;
    }
    if ("()-. +".includes(character)) {
      // Before the first digit this is just the sentence the number is in, and
      // it must not spend the run's allowance — the space in `call me on 555`
      // is not part of the number.
      if (digits === 0) continue;
      separatorRun += 1;
      // Up to two in a row is punctuation inside the number: `) ` in
      // `(555) 123-4567`. Three is the number having ended a while ago.
      if (separatorRun <= 2) continue;
    }
    if (flush()) return true;
  }
  return flush();
}

/**
 * The known cost of the above: `123 456 789` is nine digits in a punctuated run
 * and is read as a phone number, even when it was three scores. That is the
 * trade taken deliberately — the refusal costs somebody one reworded sentence,
 * and the miss costs a thirteen-year-old their phone number in a room of
 * strangers. It is not close.
 */

const DIGIT_WORDS = new Set([
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight",
  "nine", "oh", "o", "nought", "double", "triple",
]);

/** The same number, spelled, which is the first thing anybody tries. */
function hasSpelledNumber(tokens: string[]): boolean {
  let run = 0;
  for (const token of tokens) {
    if (DIGIT_WORDS.has(token)) {
      run += 1;
      if (run >= 7) return true;
    } else {
      run = 0;
    }
  }
  return false;
}

/**
 * A platform named close enough to an invitation to be one.
 *
 * `i play roblox` names a platform and arranges nothing. `add me on roblox`
 * names the same platform three words from `add`, and that is the difference
 * this looks for. Four tokens of slack in either direction covers the ways
 * people actually write it without reaching across a sentence boundary.
 */
function hasPlatformInvitation(tokens: string[]): boolean {
  for (let index = 0; index < tokens.length; index += 1) {
    if (!PLATFORMS.has(tokens[index])) continue;
    const from = Math.max(0, index - 4);
    const to = Math.min(tokens.length, index + 5);
    for (let nearby = from; nearby < to; nearby += 1) {
      if (nearby !== index && INVITATIONS.has(tokens[nearby])) return true;
    }
  }
  return false;
}

/**
 * Whether a link points somewhere that has been allowed.
 *
 * Only consulted when `ALLOWED_LINK_HOSTS` has anything in it, which by default
 * it does not, so by default every link is refused and this never runs.
 */
function linkIsAllowed(clean: string): boolean {
  if (ALLOWED_LINK_HOSTS.size === 0) return false;
  for (const host of ALLOWED_LINK_HOSTS) {
    if (clean.includes(host)) return true;
  }
  return false;
}

/**
 * Everything in a message that would take the conversation somewhere else.
 *
 * Runs against the cleaned text and the folded tokens — the cleaned text
 * because a phone number stops being one once its digits have been folded to
 * letters, and the tokens because a platform name should still be found when it
 * was written with a Cyrillic `а` in it.
 */
export function findPatterns(clean: string, tokens: string[]): PatternHit[] {
  const hits: PatternHit[] = [];
  const lowered = clean.toLowerCase();

  if (EMAIL.test(lowered)) hits.push({ rule: "email", category: "contact" });

  if (!linkIsAllowed(lowered)) {
    if (SCHEME.test(lowered) || BARE_DOMAIN.test(lowered)) {
      hits.push({ rule: "link", category: "link" });
    } else if (OBFUSCATED_DOMAIN.test(lowered)) {
      hits.push({ rule: "link-obfuscated", category: "link" });
    }
  }

  if (IP_ADDRESS.test(lowered)) hits.push({ rule: "ip", category: "location" });
  if (STREET.test(lowered)) hits.push({ rule: "address", category: "location" });

  if (hasPhoneNumber(lowered) || hasSpelledNumber(tokens)) {
    hits.push({ rule: "phone", category: "contact" });
  }

  if (AT_HANDLE.test(clean) || hasPlatformInvitation(tokens)) {
    hits.push({ rule: "handle", category: "contact" });
  }

  return hits;
}
