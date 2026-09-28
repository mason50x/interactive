/**
 * Split view: more than one page of the app on screen at once.
 *
 * The page the router is on is always one of the panes — `MAIN` — and it is
 * the real page, rendered by the layout like any other. Every other pane is
 * the same app in a same-origin frame, opened at a path and left to navigate
 * on its own. A frame is never moved in the DOM once it exists (moving an
 * iframe reloads it), so a pane's place on the stage is a rectangle and
 * nothing else: swapping two panes or switching layouts only changes numbers,
 * which is also what lets every change animate.
 *
 * This module is the geometry and the vocabulary shared by both sides of the
 * frame boundary. It has no React in it.
 */

/** The router's own page. Always on the stage, never a frame. */
export const MAIN = "main";

/** How a frame knows it is a pane: its window name, which survives navigation. */
export const PANE_WINDOW_PREFIX = "workspace-pane:";

/** `postMessage` types, both directions across the frame boundary. */
export const PANE_MESSAGE = {
  /** Pane → host: the pane's router moved. */
  location: "workspace:location",
  /** Pane → host: the reader clicked or tabbed into the pane. */
  focus: "workspace:focus",
  /** Pane → host: a workspace shortcut was pressed while the pane had focus. */
  key: "workspace:key",
  /** Pane → host: the panic key, which has to take the whole tab with it. */
  panic: "workspace:panic",
  /** Pane → host: open something in a new pane. */
  open: "workspace:open",
  /** Host → pane: go to this path. */
  navigate: "workspace:navigate",
} as const;

/** The drag payload for anything dropped onto the stage. */
export const WORKSPACE_DRAG_TYPE = "application/x-workspace-href";

export type LayoutId =
  "single" | "columns" | "rows" | "trio" | "thirds" | "grid" | "quad";

/** Where the dividers sit, as fractions of the stage. */
export type Sizes = { x: number; x2: number; y: number; y2: number };

export const DEFAULT_SIZES: Sizes = { x: 0.5, x2: 2 / 3, y: 0.5, y2: 2 / 3 };

/** A rectangle in fractions of the stage: left, top, width, height. */
export type Rect = { l: number; t: number; w: number; h: number };

export type LayoutPreset = {
  id: LayoutId;
  label: string;
  /** What someone would use it for, in the layout menu. */
  hint: string;
  panes: number;
};

export const LAYOUTS: LayoutPreset[] = [
  { id: "single", label: "Single", hint: "One thing, full size", panes: 1 },
  { id: "columns", label: "Half & half", hint: "Side by side", panes: 2 },
  { id: "rows", label: "Top & bottom", hint: "Stacked", panes: 2 },
  { id: "trio", label: "One + two", hint: "A big one and a stack", panes: 3 },
  { id: "thirds", label: "Three across", hint: "Three columns", panes: 3 },
  { id: "grid", label: "Four square", hint: "A two-by-two grid", panes: 4 },
  { id: "quad", label: "One + three", hint: "A big one and three", panes: 4 },
];

export const MAX_PANES = 4;

export function layoutPreset(id: LayoutId): LayoutPreset {
  return LAYOUTS.find((layout) => layout.id === id) ?? LAYOUTS[0];
}

/** The layout a count of panes falls back to when one opens or closes. */
export function layoutFor(count: number, previous?: LayoutId): LayoutId {
  if (previous && layoutPreset(previous).panes === count) return previous;
  if (count <= 1) return "single";
  if (count === 2) return previous === "rows" ? "rows" : "columns";
  if (count === 3) return previous === "thirds" ? "thirds" : "trio";
  return previous === "quad" ? "quad" : "grid";
}

/** Each slot's rectangle, in slot order. */
export function layoutRects(layout: LayoutId, s: Sizes): Rect[] {
  switch (layout) {
    case "single":
      return [{ l: 0, t: 0, w: 1, h: 1 }];
    case "columns":
      return [
        { l: 0, t: 0, w: s.x, h: 1 },
        { l: s.x, t: 0, w: 1 - s.x, h: 1 },
      ];
    case "rows":
      return [
        { l: 0, t: 0, w: 1, h: s.y },
        { l: 0, t: s.y, w: 1, h: 1 - s.y },
      ];
    case "trio":
      return [
        { l: 0, t: 0, w: s.x, h: 1 },
        { l: s.x, t: 0, w: 1 - s.x, h: s.y },
        { l: s.x, t: s.y, w: 1 - s.x, h: 1 - s.y },
      ];
    case "thirds":
      return [
        { l: 0, t: 0, w: s.x, h: 1 },
        { l: s.x, t: 0, w: s.x2 - s.x, h: 1 },
        { l: s.x2, t: 0, w: 1 - s.x2, h: 1 },
      ];
    case "grid":
      return [
        { l: 0, t: 0, w: s.x, h: s.y },
        { l: s.x, t: 0, w: 1 - s.x, h: s.y },
        { l: 0, t: s.y, w: s.x, h: 1 - s.y },
        { l: s.x, t: s.y, w: 1 - s.x, h: 1 - s.y },
      ];
    case "quad":
      return [
        { l: 0, t: 0, w: s.x, h: 1 },
        { l: s.x, t: 0, w: 1 - s.x, h: s.y },
        { l: s.x, t: s.y, w: 1 - s.x, h: s.y2 - s.y },
        { l: s.x, t: s.y2, w: 1 - s.x, h: 1 - s.y2 },
      ];
  }
}

/**
 * The sizes a layout starts from. Thirds and the three-high stack want their
 * dividers at thirds, not halves; everything else starts even.
 */
export function freshSizes(layout: LayoutId): Sizes {
  if (layout === "thirds") return { ...DEFAULT_SIZES, x: 1 / 3, x2: 2 / 3 };
  if (layout === "quad") return { ...DEFAULT_SIZES, x: 0.6, y: 1 / 3 };
  if (layout === "trio") return { ...DEFAULT_SIZES, x: 0.6 };
  return DEFAULT_SIZES;
}

/** No pane is ever squeezed thinner than this share of the stage. */
const MIN = 0.15;

export type Divider = {
  key: keyof Sizes;
  axis: "x" | "y";
  /** The line it draws: along the other axis, from `from` to `to`. */
  at: number;
  from: number;
  to: number;
  min: number;
  max: number;
};

/** The handles a layout can be resized by. */
export function layoutDividers(layout: LayoutId, s: Sizes): Divider[] {
  const x = (
    at = s.x,
    from = 0,
    to = 1,
    min = MIN,
    max = 1 - MIN,
  ): Divider => ({
    key: "x",
    axis: "x",
    at,
    from,
    to,
    min,
    max,
  });
  switch (layout) {
    case "single":
      return [];
    case "columns":
      return [x()];
    case "rows":
      return [
        {
          key: "y",
          axis: "y",
          at: s.y,
          from: 0,
          to: 1,
          min: MIN,
          max: 1 - MIN,
        },
      ];
    case "trio":
      return [
        x(),
        {
          key: "y",
          axis: "y",
          at: s.y,
          from: s.x,
          to: 1,
          min: MIN,
          max: 1 - MIN,
        },
      ];
    case "thirds":
      return [
        x(s.x, 0, 1, MIN, s.x2 - MIN),
        {
          key: "x2",
          axis: "x",
          at: s.x2,
          from: 0,
          to: 1,
          min: s.x + MIN,
          max: 1 - MIN,
        },
      ];
    case "grid":
      return [
        x(),
        {
          key: "y",
          axis: "y",
          at: s.y,
          from: 0,
          to: 1,
          min: MIN,
          max: 1 - MIN,
        },
      ];
    case "quad":
      return [
        x(),
        {
          key: "y",
          axis: "y",
          at: s.y,
          from: s.x,
          to: 1,
          min: MIN,
          max: s.y2 - MIN,
        },
        {
          key: "y2",
          axis: "y",
          at: s.y2,
          from: s.x,
          to: 1,
          min: s.y + MIN,
          max: 1 - MIN,
        },
      ];
  }
}

export function clampFraction(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * The CSS box for a fraction rectangle, with `gap` pixels between neighbours
 * and none against the stage's own edge.
 */
export function rectStyle(rect: Rect, gap: number) {
  const half = gap / 2;
  const edge = (start: number, size: number) => {
    const lead = start > 0.001 ? half : 0;
    const trail = start + size < 0.999 ? half : 0;
    return {
      start: `calc(${start * 100}% + ${lead}px)`,
      size: `calc(${size * 100}% - ${lead + trail}px)`,
    };
  };
  const x = edge(rect.l, rect.w);
  const y = edge(rect.t, rect.h);
  return { left: x.start, width: x.size, top: y.start, height: y.size };
}

/** `rectStyle`'s width and height in pixels, on a stage of a given size. */
export function rectPixels(
  rect: Rect,
  gap: number,
  stage: { width: number; height: number },
) {
  const half = gap / 2;
  const size = (start: number, span: number, total: number) =>
    span * total -
    (start > 0.001 ? half : 0) -
    (start + span < 0.999 ? half : 0);
  return {
    width: size(rect.l, rect.w, stage.width),
    height: size(rect.t, rect.h, stage.height),
  };
}

/** Where a drop would land, for the preview and the drop itself. */
export type DropPlan =
  | { kind: "replace"; slot: number; rect: Rect }
  | { kind: "add"; layout: LayoutId; index: number; rect: Rect };

/**
 * What dropping at `point` (fractions of the stage) would do.
 *
 * On a single page, the nearest edge decides the side the newcomer takes —
 * the window-snapping everyone already knows — and the middle replaces what
 * is there. With panes already up, the middle of a pane replaces it and its
 * edges add a pane to the next layout up, while there is room for one.
 */
export function planDrop(
  layout: LayoutId,
  sizes: Sizes,
  count: number,
  point: { x: number; y: number },
): DropPlan {
  const rects = layoutRects(layout, sizes);
  const slot = Math.max(
    0,
    rects.findIndex(
      (r) =>
        point.x >= r.l &&
        point.x <= r.l + r.w &&
        point.y >= r.t &&
        point.y <= r.t + r.h,
    ),
  );
  const rect = rects[slot];
  const u = (point.x - rect.l) / rect.w;
  const v = (point.y - rect.t) / rect.h;
  const edge = Math.min(u, 1 - u, v, 1 - v);
  if (count >= MAX_PANES || edge > 0.22) return { kind: "replace", slot, rect };

  if (count === 1) {
    const side =
      edge === u
        ? "left"
        : edge === 1 - u
          ? "right"
          : edge === v
            ? "top"
            : "bottom";
    const next = side === "left" || side === "right" ? "columns" : "rows";
    const index = side === "left" || side === "top" ? 0 : 1;
    return {
      kind: "add",
      layout: next,
      index,
      rect: layoutRects(next, DEFAULT_SIZES)[index],
    };
  }

  const next = layoutFor(count + 1);
  const nextSizes = freshSizes(next);
  return {
    kind: "add",
    layout: next,
    index: count,
    rect: layoutRects(next, nextSizes)[count],
  };
}

/** Whether this document is a pane inside another copy of the app. */
export function isPaneWindow(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      window.parent !== window &&
      window.name.startsWith(PANE_WINDOW_PREFIX) &&
      window.parent.location.origin === window.location.origin
    );
  } catch {
    return false;
  }
}

/** The window that owns the tab: the host when this is a pane, else this one. */
export function hostWindow(): Window {
  return isPaneWindow() ? window.parent : window;
}

declare global {
  interface Window {
    /** Every path on screen right now, main first. Kept by the host. */
    __workspacePaths?: string[];
  }
}

/** The paths someone can see, in whichever pane they are in. */
export function pathsOnScreen(): string[] {
  try {
    return hostWindow().__workspacePaths ?? [window.location.pathname];
  } catch {
    return [window.location.pathname];
  }
}

/**
 * Marks `<html>` before the first paint when the document is a pane, so the
 * rail and the shell's margin are never drawn inside a frame. Mirrors
 * `isPaneWindow`.
 */
export const paneScript = `(function(){try{if(window.parent!==window&&window.name.indexOf(${JSON.stringify(
  PANE_WINDOW_PREFIX,
)})===0&&window.parent.location.origin===location.origin)document.documentElement.setAttribute("data-pane","")}catch(_){}})()`;

/** Workspace shortcuts: Alt+Shift and a key, matched on `code`. */
export const SHORTCUT_CODES = new Set([
  "Digit1",
  "Digit2",
  "Digit3",
  "Digit4",
  "Digit0",
  "Backslash",
  "Enter",
]);

export function isWorkspaceShortcut(event: KeyboardEvent) {
  return (
    event.altKey &&
    event.shiftKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    SHORTCUT_CODES.has(event.code)
  );
}
