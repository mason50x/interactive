import { accents, accentVariablesFor, DEFAULT_ACCENT } from "@/lib/accent";
import { LEARN_PATH_PREFIX } from "@/lib/learn";
import { PREFERENCES_STORAGE_KEY } from "@/lib/preferences-cache";
import { TAB_MASK_SCRIPT_CONSTANTS } from "@/lib/tab-mask";

/**
 * The accent and the tab mask, on the document before the first paint.
 *
 * This is the same trick `themeScript` plays and it is here for the same
 * reason: the settings arrive over a Convex subscription that cannot open
 * until Clerk has a token, which is hundreds of milliseconds after the page is
 * already on screen. A component cannot close that gap — React has no storage
 * to read on the server — so every refresh would paint the app blue and then
 * repaint it violet once the query landed, and every refresh would spend that
 * same window with the app's real name in the tab strip. The second of those
 * is the one that cannot be taken back: an accent that arrives late is a
 * flicker, and a title that arrives late has already been read.
 *
 * One script and one `JSON.parse` for both, because they are one cached row and
 * splitting them would only mean two `try` blocks racing the same paint. An
 * unknown accent does not stop the mask from being applied, and vice versa —
 * they are independent settings that happen to travel together.
 *
 * Neither half is written out a second time in any way that can drift.
 * `accentVariablesFor` is called once here with a placeholder where the hex
 * goes, and the script swaps the chosen colour in; the mask's attribute names,
 * selector and table come from `TAB_MASK_SCRIPT_CONSTANTS`. What is genuinely
 * duplicated is the shape of the mask's DOM calls, which is the same bargain
 * `themeScript` strikes with `applyTheme` and for the same reason — a
 * serialised function would carry names a bundler has already renamed.
 *
 * `PreferencesProvider` re-applies both on mount and corrects them if the cache
 * was stale, so the two can only ever differ for the length of one query.
 *
 * The default accent is deliberately absent from the table: the stylesheet
 * already says blue, so there is nothing for the script to do — which also
 * means a browser with no cache does exactly nothing, which is the right
 * answer for a first visit. `none` is absent from the mask table for the same
 * reason.
 *
 * `/learn` is skipped from inside the script rather than by mounting it
 * somewhere that shell does not reach. It has to run in the root layout — the
 * only layout a client-side navigation never re-renders, and a `<script>` React
 * creates on the client is a tag that never executes — and the root layout is
 * shared with the activity shell, which is painted in nothing of ours and only
 * ever seen inside a frame, where it has no tab of its own to mask.
 */
const ACCENT_PLACEHOLDER = "__accent__";

const { maskLinkAttribute, relStashAttribute, titleStashAttribute, parkedRel } =
  TAB_MASK_SCRIPT_CONSTANTS;

export const preferencesScript = `(function(){try{var p=location.pathname;if(p===${JSON.stringify(
  LEARN_PATH_PREFIX,
)}||p.indexOf(${JSON.stringify(
  `${LEARN_PATH_PREFIX}/`,
)})===0)return;var r=localStorage.getItem(${JSON.stringify(
  PREFERENCES_STORAGE_KEY,
)});if(!r)return;var s=JSON.parse(r),d=document.documentElement,h=document.head;var c=${JSON.stringify(
  Object.fromEntries(
    accents
      .filter((accent) => accent.id !== DEFAULT_ACCENT)
      .map((accent) => [accent.id, accent.color]),
  ),
)}[s.accent];if(c){var v=${JSON.stringify(
  accentVariablesFor(ACCENT_PLACEHOLDER),
)};for(var i=0;i<v.length;i++){d.style.setProperty(v[i][0],v[i][1].split(${JSON.stringify(
  ACCENT_PLACEHOLDER,
)}).join(c))}}var m=${JSON.stringify(
  TAB_MASK_SCRIPT_CONSTANTS.table,
)}[s.tabMask];if(m){if(document.title)d.setAttribute(${JSON.stringify(
  titleStashAttribute,
)},document.title);document.title=m[0];var k=h.querySelectorAll(${JSON.stringify(
  TAB_MASK_SCRIPT_CONSTANTS.realIconSelector,
)});for(var j=0;j<k.length;j++){k[j].setAttribute(${JSON.stringify(
  relStashAttribute,
)},k[j].getAttribute("rel")||"icon");k[j].setAttribute("rel",${JSON.stringify(
  parkedRel,
)})}var l=document.createElement("link");l.setAttribute(${JSON.stringify(
  maskLinkAttribute,
)},"");l.setAttribute("rel","icon");l.setAttribute("type","image/png");l.setAttribute("href",m[1]);h.appendChild(l)}}catch(_){}})()`;
