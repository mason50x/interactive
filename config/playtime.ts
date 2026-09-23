/** All accounts share this policy. Reset uses the school's Central timezone. */
export const PLAYTIME_SECONDS = 20 * 60;
export const CHAT_REWARD_SECONDS = 2 * 60;
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
  return date + (7 * 60 + 35) * 60_000 - offset;
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
  "Write at least 60 characters and 12 words, including 8 different words. Use your own detailed message; numbers, repeated text, and copies do not count.";

/** Bounded Unicode patterns, plus diversity checks: no nested regex backtracking.
 * These are anti-spam heuristics, not proof of meaning. Normalization ignores
 * casing, punctuation, numeric suffixes and invisible formatting characters. */
export function rewardText(body: string): string | null {
  if (body.length > 2000) return null;
  const text = body
    .normalize("NFKC")
    .replace(/\p{Cf}/gu, "")
    .toLowerCase();
  if (/(?:https?:\/\/|www\.)\S+|@\S+|([\p{L}\p{N}])\1{3,}/u.test(text))
    return null;
  const words = text.match(/\p{L}[\p{L}\p{M}]*(?:['’][\p{L}\p{M}]+)*/gu) ?? [];
  const unique = new Set(words);
  if (words.length < 12 || unique.size < 8 || unique.size / words.length < 0.5)
    return null;
  const normalized = words.join(" ");
  if (normalized.length < 60 || words.join("").length / text.length < 0.65)
    return null;
  if (words.filter((word) => word.length >= 4).length < 4) return null;
  return normalized;
}

export function similarReward(a: string, b: string) {
  const left = new Set(a.split(" "));
  const right = new Set(b.split(" "));
  const common = [...left].filter((word) => right.has(word)).length;
  return common / Math.max(left.size, right.size) >= 0.8;
}

/** Catalogue roots and players are unavailable after exhaustion; chat is not. */
export function isPlaytimeRoute(pathname: string) {
  return /^\/(activities|entertainment|learning-simulator|experience)(?:\/|$)/.test(
    pathname,
  );
}
