"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { readStorage, writeStorage } from "@/lib/storage";
import {
  freshSizes,
  isPaneWindow,
  isWorkspaceShortcut,
  layoutFor,
  layoutPreset,
  layoutRects,
  MAIN,
  MAX_PANES,
  PANE_MESSAGE,
  type LayoutId,
  type Rect,
  type Sizes,
} from "@/lib/workspace";

/** A pane that is not the router's page. `src` is null while it is empty. */
export type FramePane = {
  id: string;
  /** What the frame was opened at. Changing it reloads the frame. */
  src: string | null;
  /** Where the frame's router is now, as the frame last reported it. */
  path: string | null;
  /** Where it stood, set while it plays its exit before leaving the DOM. */
  closing?: Rect;
};

type State = {
  layout: LayoutId;
  sizes: Sizes;
  /** Pane ids in slot order. `MAIN` is always one of them. */
  slots: string[];
  /** Every frame pane by id, in the order they were created. */
  panes: FramePane[];
  focus: string;
  /** The focused pane blown up to the whole stage, the rest kept running. */
  zoom: boolean;
};

const SINGLE: State = {
  layout: "single",
  sizes: freshSizes("single"),
  slots: [MAIN],
  panes: [],
  focus: MAIN,
  zoom: false,
};

const STORAGE_KEY = "workspace:v1";
/** Once someone has used split view, the rail stops calling it new. */
export const TRIED_KEY = "workspace:tried";

type OpenOptions = {
  /** The layout to land in; the next one up by default. */
  layout?: LayoutId;
  /** The slot it takes; the last by default. */
  index?: number;
  sizes?: Partial<Sizes>;
  /** Leave focus where it is. */
  background?: boolean;
};

export type Workspace = {
  /** This document is itself a pane; it has no stage of its own. */
  isPane: boolean;
  multi: boolean;
  layout: LayoutId;
  sizes: Sizes;
  slots: string[];
  panes: FramePane[];
  focus: string;
  zoom: boolean;
  mainPath: string;
  /** The path in the focused pane, whichever that is. */
  focusedPath: string;
  /** A destination being dragged from the rail, for the stage's drop zones. */
  dragging: string | null;
  setDragging: (href: string | null) => void;
  frames: React.RefObject<Map<string, HTMLIFrameElement>>;
  pathOf: (id: string) => string | null;
  setLayout: (layout: LayoutId) => void;
  openPane: (href: string | null, options?: OpenOptions) => void;
  fillPane: (id: string, href: string | null) => void;
  replaceSlot: (slot: number, href: string) => void;
  closePane: (id: string) => void;
  focusPane: (id: string) => void;
  swapPanes: (a: string, b: string) => void;
  toggleZoom: (id?: string) => void;
  setSize: (key: keyof Sizes, value: number) => void;
  resetSize: (key: keyof Sizes) => void;
  exitSplit: () => void;
  /** Takes a pane to a page, softly where it can. */
  navigatePane: (id: string, href: string) => void;
  /** Sends a rail click to the focused pane. False: let the router have it. */
  routeToFocused: (href: string) => boolean;
  runShortcut: (code: string) => void;
};

const WorkspaceContext = createContext<Workspace | null>(null);

export function useWorkspace() {
  const workspace = use(WorkspaceContext);
  if (!workspace) throw new Error("useWorkspace needs a WorkspaceProvider");
  return workspace;
}

const noop = () => () => {};

/** Whether this document is a pane. Always false on the server and in hydration. */
export function useIsPane() {
  return useSyncExternalStore(noop, isPaneWindow, () => false);
}

/** The saved workspace, if there is a usable one. */
function readSaved(): State | null {
  const raw = readSession(STORAGE_KEY);
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw) as State;
    if (
      !Array.isArray(saved.slots) ||
      !Array.isArray(saved.panes) ||
      !saved.slots.includes(MAIN) ||
      saved.slots.length !== layoutPreset(saved.layout).panes
    )
      return null;
    const panes = saved.panes
      .filter((pane) => saved.slots.includes(pane.id))
      .map((pane) => ({
        id: pane.id,
        src: pane.path ?? pane.src,
        path: pane.path ?? pane.src,
      }));
    return {
      ...saved,
      panes,
      sizes: { ...freshSizes(saved.layout), ...saved.sizes },
      focus: saved.slots.includes(saved.focus) ? saved.focus : MAIN,
    };
  } catch {
    // A stale or hand-edited entry is just a fresh start.
    return null;
  }
}

function readSession(key: string) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Split view's state and everything that changes it.
 *
 * Kept in `sessionStorage`, so a reload comes back to the same panes but a new
 * tab starts on one. Restored after hydration rather than during it: the
 * server has no storage to read, and the frames only exist on the client
 * anyway.
 */
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const isPane = useIsPane();
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<State>(SINGLE);
  const [dragging, setDragging] = useState<string | null>(null);
  // Nothing is saved until the saved state has been read back, or the first
  // save would overwrite it with a single pane.
  const restored = useRef(false);
  const frames = useRef(new Map<string, HTMLIFrameElement>());
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  const multi = state.slots.length > 1;

  const pathOf = useCallback(
    (id: string) => {
      if (id === MAIN) return pathname;
      const frame = frames.current.get(id);
      try {
        const location = frame?.contentWindow?.location;
        if (location && location.href !== "about:blank")
          return location.pathname + location.search;
      } catch {
        // Not ours to read; fall back to what it last told us.
      }
      const pane = stateRef.current.panes.find((item) => item.id === id);
      return pane?.path ?? pane?.src ?? null;
    },
    [pathname],
  );

  // Restore, once, on the host only — a frame after hydration, since the
  // server had no storage to render from.
  useEffect(() => {
    if (isPane || restored.current) return;
    const frame = requestAnimationFrame(() => {
      restored.current = true;
      const saved = readSaved();
      if (saved) setState(saved);
    });
    return () => cancelAnimationFrame(frame);
  }, [isPane]);

  // Save on every change.
  useEffect(() => {
    if (isPane || !restored.current) return;
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          ...state,
          panes: state.panes.filter((pane) => !pane.closing),
        }),
      );
    } catch {
      // Storage blocked: split view still works, it just won't survive a reload.
    }
    if (multi && readStorage(TRIED_KEY) !== "1") {
      writeStorage(TRIED_KEY, "1");
      window.dispatchEvent(new StorageEvent("storage", { key: TRIED_KEY }));
    }
  }, [isPane, state, multi]);

  // `paneScript` marks `<html>` before the first paint, but React strips every
  // attribute off `<html>` when it recovers from a hydration error by
  // rendering the root again on the client. Without this the pane would come
  // back with a rail, a margin and toasts of its own. Before paint, so it
  // never shows.
  useLayoutEffect(() => {
    if (isPane) document.documentElement.setAttribute("data-pane", "");
  }, [isPane]);

  // The rail folds to icons while there is more than one pane; see the `wide`
  // variant in `globals.css`.
  useEffect(() => {
    if (isPane) return;
    const root = document.documentElement;
    if (multi) root.setAttribute("data-workspace", "split");
    else root.removeAttribute("data-workspace");
    return () => root.removeAttribute("data-workspace");
  }, [isPane, multi]);

  // What is on screen, for anything that asks whether a page is being looked
  // at — the chat's desktop alerts, mainly. See `pathsOnScreen`.
  useEffect(() => {
    if (isPane) return;
    const shown = state.zoom
      ? [state.focus]
      : state.slots.filter((id) => id === MAIN || !!pathOf(id));
    window.__workspacePaths = shown
      .map((id) => (id === MAIN ? pathname : pathOf(id)))
      .filter((path): path is string => !!path)
      .map((path) => path.split("?")[0]);
  }, [isPane, state, pathname, pathOf]);

  const focusPane = useCallback((id: string) => {
    setState((current) =>
      current.focus === id || !current.slots.includes(id)
        ? current
        : { ...current, focus: id },
    );
  }, []);

  const setLayout = useCallback((layout: LayoutId) => {
    setState((current) => {
      const count = layoutPreset(layout).panes;
      let slots = [...current.slots];
      let panes = current.panes.filter((pane) => !pane.closing);
      while (slots.length < count) {
        const id = newId();
        slots.push(id);
        panes.push({ id, src: null, path: null });
      }
      if (slots.length > count) {
        // Keep the router's page and the focused pane; let the rest go from
        // the end.
        const keep = new Set([MAIN, current.focus]);
        const kept = slots.filter((id) => keep.has(id));
        const rest = slots.filter((id) => !keep.has(id));
        const survivors = new Set([
          ...kept,
          ...rest.slice(0, Math.max(0, count - kept.length)),
        ]);
        slots = slots.filter((id) => survivors.has(id)).slice(0, count);
        panes = panes.filter((pane) => slots.includes(pane.id));
      }
      return {
        ...current,
        layout,
        slots,
        panes,
        sizes: layout === current.layout ? current.sizes : freshSizes(layout),
        focus: slots.includes(current.focus) ? current.focus : MAIN,
        zoom: false,
      };
    });
  }, []);

  const openPane = useCallback(
    (href: string | null, options: OpenOptions = {}) => {
      setState((current) => {
        const live = current.panes.filter((pane) => !pane.closing);
        // Already open somewhere: bring that one forward instead.
        if (href) {
          const existing = current.slots.find(
            (id) =>
              (id === MAIN ? pathname : pathOf(id))?.split("?")[0] === href,
          );
          if (existing) return { ...current, focus: existing, zoom: false };
        }
        // Full: the newcomer takes the focused frame's place, or the last one.
        if (current.slots.length >= MAX_PANES) {
          const target =
            current.focus !== MAIN
              ? current.focus
              : current.slots.filter((id) => id !== MAIN).at(-1);
          if (!target) return current;
          const id = newId();
          return {
            ...current,
            slots: current.slots.map((slot) => (slot === target ? id : slot)),
            panes: [
              ...live.filter((pane) => pane.id !== target),
              { id, src: href, path: href },
            ],
            focus: options.background ? current.focus : id,
            zoom: false,
          };
        }
        const layout =
          options.layout ?? layoutFor(current.slots.length + 1, current.layout);
        const id = newId();
        const slots = [...current.slots];
        slots.splice(
          Math.min(options.index ?? slots.length, slots.length),
          0,
          id,
        );
        return {
          ...current,
          layout,
          slots,
          panes: [...live, { id, src: href, path: href }],
          sizes: {
            ...(layout === current.layout ? current.sizes : freshSizes(layout)),
            ...options.sizes,
          },
          focus: options.background ? current.focus : id,
          zoom: false,
        };
      });
    },
    [pathname, pathOf],
  );

  const fillPane = useCallback((id: string, href: string | null) => {
    setState((current) => ({
      ...current,
      panes: current.panes.map((pane) =>
        pane.id === id ? { ...pane, src: href, path: href } : pane,
      ),
      focus: id,
    }));
  }, []);

  const replaceSlot = useCallback(
    (slot: number, href: string) => {
      const id = stateRef.current.slots[slot];
      if (!id) return;
      if (id === MAIN) {
        router.push(href);
        focusPane(MAIN);
        return;
      }
      fillPane(id, href);
    },
    [fillPane, focusPane, router],
  );

  const closePane = useCallback(
    (id: string) => {
      const current = stateRef.current;
      if (!current.slots.includes(id) || current.slots.length < 2) return;

      if (id === MAIN) {
        // The router's page cannot leave the stage, so the next pane with a
        // page in it moves into the router, and its frame goes instead.
        const heir = current.slots.find(
          (slot) => slot !== MAIN && pathOf(slot),
        );
        if (!heir) {
          setState(SINGLE);
          return;
        }
        const path = pathOf(heir);
        if (path) router.push(path);
        setState((now) => {
          const slots = now.slots
            .filter((slot) => slot !== MAIN)
            .map((slot) => (slot === heir ? MAIN : slot));
          return {
            ...now,
            slots,
            panes: now.panes.filter((pane) => pane.id !== heir),
            layout: layoutFor(slots.length, now.layout),
            sizes:
              layoutFor(slots.length, now.layout) === now.layout
                ? now.sizes
                : freshSizes(layoutFor(slots.length, now.layout)),
            focus: MAIN,
            zoom: false,
          };
        });
        return;
      }

      setState((now) => {
        const slots = now.slots.filter((slot) => slot !== id);
        const layout = layoutFor(slots.length, now.layout);
        const index = now.slots.indexOf(id);
        const stood = now.zoom
          ? { l: 0, t: 0, w: 1, h: 1 }
          : layoutRects(now.layout, now.sizes)[index];
        return {
          ...now,
          slots,
          layout,
          sizes: layout === now.layout ? now.sizes : freshSizes(layout),
          panes: now.panes.map((pane) =>
            pane.id === id ? { ...pane, closing: stood } : pane,
          ),
          focus:
            now.focus === id
              ? (slots[Math.max(0, index - 1)] ?? MAIN)
              : now.focus,
          zoom: now.focus === id ? false : now.zoom,
        };
      });
      window.setTimeout(() => {
        setState((now) => ({
          ...now,
          panes: now.panes.filter((pane) => pane.id !== id),
        }));
      }, 260);
    },
    [pathOf, router],
  );

  const swapPanes = useCallback((a: string, b: string) => {
    setState((current) => {
      const i = current.slots.indexOf(a);
      const j = current.slots.indexOf(b);
      if (i < 0 || j < 0 || i === j) return current;
      const slots = [...current.slots];
      [slots[i], slots[j]] = [slots[j], slots[i]];
      return { ...current, slots };
    });
  }, []);

  const toggleZoom = useCallback((id?: string) => {
    setState((current) => {
      if (current.slots.length < 2) return current;
      const target = id ?? current.focus;
      if (current.zoom && current.focus === target)
        return { ...current, zoom: false };
      return { ...current, focus: target, zoom: true };
    });
  }, []);

  const setSize = useCallback((key: keyof Sizes, value: number) => {
    setState((current) =>
      current.sizes[key] === value
        ? current
        : { ...current, sizes: { ...current.sizes, [key]: value } },
    );
  }, []);

  const resetSize = useCallback((key: keyof Sizes) => {
    setState((current) => ({
      ...current,
      sizes: { ...current.sizes, [key]: freshSizes(current.layout)[key] },
    }));
  }, []);

  const exitSplit = useCallback(() => {
    const current = stateRef.current;
    if (current.focus !== MAIN) {
      const path = pathOf(current.focus);
      if (path) router.push(path);
    }
    setState(SINGLE);
  }, [pathOf, router]);

  const navigatePane = useCallback(
    (id: string, href: string) => {
      if (id === MAIN) {
        router.push(href);
        focusPane(MAIN);
        return;
      }
      const pane = stateRef.current.panes.find((item) => item.id === id);
      if (!pane) return;
      const frame = frames.current.get(id);
      if (pane.src && frame?.contentWindow) {
        // A soft navigation inside the frame: no reload, no flash.
        frame.contentWindow.postMessage(
          { type: PANE_MESSAGE.navigate, href },
          window.location.origin,
        );
        setState((now) => ({
          ...now,
          focus: id,
          panes: now.panes.map((item) =>
            item.id === id ? { ...item, path: href } : item,
          ),
        }));
      } else {
        fillPane(id, href);
      }
    },
    [fillPane, focusPane, router],
  );

  const routeToFocused = useCallback(
    (href: string) => {
      const current = stateRef.current;
      if (current.slots.length < 2 || current.focus === MAIN) return false;
      navigatePane(current.focus, href);
      return true;
    },
    [navigatePane],
  );

  const runShortcut = useCallback(
    (code: string) => {
      const current = stateRef.current;
      if (code.startsWith("Digit")) {
        const n = Number(code.slice(5));
        if (n === 0) exitSplit();
        else if (current.slots[n - 1]) focusPane(current.slots[n - 1]);
      } else if (code === "Backslash") {
        if (current.slots.length < MAX_PANES) openPane(null);
      } else if (code === "Enter") {
        toggleZoom();
      }
    },
    [exitSplit, focusPane, openPane, toggleZoom],
  );

  // Shortcuts pressed here, and the ones panes pass up.
  useEffect(() => {
    if (isPane) return;
    function onKey(event: KeyboardEvent) {
      if (!isWorkspaceShortcut(event)) return;
      if (window.matchMedia("(width < 48rem)").matches) return;
      event.preventDefault();
      runShortcut(event.code);
    }
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string; [key: string]: unknown };
      if (!data?.type?.startsWith("workspace:")) return;
      let id: string | null = null;
      for (const [paneId, frame] of frames.current) {
        if (frame.contentWindow === event.source) id = paneId;
      }
      if (!id) return;
      const paneId = id;
      if (
        data.type === PANE_MESSAGE.location &&
        typeof data.path === "string"
      ) {
        const path = data.path;
        setState((current) => ({
          ...current,
          panes: current.panes.map((pane) =>
            pane.id === paneId ? { ...pane, path } : pane,
          ),
        }));
      } else if (data.type === PANE_MESSAGE.focus) {
        focusPane(paneId);
      } else if (
        data.type === PANE_MESSAGE.key &&
        typeof data.code === "string"
      ) {
        runShortcut(data.code);
      } else if (
        data.type === PANE_MESSAGE.open &&
        typeof data.href === "string"
      ) {
        openPane(data.href);
      }
    }
    // Focus going into a frame blurs this window; whichever frame took it is
    // the pane being used. Catches the clicks a pane's own bridge cannot see,
    // like those on a game running in a frame of its own inside the pane.
    function onBlur() {
      window.setTimeout(() => {
        const active = document.activeElement;
        if (!(active instanceof HTMLIFrameElement)) return;
        for (const [paneId, frame] of frames.current) {
          if (frame === active) focusPane(paneId);
        }
      }, 0);
    }
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("message", onMessage);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("message", onMessage);
      window.removeEventListener("blur", onBlur);
    };
  }, [isPane, runShortcut, focusPane, openPane]);

  const focusedPath =
    state.focus === MAIN
      ? pathname
      : (state.panes.find((pane) => pane.id === state.focus)?.path ?? "");

  const value = useMemo<Workspace>(
    () => ({
      isPane,
      multi: !isPane && multi,
      layout: state.layout,
      sizes: state.sizes,
      slots: state.slots,
      panes: state.panes,
      focus: state.focus,
      zoom: state.zoom,
      mainPath: pathname,
      focusedPath,
      dragging,
      setDragging,
      frames,
      pathOf,
      setLayout,
      openPane,
      fillPane,
      replaceSlot,
      closePane,
      focusPane,
      swapPanes,
      toggleZoom,
      setSize,
      resetSize,
      exitSplit,
      navigatePane,
      routeToFocused,
      runShortcut,
    }),
    [
      isPane,
      multi,
      state,
      pathname,
      focusedPath,
      dragging,
      pathOf,
      setLayout,
      openPane,
      fillPane,
      replaceSlot,
      closePane,
      focusPane,
      swapPanes,
      toggleZoom,
      setSize,
      resetSize,
      exitSplit,
      navigatePane,
      routeToFocused,
      runShortcut,
    ],
  );

  return (
    <WorkspaceContext value={value}>
      {isPane && <PaneBridge />}
      {children}
    </WorkspaceContext>
  );
}

/**
 * The pane's half of the conversation: where its router is, when it is used,
 * and the shortcuts that belong to the host. The host's half is the message
 * listener in `WorkspaceProvider`.
 */
function PaneBridge() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    window.parent.postMessage(
      {
        type: PANE_MESSAGE.location,
        path: window.location.pathname + window.location.search,
      },
      window.location.origin,
    );
  }, [pathname]);

  useEffect(() => {
    const post = (message: object) =>
      window.parent.postMessage(message, window.location.origin);
    const onFocus = () => post({ type: PANE_MESSAGE.focus });
    const onKey = (event: KeyboardEvent) => {
      if (!isWorkspaceShortcut(event)) return;
      event.preventDefault();
      event.stopPropagation();
      post({ type: PANE_MESSAGE.key, code: event.code });
    };
    const onMessage = (event: MessageEvent) => {
      if (
        event.origin !== window.location.origin ||
        event.source !== window.parent
      )
        return;
      const data = event.data as { type?: string; href?: unknown };
      if (data?.type === PANE_MESSAGE.navigate && typeof data.href === "string")
        router.push(data.href);
    };
    window.addEventListener("pointerdown", onFocus, true);
    window.addEventListener("focusin", onFocus);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("pointerdown", onFocus, true);
      window.removeEventListener("focusin", onFocus);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("message", onMessage);
    };
  }, [router]);

  return null;
}
