/** All accounts share this policy. Reset uses the school's Central timezone. */
export const PLAYTIME_SECONDS = 30 * 60;
export const CHAT_REWARD_SECONDS = 30;
export const PLAYTIME_TIMEZONE = "America/Chicago";
const DAY = 86_400_000;
const calendar = new Intl.DateTimeFormat("en-US", {
  timeZone: PLAYTIME_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
function parts(at: number) {
  return Object.fromEntries(
    calendar.formatToParts(at).map((p) => [p.type, Number(p.value)]),
  );
}
function boundary(date: number) {
  // Noon UTC is on the same Central calendar date and after any DST switch.
  const p = parts(date + 12 * 3_600_000);
  const offset =
    Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) -
    (date + 12 * 3_600_000);
  return date + (7 * 60 + 30) * 60_000 - offset;
}
export function playtimeDay(now: number) {
  const p = parts(now);
  const date = Date.UTC(p.year, p.month - 1, p.day);
  const today = boundary(date);
  return now < today
    ? { day: boundary(date - DAY), resetsAt: today }
    : { day: today, resetsAt: boundary(date + DAY) };
}

export const REWARD_REQUIREMENTS =
  "Only messages in Everyone, Announcements and Admins count, not direct messages, group chats or messages to the bot. Real short replies like “hi” or “thanks” count. A single letter, punctuation, numbers alone, repeated filler, and a third similar message in a row do not earn time.";

/** Normal conversation counts, even a single short word. Strip links/mentions
 * before comparing so changing a tag or numeric suffix cannot farm credit.
 * The normal chat moderation pipeline still runs before this reward policy. */
export function rewardText(body: string): string | null {
  if (body.length > 2000) return null;
  const text = body
    .normalize("NFKC")
    .replace(/\p{Cf}/gu, "")
    .toLowerCase()
    .replace(/(?:https?:\/\/|www\.)\S+|@\S+/gu, " ");
  const words = text.match(/\p{L}[\p{L}\p{M}]*(?:['’][\p{L}\p{M}]+)*/gu) ?? [];
  const letters = words.join("");
  if (!words.some(word => [...word].length >= 2) || /^(\p{L})\1+$/u.test(letters)) return null;
  // Reject repeated filler, without imposing essay-style vocabulary requirements.
  if (words.length >= 2 && new Set(words).size === 1) return null;
  return words.join(" ");
}

export function similarReward(a: string, b: string) {
  if (a === b) return true;
  const aWords = a.split(" ");
  const bWords = b.split(" ");
  // Short everyday replies naturally overlap; only longer text needs fuzzy matching.
  if (aWords.length < 8 || bWords.length < 8) return false;
  const left = new Set(aWords);
  const right = new Set(bWords);
  const common = [...left].filter((word) => right.has(word)).length;
  return common / Math.max(left.size, right.size) >= 0.8;
}

/** Catalogue roots and players are unavailable after exhaustion; chat is not. */
export function isPlaytimeRoute(pathname: string) {
  return /^\/(activities|tv|emulate|browse)(?:\/|$)/.test(
    pathname,
  );
}
