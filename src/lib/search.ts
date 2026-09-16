import {
  ArrowRightStartOnRectangleIcon,
  GlobeAltIcon,
  CpuChipIcon,
  DocumentTextIcon,
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
import { EXPERIENCE_APPS, experienceAppHref } from "@/lib/experience";

/** Searchable destinations, commands, and their matching rules. */
export type HitSource =
  "page" | "experience" | "activity" | "setting" | "account" | "message";

/**
 * One thing you can find, in the shape the list draws.
 *
 * `href` and `action` are alternatives: a result either goes somewhere or does
 * something, and there is nothing in this app that sensibly does both. The
 * action is a name rather than a function because these entries are module
 * constants — a closure here would have to have captured the router, the theme
 * setter and the settings page at import time, none of which exist then. See
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
  experienceId?: string;
  href?: string;
  action?: SearchAction;
};

/** The things a result can do that are not navigation. */
export type SearchAction =
  | "settings"
  | "account"
  | "sign-out"
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
function scoreEntry(
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
    item.href === "/home"
      ? ["overview", "dashboard", "start"]
      : item.href.endsWith("/chat")
        ? ["messages", "dms", "groups", "friends", "everyone"]
        : item.href.endsWith("/experience")
          ? ["browser", "websites", "apps", "streaming", "browse web"]
          : item.href.endsWith("/learning-simulator")
            ? ["emulator", "simulation", "rom", "import", "upload"]
            : ["games", "catalogue", "catalog", "play", "browse"],
}));

const experiences: readonly Entry[] = EXPERIENCE_APPS.map((app) => ({
  source: "experience",
  title: app.label,
  detail: `Experience · ${app.host}`,
  icon: GlobeAltIcon,
  experienceId: app.id,
  href: experienceAppHref(app.id),
  keywords: [
    app.id,
    app.host,
    "experience",
    "website",
    ...(app.id === "youtube" ? ["videos", "watch", "yt"] : []),
  ],
}));

const extraPages: readonly Entry[] = [
  { title: "About", href: "/about", keywords: ["about us", "mission"] },
  {
    title: "Contact",
    href: "/contact",
    keywords: ["help", "support", "feedback"],
  },
  { title: "Privacy policy", href: "/pp", keywords: ["privacy", "data"] },
  {
    title: "Terms of service",
    href: "/tos",
    keywords: ["terms", "legal", "rules"],
  },
  { title: "50x website", href: "/", keywords: ["landing", "pricing"] },
  { title: "Sign in", href: "/auth/sign-in", keywords: ["login", "log in"] },
  {
    title: "Sign up",
    href: "/auth/sign-up",
    keywords: ["register", "create account"],
  },
].map((page) => ({ ...page, source: "page", icon: DocumentTextIcon }));

const features: readonly Entry[] = [
  {
    source: "page",
    title: "HTML simulators",
    detail: "Open the HTML library to import and play",
    href: "/learning-simulator?mode=html",
    icon: CpuChipIcon,
    keywords: ["html", "upload html", "import html", "simulations"],
  },
  {
    source: "page",
    title: "Game Boy",
    detail: "Open the ROM library to import and play",
    href: "/learning-simulator?mode=gb",
    icon: CpuChipIcon,
    keywords: ["gb", "gbc", "rom", "emulator", "upload rom", "import rom"],
  },
  {
    source: "page",
    title: "Request an activity",
    detail: "Suggest a game or activity",
    href: "/activities?request=1",
    icon: SparklesIcon,
    keywords: ["request game", "suggest", "submit activity"],
  },
  {
    source: "page",
    title: "New group",
    detail: "Create a group chat",
    href: "/chat?panel=group",
    icon: ChatBubbleLeftRightIcon,
    keywords: ["create group", "group chat"],
  },
  {
    source: "page",
    title: "Find people",
    detail: "Find accounts and start a conversation in Chat",
    href: "/chat",
    icon: UserCircleIcon,
    keywords: ["users", "friends", "direct message", "dm", "members"],
  },
];

const account: readonly Entry[] = [
  {
    source: "account",
    title: "Sign out",
    detail: "Open sign-out confirmation",
    icon: ArrowRightStartOnRectangleIcon,
    action: "sign-out",
    keywords: ["signout", "logout", "log out", "sign off"],
  },
  {
    source: "account",
    title: "User account",
    detail: "Profile, email, password, and devices",
    icon: UserCircleIcon,
    action: "account",
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
    title: "Tab disguise",
    detail: "Change this tab’s title and icon",
    icon: GlobeAltIcon,
    action: "settings",
    keywords: ["tab mask", "camouflage", "favicon", "disguise"],
  },
  {
    source: "setting",
    title: "Escape destination",
    detail: "Choose where the panic key takes you",
    icon: KeyIcon,
    action: "settings",
    keywords: ["escape to", "panic url", "redirect", "destination"],
  },
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
const entries: readonly Entry[] = [
  ...pages,
  ...extraPages,
  ...features,
  ...experiences,
  ...account,
  ...settings,
];

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
        // below open the same page, so an id built from what a result *does*
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
        tint: entry.tint,
        experienceId: entry.experienceId,
        href: entry.href,
        action: entry.action,
      },
      rank,
    });
  }

  const counts = new Map<HitSource, number>();
  return scored
    .sort((first, second) => second.rank - first.rank)
    .filter(({ hit }) => {
      const count = counts.get(hit.source) ?? 0;
      counts.set(hit.source, count + 1);
      return count < limit;
    })
    .map((entry) => entry.hit);
}
