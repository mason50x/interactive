"use client";

import { XMarkIcon } from "@heroicons/react/20/solid";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/** `--ease-workspace`: the curve every rail and pane change moves on. */
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
/** Narrower than this and the rail is icons: no room for a sheet. */
const WIDE_MIN = 160;
const FULL = "inset(0px 0px 0px 0px round 12px)";

/** Floating layers a sheet's content opens (a select's list, say). A press
 * in one of them is still a press in the sheet. */
const FLOATING =
  '[role="listbox"],[role="menu"],[role="dialog"],[role="tooltip"]';

type RailSheets = {
  host: HTMLElement | null;
  setHost: (host: HTMLElement | null) => void;
  wide: boolean;
  openId: string | null;
  setOpenId: (update: (current: string | null) => string | null) => void;
};

const RailSheetContext = createContext<RailSheets | null>(null);

/**
 * Sheets that open inside the rail rather than beside it: the foot's
 * controls — the schedule, split view — pull a panel up over the foot, grown
 * out of the button that opened it. One at a time.
 *
 * Only in the labelled rail. The icon rail is too narrow to hold one, so
 * there the controls keep their popovers, and folding the rail closes
 * whatever sheet was up.
 */
export function RailSheetProvider({
  rail,
  children,
}: {
  rail: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [wide, setWide] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const node = rail.current;
    if (!node) return;
    const measure = () => setWide(node.offsetWidth >= WIDE_MIN);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [rail]);

  if (!wide && openId !== null) setOpenId(null);

  return (
    <RailSheetContext.Provider
      value={{ host, setHost, wide, openId, setOpenId }}
    >
      {children}
    </RailSheetContext.Provider>
  );
}

/** Where sheets are drawn: the whole rail, so a sheet can rise up it. */
export function RailSheetHost() {
  const context = useContext(RailSheetContext);
  return (
    <div
      ref={context?.setHost}
      className="pointer-events-none absolute inset-0 z-40"
    />
  );
}

/** Whether `id`'s control opens a sheet here, and that sheet's state. */
export function useRailSheet(id: string) {
  const context = useContext(RailSheetContext);
  const setOpenId = context?.setOpenId;
  const open = context?.openId === id;
  const toggle = useCallback(
    () => setOpenId?.((current) => (current === id ? null : id)),
    [id, setOpenId],
  );
  const close = useCallback(
    () => setOpenId?.((current) => (current === id ? null : current)),
    [id, setOpenId],
  );
  return { inRail: context?.wide ?? false, open, toggle, close };
}

/**
 * The sheet itself: a card pinned to the foot of the rail, as wide as the
 * rail's rows, holding a title, a close button and `children`.
 *
 * It opens by growing out of `origin`: its clip starts as the button's own
 * rounded rect and opens to the card's, so the button seems to unfold into
 * it; the content follows it in. Closing folds it back into the button.
 * Either can be reversed partway — each starts from wherever the clip is.
 */
export function RailSheet({
  open,
  onClose,
  origin,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  origin: RefObject<HTMLElement | null>;
  title: string;
  children: ReactNode;
}) {
  const context = useContext(RailSheetContext);
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  const panel = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    const node = panel.current;
    const content = body.current;
    if (!mounted || !node || !content) return;

    // Where the clip is right now, before anything in flight is dropped.
    const current = node.getAnimations().length
      ? getComputedStyle(node).clipPath
      : null;
    node.getAnimations().forEach((animation) => animation.cancel());
    content.getAnimations().forEach((animation) => animation.cancel());

    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const button = origin.current?.getBoundingClientRect();
    const box = node.getBoundingClientRect();
    const folded =
      button && button.width > 0
        ? `inset(${button.top - box.top}px ${box.right - button.right}px ${box.bottom - button.bottom}px ${button.left - box.left}px round 10px)`
        : "inset(calc(100% - 44px) 0px 0px calc(100% - 44px) round 10px)";

    if (open) {
      closeButton.current?.focus({ preventScroll: true });
      if (reduced) {
        node.animate({ opacity: [0, 1] }, { duration: 150 });
        return;
      }
      node.animate(
        { clipPath: [current && current !== "none" ? current : folded, FULL] },
        { duration: 520, easing: EASE },
      );
      content.animate(
        {
          opacity: [0, 1],
          transform: ["translateY(10px) scale(0.98)", "none"],
        },
        { duration: 420, delay: 90, easing: EASE, fill: "backwards" },
      );
      return;
    }

    const animations = reduced
      ? [node.animate({ opacity: [1, 0] }, { duration: 120, fill: "forwards" })]
      : [
          content.animate(
            { opacity: [1, 0], transform: ["none", "translateY(6px)"] },
            { duration: 160, easing: "ease-in", fill: "forwards" },
          ),
          node.animate(
            {
              clipPath: [
                current && current !== "none" ? current : FULL,
                folded,
              ],
            },
            { duration: 400, easing: EASE, fill: "forwards" },
          ),
        ];
    let cancelled = false;
    Promise.all(animations.map((animation) => animation.finished))
      .then(() => {
        if (!cancelled) setMounted(false);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, mounted, origin]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      onClose();
      origin.current?.focus({ preventScroll: true });
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target) return;
      if (panel.current?.contains(target)) return;
      // The button toggles the sheet itself.
      if (origin.current?.contains(target)) return;
      if (target.closest?.(FLOATING)) return;
      onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, onClose, origin]);

  if (!mounted || !context?.host) return null;

  // The shadow is on a wrapper, as a drop shadow: the card is clipped, and a
  // clip takes a box shadow with it, where a drop shadow on the parent
  // follows the clipped shape.
  return createPortal(
    <div className="absolute right-0 bottom-3 left-3 flex max-h-[calc(100%-6.5rem)] flex-col drop-shadow-[0_10px_24px_rgb(0_0_0/0.22)]">
      <div
        ref={panel}
        role="dialog"
        aria-label={title}
        inert={!open}
        className={cn(
          "border-card-outline pointer-events-auto flex min-h-0 flex-col overflow-hidden rounded-xl border bg-surface",
          !open && "pointer-events-none",
        )}
      >
        <div ref={body} className="flex min-h-0 flex-col">
          <div className="flex shrink-0 items-center justify-between gap-2 pt-2 pr-2 pb-1 pl-4">
            <h2 className="truncate text-[0.9375rem] font-semibold">{title}</h2>
            <button
              ref={closeButton}
              type="button"
              aria-label={`Close ${title.toLowerCase()}`}
              onClick={() => {
                onClose();
                origin.current?.focus({ preventScroll: true });
              }}
              className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors outline-none hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <XMarkIcon aria-hidden className="size-4" />
            </button>
          </div>
          <div className="min-h-0 overflow-y-auto">{children}</div>
        </div>
      </div>
    </div>,
    context.host,
  );
}
