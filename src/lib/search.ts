import {
  ChatBubbleLeftRightIcon,
  Cog6ToothIcon,
  ComputerDesktopIcon,
  KeyIcon,
  MoonIcon,
  SparklesIcon,
  SunIcon,
  SwatchIcon,
  UserCircleIcon,
} from "@heroicons/react/24/solid";
import type { Icon } from "@/lib/icons";
import { navItems } from "@/lib/nav";

/**
 * Everything the rail's search can find, and how it decides what matches.
 *
 * The app has four kinds of thing worth looking for and they live nowhere near
 * each other: the activity catalogue is a generated JSON file behind a
 * `server-only` import, chat messages are rows in Convex behind a full-text
 * index and a permission check, the settings are React controls inside a
 * sheet, and the destinations are a list in `src/lib/nav.ts`. None of them can
 * be put in one table — a search that needed that would be a search that
 * needed a crawler and a copy of everything.
 *
 * So they are not indexed together. Each source answers for itself, in the
 * place it already lives, and this module is the small amount that has to be
 * shared: what a result looks like, how a query is scored against a piece of
 * text, and the two sources that are static enough to simply be written down.
 * `RailSearch` is what asks all four and interleaves the answers.
 *
 * The two written down here are the ones with no data behind them at all. A
 * setting is a control in `SettingsSheet`, not a record; the only way to find
 * "the drifting web behind the sidebar" by typing "background" is for someone
 * to have said so, which is what `keywords` is for. When a control is added
 * there, its entry is added here — nothing derives one from the other, and
 * nothing can, because the searchable words for a switch are not in the
 * switch.
 */

/**
 * Which source a result came from.
 *
 * `account` is one entry rather than a source with a list behind it, and it
 * gets its own name anyway because the app already draws that line: the
 * account menu keeps "Account" and "Settings" as separate rows on purpose —
 * one is about you and the other is about the site — and a search that filed
 * your password under the site's appearance options would be undoing a
 * distinction somebody made deliberately.
 */
export type HitSource =
  | "page"
  | "activity"
  | "setting"
  | "account"
  | "message";

/**
 * One thing you can find, in the shape the list draws.
 *
 * `href` and `action` are alternatives: a result either goes somewhere or does
 * something, and there is nothing in this app that sensibly does both. The
 * action is a name rather than a function because these entries are module
 * constants — a closure here would have to have captured the router, the theme
 * setter and the settings sheet at import time, none of which exist then. See
 * `runAction` in `RailSearch`, which is where the names become behaviour.
 */
export type Hit = {
  /** Unique across the whole result list; also the option's DOM id. */
  id: string;
  source: HitSource;
  title: string;
  /** The second line. Says what the thing is, or shows what matched. */
  detail?: string;
  icon: Icon;
  /** A tint for the icon, when the source has one worth carrying. */
  tint?: string;
  href?: string;
  action?: SearchAction;
};

/** The things a result can do that are not navigation. */
export type SearchAction =
  | "settings"
  | "account"
  | "theme:system"
  | "theme:light"
  | "theme:dark";

/**
 * A static entry before it is scored — a `Hit` plus the words that should find
 * it but do not appear in it.
 */
type Entry = Omit<Hit, "id"> & { keywords?: readonly string[] };

/* -------------------------------------------------------------------------- */

/**
 * Case, accents and punctuation, all flattened.
 *
 * `NFD` then stripping the combining marks is what makes "pokemon" find
 * "Pokémon". Everything that is not a letter or a digit becomes a space, so
 * "co-op" and "co op" are the same query and a title's punctuation cannot hide
 * it from a search that did not reproduce it.
 */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * How well one piece of text answers a query, or `null` for not at all.
 *
 * Four tiers, and the gaps between them are wide enough that no amount of
 * matching in a weaker tier outranks a hit in a stronger one. The order is the
 * order a person expects: the thing you typed the whole name of, then the
 * thing your letters start, then the thing a *word* of your letters start —
 * which is what makes "sol" find "Klondike Solitaire" — and last the thing
 * that merely contains them somewhere.
 *
 * Ties are broken by length. Of two titles that both start with what you
 * typed, the shorter one is more of what you typed.
 */
export function score(text: string, needle: string): number | null {
  return scoreFolded(fold(text), needle);
}

/**
 * The same scoring, against text that has already been through `fold`.
 *
 * This is the one the catalogue uses. There are 318 activities and four texts
 * worth matching on each, so folding them on every keystroke would be a
 * thousand string allocations per letter for an answer that never changes —
 * `RailSearch` folds the catalogue once, when it arrives, and compares against
 * that. Everything else has few enough texts that `score` above is simpler and
 * costs nothing.
 */
export function scoreFolded(haystack: string, needle: string): number | null {
  if (haystack === "") return null;

  if (haystack === needle) return 1000;

  const at = haystack.indexOf(needle);
  if (at < 0) return null;

  const tier =
    at === 0
      ? 800
      : // A space before it means the match starts a word. `fold` has already
        // turned every separator into one, so this is the only test needed.
        haystack[at - 1] === " "
        ? 600
        : 400;

  return tier - Math.min(haystack.length, 200);
}

/**
 * The best any of an entry's texts can do, with keywords held below titles.
 *
 * A keyword is somebody's guess at what you might call this thing, and a title
 * is what it is actually called. An entry found by its keyword should never
 * outrank one found by its name, so the keyword tiers are shifted down past
 * the bottom of the title tiers rather than merely reduced.
 */
export function scoreEntry(
  needle: string,
  title: string,
  keywords: readonly string[] = [],
): number | null {
  const best = score(title, needle);
  if (best !== null) return best;

  let found: number | null = null;
  for (const keyword of keywords) {
    const value = score(keyword, needle);
    if (value !== null && (found === null || value > found)) found = value;
  }

  return found === null ? null : found - 1000;
}

/** The query as everything here compares against it. Empty means "no query". */
export function needleOf(query: string): string {
  return fold(query);
}

/* -------------------------------------------------------------------------- */

/**
 * The destinations, as results.
 *
 * Derived from `navItems` rather than written again, so a row added to the
 * rail is findable the same day it appears — the rail and the search cannot
 * disagree about where you can go. The solid cut, because a result list has no
 * unselected state to pair against.
 */
const pages: readonly Entry[] = navItems.map((item) => ({
  source: "page",
  title: item.label,
  detail: item.href,
  icon: item.icon.solid,
  href: item.href,
  keywords:
    item.href === "/dashboard"
      ? ["overview", "dashboard", "start"]
      : item.href.endsWith("/chat")
        ? ["messages", "dms", "groups", "friends", "everyone"]
        : ["games", "catalogue", "catalog", "play", "browse"],
}));

/**
 * The settings, as results.
 *
 * Every one of these opens the sheet rather than changing anything, with the
 * exception of the three themes — those are a single value with three possible
 * states, so a result that says "Dark" and then makes you find a menu to pick
 * it is a worse answer than one that just does it. Everything else is a
 * control with shape to it: a palette, a key recorder, a URL. Those want the
 * panel they were designed in.
 */
/**
 * The account, as a result.
 *
 * Opens the hosted account UI — profile, email addresses, password, connected
 * devices — which is the same thing the "Account" row in the menu opens and is
 * not ours to rebuild. None of that is a page in this app, so this is an
 * action rather than an `href`.
 *
 * The keywords are what make it findable, because the one word on the row is
 * not a word anybody types. People search for the thing they want to change:
 * "password", "email", "sign out". Naming the vendor is not among them — this
 * is your account, and whose software renders the panel is not something the
 * search should be teaching anyone.
 */
const account: readonly Entry[] = [
  {
    source: "account",
    title: "User account",
    detail: "Profile, email, password, and devices",
    icon: UserCircleIcon,
    action: "account",
    // No "sign out". This row opens the account panel, and a result that
    // answers that search by showing you a different screen is worse than one
    // that finds nothing — signing out is deliberately left where it is, on a
    // row in the menu you have to travel to, rather than one Enter away from a
    // box you type into by reflex.
    keywords: [
      "profile",
      "email",
      "password",
      "security",
      "devices",
      "name",
      "avatar",
      "photo",
    ],
  },
];

const settings: readonly Entry[] = [
  {
    source: "setting",
    title: "Settings",
    detail: "Accent, the constellation, and the panic key",
    icon: Cog6ToothIcon,
    action: "settings",
    keywords: ["preferences", "options", "config", "account"],
  },
  {
    source: "setting",
    title: "Accent",
    detail: "Used for buttons, links, and anything selected",
    icon: SwatchIcon,
    action: "settings",
    keywords: ["colour", "color", "highlight", "brand", "palette"],
  },
  {
    source: "setting",
    title: "Constellation",
    detail: "The drifting web behind the header",
    icon: SparklesIcon,
    action: "settings",
    keywords: ["background", "animation", "motion", "stars", "header", "mesh"],
  },
  {
    source: "setting",
    title: "Panic key",
    detail: "One keystroke and this tab becomes something else",
    icon: KeyIcon,
    action: "settings",
    keywords: ["boss key", "escape", "hide", "quick exit", "shortcut", "blank"],
  },
  {
    source: "setting",
    title: "System theme",
    detail: "Follow whatever this device is set to",
    icon: ComputerDesktopIcon,
    action: "theme:system",
    keywords: ["appearance", "auto", "device"],
  },
  {
    source: "setting",
    title: "Light theme",
    detail: "Switch this device to the light palette",
    icon: SunIcon,
    action: "theme:light",
    keywords: ["appearance", "day", "bright", "white"],
  },
  {
    source: "setting",
    title: "Dark theme",
    detail: "Switch this device to the dark palette",
    icon: MoonIcon,
    action: "theme:dark",
    keywords: ["appearance", "night", "dark mode", "black"],
  },
];

/**
 * Everything static, in one list, scored in one pass.
 *
 * Pages before settings on a tie, which is the order they are drawn in and the
 * order they are wanted in: "chat" is far more often a place you are trying to
 * get to than a thing you are trying to configure.
 */
const entries: readonly Entry[] = [...pages, ...account, ...settings];

/** Chat's mark, for the message results. Held here so `RailSearch` does not
 *  import a second icon set to draw one row. */
export const messageIcon: Icon = ChatBubbleLeftRightIcon;

/** Lowercase, and nothing in it that cannot be an html id. See `searchEntries`. */
function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9/]+/g, "-");
}

/**
 * The static half of the search: destinations and settings, best first.
 *
 * `limit` is per source rather than overall — see `RailSearch`, which caps
 * each section so that a query matching nine settings cannot push the one
 * activity you were after off the bottom of the panel.
 */
export function searchEntries(needle: string, limit: number): Hit[] {
  if (needle === "") return [];

  const scored: { hit: Hit; rank: number }[] = [];

  for (const entry of entries) {
    const rank = scoreEntry(needle, entry.title, entry.keywords);
    if (rank === null) continue;
    scored.push({
      hit: {
        // Keyed on the title and not on the action. Four of the settings
        // below open the same sheet, so an id built from what a result *does*
        // gave all four of them `setting:settings` — one React key for four
        // rows, and one row's hover moving the selection to another's. A
        // destination's href is unique by definition and a setting's title is
        // unique within the list, which is all this has to be.
        //
        // Slugged rather than used raw, because this is also the row's DOM id
        // and the value the combobox points `aria-activedescendant` at. That
        // attribute is a single id reference, so a space in it does not name a
        // narrower element — it names nothing.
        id: `${entry.source}:${slug(entry.href ?? entry.title)}`,
        source: entry.source,
        title: entry.title,
        detail: entry.detail,
        icon: entry.icon,
        href: entry.href,
        action: entry.action,
      },
      rank,
    });
  }

  return scored
    .sort((first, second) => second.rank - first.rank)
    .slice(0, limit)
    .map((entry) => entry.hit);
}
