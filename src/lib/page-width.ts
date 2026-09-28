/**
 * The page's width, for code that has to branch on it rather than style it.
 *
 * The same question the `page-*` variants in `globals.css` ask, in the same
 * units: the width of the shell a signed-in page is laid out in, not the
 * window. In split view those differ, and it is the shell that says how
 * much room the page really has. See `src/lib/workspace.ts`.
 */

/** The `page-*` thresholds, in rem. Kept in step with `globals.css`. */
export const PAGE_BREAKPOINTS = { sm: 34, md: 42, lg: 48, xl: 64, "2xl": 80 };

function shell(): HTMLElement | null {
  return document.querySelector<HTMLElement>('main[data-slot="shell"]');
}

/** The page's width in rem, or the window's where there is no shell. */
export function pageWidthRem(): number {
  const root = parseFloat(getComputedStyle(document.documentElement).fontSize);
  const width = shell()?.clientWidth ?? window.innerWidth;
  return width / (root || 16);
}
