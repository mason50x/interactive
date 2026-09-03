/**
 * What the tab says this page is.
 *
 * The panic key in `src/lib/preferences.ts` answers the moment someone is
 * already standing behind you. This answers the hour before that: the strip
 * along the top of the browser is the part of a screen a passer-by reads
 * without meaning to, and a tab that says "Interactive Learning" is the one
 * thing about this app that cannot be turned down. A mask replaces the title
 * and the favicon with a site nobody looks at twice, so the tab is boring at
 * rest rather than only after a keystroke.
 *
 * The marks are the ones the panic key already ships — `public/brand/escape/`,
 * each site's own favicon, taken once and served from our origin. The two
 * features want the same destinations for the same reason, and a second copy
 * of Google's G would only be a second thing to keep in step. `panicPresets`
 * is the list that governs which files exist; a mask added here without one is
 * a broken image in the tab strip, which is worse than no disguise at all.
 *
 * This is a disguise at a glance and nothing more. The URL in the address bar
 * is still ours, the history entry is still ours, and anyone who clicks the
 * tab sees the app. It is worth being plain about that: the failure mode of a
 * privacy feature is someone trusting it further than it goes.
 *
 * Three things make it stick. The title and the icon links are *managed by
 * React* — every route under `/dashboard` sets its own title, so a navigation
 * overwrites whatever we wrote — which is why `watchTabMask` puts a
 * `MutationObserver` on the head and writes it back rather than setting it once
 * on mount. The browser keeps its own list of the page's icons and rebuilds it
 * only when an icon link is *processed*, never when one stops being an icon —
 * which is why `applyTabMask` re-inserts our link after every pass that parked
 * one of React's; see `reannounce`. And the first paint happens before Convex
 * has said who is signed in, which is why there is an inlined twin of
 * `applyTabMask` in `preferencesScript`, reading the same `localStorage` cache
 * the accent does. That twin runs before Next has streamed the route's
 * metadata into the document, so the icon links it looks for usually are not
 * there yet; the observer is what parks them when they land.
 */

/**
 * Five places a tab could plausibly be, and the title each one wears.
 *
 * The titles are copied off the real pages rather than invented: the disguise
 * is only as good as its most-read half, and "Google Docs" in a tab where the
 * real thing says "Untitled document - Google Docs" is the tell. The hyphens
 * and pipes are the separators those sites actually use, for the same reason.
 *
 * `none` is first and has neither, exactly as "Blank page" leads `panicPresets`
 * with no icon: the absence of a choice is a choice you should be able to make
 * from the same grid as the others.
 */
export const tabMasks = [
  { id: "none", label: "Off" },
  {
    id: "docs",
    label: "Google Docs",
    title: "Untitled document - Google Docs",
    icon: "/brand/escape/docs.png",
  },
  {
    id: "classroom",
    label: "Classroom",
    title: "Classes",
    icon: "/brand/escape/classroom.png",
  },
  {
    id: "gmail",
    label: "Gmail",
    title: "Inbox",
    icon: "/brand/escape/gmail.png",
  },
  {
    id: "khan",
    label: "Khan Academy",
    title: "Dashboard | Khan Academy",
    icon: "/brand/escape/khan.png",
  },
  {
    id: "google",
    label: "Google",
    title: "Google",
    icon: "/brand/escape/google.png",
  },
] as const;

export type TabMaskId = (typeof tabMasks)[number]["id"];

/** The id that means "leave the tab alone", and the default. */
export const NO_TAB_MASK: TabMaskId = "none";

export function isTabMaskId(value: unknown): value is TabMaskId {
  return tabMasks.some((mask) => mask.id === value);
}

/** What a mask actually puts on the document. */
export type TabMaskAssets = { title: string; icon: string };

/** `null` for `none`, and for an id written by a client that knew masks this
 *  one does not — same fallback as an unknown accent. */
export function tabMaskAssets(id: string): TabMaskAssets | null {
  const mask = tabMasks.find((candidate) => candidate.id === id);
  return mask && "title" in mask
    ? { title: mask.title, icon: mask.icon }
    : null;
}

/** Whether a string is one of ours, which is how `applyTabMask` avoids
 *  mistaking the mask it wrote a moment ago for the route's real title. */
function isMaskTitle(title: string): boolean {
  return tabMasks.some((mask) => "title" in mask && mask.title === title);
}

/* -------------------------------------------------------------------------- */
/*  The document                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Nothing here is destructive, and that is the whole design.
 *
 * The obvious implementation removes the real `<link rel="icon">` tags and puts
 * one of ours in their place, and it is wrong in the one direction that
 * matters: turning a mask *off* then has nothing to put back, because the tags
 * belonged to React's head and React has no reason to render them again until
 * the next navigation. So the real links stay in the document exactly as they
 * are and only their `rel` is parked somewhere inert — the browser stops
 * treating them as icons, and restoring is one attribute back. Same bargain for
 * the title, parked on `<html>`.
 */
const MASK_LINK_ATTRIBUTE = "data-tab-mask";
const REL_STASH_ATTRIBUTE = "data-tab-mask-rel";
const TITLE_STASH_ATTRIBUTE = "data-tab-mask-title";

/** A `rel` no browser has an opinion about. */
const PARKED_REL = "x-tab-mask";

/** Every icon link but ours. `apple-touch-icon` is in here because a masked
 *  tab saved to a home screen should be masked there too. */
const REAL_ICON_SELECTOR = `link[rel~="icon"]:not([${MASK_LINK_ATTRIBUTE}]),link[rel="apple-touch-icon"]:not([${MASK_LINK_ATTRIBUTE}])`;

/**
 * The mask, on the document. Idempotent by construction: every write is behind
 * a check that the value is not already there — and the one deliberate re-write,
 * `reannounce`, behind a check that this pass changed something — which is
 * what keeps `watchTabMask` from observing its own work and looping forever.
 */
export function applyTabMask(mask: TabMaskAssets | null): void {
  const root = document.documentElement;
  const head = document.head;

  if (!mask) {
    const parked = root.getAttribute(TITLE_STASH_ATTRIBUTE);
    if (parked !== null) {
      root.removeAttribute(TITLE_STASH_ATTRIBUTE);
      document.title = parked;
    }

    // Ours goes first, the real ones come back second — see `reannounce`.
    // A browser rebuilds its idea of the page's icons only when a link that
    // *is* an icon is processed, so each `rel` restored below is one such
    // moment, and every one of them must already find ours gone.
    head.querySelector(`link[${MASK_LINK_ATTRIBUTE}]`)?.remove();

    for (const link of head.querySelectorAll(`link[${REL_STASH_ATTRIBUTE}]`)) {
      link.setAttribute(
        "rel",
        link.getAttribute(REL_STASH_ATTRIBUTE) || "icon",
      );
      link.removeAttribute(REL_STASH_ATTRIBUTE);
    }
    return;
  }

  if (document.title !== mask.title) {
    // Only a title React wrote is worth parking, and only once it exists.
    // Switching from one mask straight to another would otherwise record
    // "Untitled document - Google Docs" as the page's real name, and turning
    // the mask off later would restore it; parking the empty string — which is
    // what `document.title` reads as while streamed metadata is still in
    // flight — would turn the mask off into a blank tab. Both self-correct on
    // the next pass, because the real title arriving is itself a mutation.
    if (document.title && !isMaskTitle(document.title)) {
      root.setAttribute(TITLE_STASH_ATTRIBUTE, document.title);
    }
    document.title = mask.title;
  }

  let parkedAny = false;
  for (const link of head.querySelectorAll(REAL_ICON_SELECTOR)) {
    link.setAttribute(REL_STASH_ATTRIBUTE, link.getAttribute("rel") || "icon");
    link.setAttribute("rel", PARKED_REL);
    parkedAny = true;
  }

  let link = head.querySelector<HTMLLinkElement>(
    `link[${MASK_LINK_ATTRIBUTE}]`,
  );
  if (!link) {
    link = document.createElement("link");
    link.setAttribute(MASK_LINK_ATTRIBUTE, "");
    link.setAttribute("rel", "icon");
    link.setAttribute("type", "image/png");
    // `href` before the append, so the browser processes the link once, with
    // an icon to fetch, rather than once empty and once more when it lands.
    link.setAttribute("href", mask.icon);
    head.appendChild(link);
    return;
  }
  if (link.getAttribute("href") !== mask.icon) {
    link.setAttribute("href", mask.icon);
  } else if (parkedAny) {
    reannounce(link, head);
  }
}

/**
 * Why parking a link is not enough on its own, and what is.
 *
 * Parking works on the document — the parked links are no longer icons, and
 * ours is the only one left — but the tab strip is not drawn from the
 * document. The browser keeps its own list of the page's icons, and it
 * rebuilds that list only when a link that *has* an icon `rel` is processed:
 * one being inserted, or its `href` changing, or its `rel` changing *to* an
 * icon. Changing a `rel` *away* from one is silent. So after a navigation the
 * sequence was: React appends its `<link rel="icon">` for the route, the
 * browser rebuilds its list with the app's own favicon in it and picks that,
 * then we park the link — and nothing tells the browser its list is stale.
 * The title never had this problem because a title has no list; the tab reads
 * it straight off the document, which is why the name held and the icon
 * did not.
 *
 * So whenever a pass has parked something, ours is taken out and put back.
 * Moving a connected link is a removal and an insertion, and the insertion is
 * the announcement: the browser rebuilds its list, finds the parked links are
 * not icons any more, and is left with ours. It also lands ours last in the
 * head, which is where the browsers that break ties by document order look.
 *
 * Only when a pass has parked something, and never on a pass that found the
 * document already right: the move is itself a mutation, the observer sees
 * it, and the pass that follows must find nothing to do or the two would
 * chase each other forever.
 */
function reannounce(link: HTMLLinkElement, head: HTMLHeadElement): void {
  link.remove();
  head.appendChild(link);
}

/**
 * Applies the mask and keeps it applied. Returns the unsubscribe, for an
 * effect's cleanup.
 *
 * A mask set once on mount lasts until the first click. Every route under
 * `/dashboard` declares its own `metadata.title`, so a client-side navigation
 * has React replace the `<title>` and re-render the icon links from the route's
 * payload — and the tab goes back to saying "Home — Dashboard" halfway through
 * a lesson, which is the exact moment the feature was for.
 *
 * So: watch the head and write it back. The observer sees its own writes, which
 * is fine and deliberate — `applyTabMask` skips a write whose value is already
 * in place, so a callback triggered by our own mutation finds nothing to do and
 * the chain stops one round in.
 *
 * `pageshow` covers the back-forward cache, which restores a page's DOM without
 * re-running anything; `visibilitychange` is the cheap catch-all for a tab
 * coming back from wherever the browser put it while it was hidden.
 */
export function watchTabMask(mask: TabMaskAssets | null): () => void {
  const reapply = () => applyTabMask(mask);

  reapply();

  const observer = new MutationObserver(reapply);
  observer.observe(document.head, {
    childList: true,
    subtree: true,
    characterData: true,
    attributeFilter: ["rel", "href"],
  });

  window.addEventListener("pageshow", reapply);
  document.addEventListener("visibilitychange", reapply);

  return () => {
    observer.disconnect();
    window.removeEventListener("pageshow", reapply);
    document.removeEventListener("visibilitychange", reapply);
  };
}

/* -------------------------------------------------------------------------- */
/*  The inlined twin                                                           */
/* -------------------------------------------------------------------------- */

/**
 * What `preferencesScript` needs to do the same work before React exists.
 *
 * The script is hand-written — the same arrangement `themeScript` has with
 * `applyTheme`, and for the same reason: a function serialised with
 * `toString()` would carry references to module-scope constants a bundler has
 * already renamed. What is shared is everything that could silently drift: the
 * attribute names, the parked `rel`, the selector, and the table itself. The
 * only thing written twice is the shape of the DOM calls.
 */
export const TAB_MASK_SCRIPT_CONSTANTS = {
  maskLinkAttribute: MASK_LINK_ATTRIBUTE,
  relStashAttribute: REL_STASH_ATTRIBUTE,
  titleStashAttribute: TITLE_STASH_ATTRIBUTE,
  parkedRel: PARKED_REL,
  realIconSelector: REAL_ICON_SELECTOR,
  /** `id -> [title, icon]`, the two strings the script actually uses. */
  table: Object.fromEntries(
    tabMasks
      .filter((mask) => "title" in mask)
      .map((mask) => [
        mask.id,
        [
          (mask as Extract<(typeof tabMasks)[number], { title: string }>).title,
          (mask as Extract<(typeof tabMasks)[number], { icon: string }>).icon,
        ],
      ]),
  ) as Record<string, [string, string]>,
} as const;
