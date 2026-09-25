"use client";

import { useEffect, useRef } from "react";

/** What reads as clickable. Kept in step with the cursor rules in globals.css. */
const INTERACTIVE = [
  "a[href]",
  "button:not(:disabled)",
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="option"]',
  "summary",
  "label[for]",
  "select",
  ".cursor-pointer",
].join(",");

const ARROW = "M6 5 17 13l-5.5 1-3 5Z";

/**
 * The cursor, drawn by the page so its corners can change.
 *
 * It is the arrow from globals.css, pinned to the mouse on every move — no
 * easing, no trail. Over anything clickable its corners draw in sharp, and
 * soften again on the way out. The native cursor is hidden only where this
 * one stands in for it: over text fields, disabled controls, and zoomable
 * images the system cursor comes back and this one steps aside. The CSS
 * cursor remains the fallback before hydration, on touch screens, and
 * wherever script does not run.
 */
export function PageCursor() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cursor = ref.current;
    if (!cursor || !matchMedia("(pointer: fine)").matches) return;
    const root = document.documentElement;
    root.dataset.pageCursor = "";

    let x = 0;
    let y = 0;
    let hovered: Element | null = null;

    // The page's own cursor rules decide: where they resolve to `none`, this
    // one draws; anywhere else a system cursor is showing and this one hides.
    // An iframe is a page of its own, with its own cursor.
    const classify = (element: Element | null) => {
      hovered = element;
      if (
        !element ||
        element.tagName === "IFRAME" ||
        getComputedStyle(element).cursor !== "none"
      ) {
        delete cursor.dataset.visible;
        return;
      }
      cursor.dataset.visible = "";
      if (element.closest(INTERACTIVE)) cursor.dataset.sharp = "";
      else delete cursor.dataset.sharp;
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      x = event.clientX;
      y = event.clientY;
      cursor.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      if (event.target !== hovered) classify(event.target as Element);
    };

    // What sits under the cursor changes without the mouse moving when the
    // page scrolls, or when a click disables the button it landed on.
    const reclassify = () => {
      if (hovered) classify(document.elementFromPoint(x, y));
    };
    const onLeave = () => {
      hovered = null;
      delete cursor.dataset.visible;
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", reclassify, { passive: true });
    window.addEventListener("scroll", reclassify, {
      passive: true,
      capture: true,
    });
    root.addEventListener("mouseleave", onLeave);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", reclassify);
      window.removeEventListener("scroll", reclassify, { capture: true });
      root.removeEventListener("mouseleave", onLeave);
      delete root.dataset.pageCursor;
    };
  }, []);

  return (
    <div ref={ref} className="page-cursor" aria-hidden="true">
      <svg width="24" height="24" viewBox="0 0 24 24">
        <path className="page-cursor-outline" d={ARROW} />
        <path className="page-cursor-fill" d={ARROW} />
      </svg>
    </div>
  );
}
