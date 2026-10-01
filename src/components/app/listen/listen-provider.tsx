"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { ExperienceService } from "@/components/app/experience-chrome";
import { isPaneWindow } from "@/lib/workspace";
import {
  MEDIA_MESSAGE,
  positionAt,
  readBridgeState,
  type BridgeState,
  type MediaCommand,
} from "@/lib/listen";
import { cn } from "@/lib/utils";
import { MiniPlayer } from "./mini-player";
import { PopOutPlayer } from "./pop-out-player";
import { useTabMediaSession } from "./tab-media";

type Session = { appId: string; run: number };

/** A player's last report, and what the shell made of it. */
export type NowPlaying = {
  appId: string;
  label: string;
  state: BridgeState;
  receivedAt: number;
  artworkUrl: string | null;
  /** A colour from the artwork, for the wash behind the player. */
  tint: string | null;
};

type Slot = { element: HTMLElement; inert: boolean };

type ListenContextValue = {
  /** False inside a split-view pane, where Browse keeps its frames itself. */
  enabled: boolean;
  services: ExperienceService[];
  sessions: Session[];
  launch: (appId: string) => void;
  close: (appId: string) => void;
  reload: (appId: string) => void;
  registerSlot: (appId: string, slot: Slot | null) => void;
  /** Browse's say in which listen apps it is showing, before any slot lays out. */
  setFront: (appIds: string[]) => void;
  /** Apps whose frame is on screen in Browse right now. */
  onScreen: string[];
  playing: Record<string, NowPlaying>;
  /** The app the mini player shows. */
  current: NowPlaying | null;
  currentId: string | null;
  command: (appId: string, command: MediaCommand) => void;
  popOut: {
    supported: boolean;
    window: Window | null;
    open: () => void;
    close: () => void;
  };
};

const ListenContext = createContext<ListenContextValue>({
  enabled: false,
  services: [],
  sessions: [],
  launch: () => {},
  close: () => {},
  reload: () => {},
  registerSlot: () => {},
  setFront: () => {},
  onScreen: [],
  playing: {},
  current: null,
  currentId: null,
  command: () => {},
  popOut: { supported: false, window: null, open: () => {}, close: () => {} },
});

export function useListen() {
  return useContext(ListenContext);
}

const noop = () => () => {};

/**
 * The shell's music players.
 *
 * Browse frames most apps itself and tears them down when you leave. A
 * listen app's frame is mounted here instead, in a fixed layer over the whole
 * shell, and Browse only leaves a slot where it should appear: while the slot
 * is on screen the frame is laid over it, and the rest of the time it is
 * parked out of sight, still playing. A frame is never moved in the DOM —
 * that would reload it — so both are only a change of position.
 *
 * Music is free. A listen app spends no playtime, in Browse or out of it
 * (see `FREE_EXPERIENCE_APPS` in `config/playtime.ts`), so running out of
 * time neither charges for it nor closes it.
 */
export function ListenProvider({
  services,
  children,
}: {
  services: ExperienceService[];
  children: ReactNode;
}) {
  const enabled = !useSyncExternalStore(noop, isPaneWindow, () => true);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [playing, setPlaying] = useState<Record<string, NowPlaying>>({});
  const [lastPlayed, setLastPlayed] = useState<string | null>(null);
  const [onScreen, setOnScreen] = useState<string[]>([]);
  const [front, setFrontState] = useState<string[]>([]);
  const setFront = useCallback(
    (appIds: string[]) =>
      setFrontState((current) =>
        current.join(" ") === appIds.join(" ") ? current : appIds,
      ),
    [],
  );
  const [popOutWindow, setPopOutWindow] = useState<Window | null>(null);
  const frames = useRef(new Map<string, HTMLIFrameElement>());
  const holders = useRef(new Map<string, HTMLDivElement>());
  const slots = useRef(new Map<string, Slot>());

  const serviceFor = useCallback(
    (appId: string) => services.find((service) => service.id === appId),
    [services],
  );

  const launch = useCallback(
    (appId: string) => {
      if (!serviceFor(appId)?.src) return;
      setSessions((current) =>
        current.some((session) => session.appId === appId)
          ? current
          : [...current, { appId, run: 0 }],
      );
    },
    [serviceFor],
  );

  const close = useCallback((appId: string) => {
    setSessions((current) =>
      current.filter((session) => session.appId !== appId),
    );
    setPlaying((current) => {
      if (!(appId in current)) return current;
      const { [appId]: gone, ...rest } = current;
      if (gone.artworkUrl) URL.revokeObjectURL(gone.artworkUrl);
      return rest;
    });
  }, []);

  const reload = useCallback((appId: string) => {
    setSessions((current) =>
      current.map((session) =>
        session.appId === appId
          ? { ...session, run: session.run + 1 }
          : session,
      ),
    );
  }, []);

  const registerSlot = useCallback((appId: string, slot: Slot | null) => {
    if (slot) slots.current.set(appId, slot);
    else slots.current.delete(appId);
  }, []);

  const command = useCallback((appId: string, command: MediaCommand) => {
    const frame = frames.current.get(appId);
    if (!frame?.contentWindow) return;
    frame.contentWindow.postMessage(
      { type: MEDIA_MESSAGE.command, command },
      new URL(frame.src).origin,
    );
    // Show the press at once; the player's own report follows within a beat.
    setPlaying((current) => {
      const live = current[appId];
      if (!live) return current;
      const now = Date.now();
      const position = positionAt(live.state, live.receivedAt, now);
      const state =
        command.action === "play" || command.action === "pause"
          ? { ...live.state, position, playing: command.action === "play" }
          : command.action === "seekto"
            ? { ...live.state, position: command.seekTime }
            : command.action === "volume"
              ? { ...live.state, volume: command.value, muted: false }
              : command.action === "mute"
                ? { ...live.state, muted: command.value }
                : null;
      return state
        ? { ...current, [appId]: { ...live, state, receivedAt: now } }
        : current;
    });
  }, []);

  // What each player reports, from its own frame and nowhere else.
  useEffect(() => {
    if (!enabled) return;
    function receive(event: MessageEvent) {
      if (event.data?.type !== MEDIA_MESSAGE.state) return;
      for (const [appId, frame] of frames.current) {
        if (
          frame.contentWindow !== event.source ||
          new URL(frame.src).origin !== event.origin
        )
          continue;
        const state = readBridgeState(event.data.state);
        const label = serviceFor(appId)?.label ?? appId;
        setPlaying((current) => {
          const previous = current[appId];
          if (!state) {
            if (!previous) return current;
            const { [appId]: gone, ...rest } = current;
            if (gone.artworkUrl) URL.revokeObjectURL(gone.artworkUrl);
            return rest;
          }
          const sameArt =
            previous && previous.state.artworkSrc === state.artworkSrc;
          let artworkUrl = sameArt ? previous.artworkUrl : null;
          let tint = sameArt ? previous.tint : null;
          if (!sameArt && previous?.artworkUrl)
            URL.revokeObjectURL(previous.artworkUrl);
          if (!artworkUrl && state.artwork) {
            artworkUrl = URL.createObjectURL(state.artwork);
            tint = null;
            const url = artworkUrl;
            void tintOf(state.artwork).then((color) =>
              setPlaying((latest) =>
                latest[appId]?.artworkUrl === url
                  ? { ...latest, [appId]: { ...latest[appId], tint: color } }
                  : latest,
              ),
            );
          }
          return {
            ...current,
            [appId]: {
              appId,
              label,
              state: { ...state, artwork: null },
              receivedAt: Date.now(),
              artworkUrl,
              tint,
            },
          };
        });
        if (state?.playing) setLastPlayed(appId);
        return;
      }
    }
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [enabled, serviceFor]);

  // Lay each frame over its slot, or park it. Every frame, because a pane can
  // move without resizing — a divider drag, the rail folding — and there is
  // at most one or two of these.
  useLayoutEffect(() => {
    if (!enabled || sessions.length === 0) return;
    let raf = 0;
    let shown = "";
    function place() {
      const visible: string[] = [];
      for (const [appId, holder] of holders.current) {
        const slot = slots.current.get(appId);
        const rect = slot?.element.isConnected
          ? slot.element.getBoundingClientRect()
          : null;
        const on = !!rect && rect.width > 0 && rect.height > 0;
        const style = holder.style;
        if (on && rect) {
          visible.push(appId);
          style.left = `${rect.left}px`;
          style.top = `${rect.top}px`;
          style.width = `${rect.width}px`;
          style.height = `${rect.height}px`;
          style.visibility = "visible";
          style.pointerEvents = slot?.inert ? "none" : "";
          holder.inert = false;
        } else {
          // Parked at its last size, so the player is not re-laid out.
          style.left = "-100000px";
          style.visibility = "hidden";
          holder.inert = true;
        }
        // A fullscreen stage is in the top layer, above everything fixed.
        // Join it there while the slot is inside it.
        const full = document.fullscreenElement;
        const promote =
          on && !!full && full !== holder && full.contains(slot!.element);
        const open = holder.matches(":popover-open");
        if (promote && !open) {
          holder.setAttribute("popover", "manual");
          holder.showPopover();
        } else if (!promote && holder.hasAttribute("popover")) {
          if (open) holder.hidePopover();
          holder.removeAttribute("popover");
        }
      }
      const key = visible.join(" ");
      if (key !== shown) {
        shown = key;
        setOnScreen(visible);
      }
      raf = requestAnimationFrame(place);
    }
    place();
    return () => cancelAnimationFrame(raf);
  }, [enabled, sessions]);

  const openPopOut = useCallback(async () => {
    const api = pictureInPicture();
    if (!api) return;
    if (api.window) {
      api.window.focus();
      return;
    }
    try {
      const pip = await api.requestWindow({ width: 340, height: 440 });
      mirrorDocument(pip);
      pip.addEventListener("pagehide", () => setPopOutWindow(null), {
        once: true,
      });
      setPopOutWindow(pip);
    } catch {
      // Needs a click, and one pop-out per tab; the button stays where it was.
    }
  }, []);

  const closePopOut = useCallback(() => {
    popOutWindow?.close();
    setPopOutWindow(null);
  }, [popOutWindow]);

  useEffect(() => {
    if (sessions.length === 0 && popOutWindow) closePopOut();
  }, [sessions.length, popOutWindow, closePopOut]);

  const popOutSupported = useSyncExternalStore(
    noop,
    () => pictureInPicture() !== null,
    () => false,
  );

  const live = sessions.filter((session) => playing[session.appId]);
  const currentId =
    (lastPlayed && sessions.some((s) => s.appId === lastPlayed)
      ? lastPlayed
      : null) ??
    live.at(-1)?.appId ??
    sessions.at(-1)?.appId ??
    null;
  const current = currentId ? (playing[currentId] ?? null) : null;

  // Switching tabs while it plays pops the player out on its own.
  useTabMediaSession({
    active: enabled && sessions.length > 0 && popOutSupported,
    track: current,
    command: (next) => {
      if (currentId) command(currentId, next);
    },
    popOut: () => void openPopOut(),
  });

  const value: ListenContextValue = {
    enabled,
    services,
    sessions,
    launch,
    close,
    reload,
    registerSlot,
    setFront,
    // In front in Browse counts as on screen even while its pane waits on a
    // playtime lease, so the mini player does not flash up over it.
    onScreen: [...new Set([...onScreen, ...front])],
    playing,
    current,
    currentId,
    command,
    popOut: {
      supported: popOutSupported,
      window: popOutWindow,
      open: () => void openPopOut(),
      close: closePopOut,
    },
  };

  return (
    <ListenContext.Provider value={value}>
      {children}
      {enabled &&
        sessions.map((session) => {
          const service = serviceFor(session.appId);
          if (!service?.src) return null;
          return (
            <div
              key={session.appId}
              ref={(holder) => {
                if (holder) holders.current.set(session.appId, holder);
                else holders.current.delete(session.appId);
              }}
              inert
              // `m-0 p-0 border-0 bg-transparent` undo the popover defaults.
              className={cn(
                "fixed top-0 -left-[100000px] z-[5] m-0 h-[720px] w-[1024px] overflow-hidden rounded-[15px] border-0 bg-white p-0",
                "invisible",
              )}
            >
              <iframe
                key={session.run}
                ref={(frame) => {
                  if (frame) frames.current.set(session.appId, frame);
                  else frames.current.delete(session.appId);
                }}
                src={`${service.src}#${new URLSearchParams({
                  media: "1",
                  appOrigin:
                    typeof window === "undefined" ? "" : window.location.origin,
                })}`}
                title={service.label}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                allow="fullscreen; autoplay; encrypted-media"
                referrerPolicy="no-referrer"
                className="h-full w-full border-0"
              />
            </div>
          );
        })}
      {enabled && <MiniPlayer />}
      {enabled &&
        popOutWindow &&
        createPortal(
          <PopOutPlayer window={popOutWindow} />,
          popOutWindow.document.body,
        )}
    </ListenContext.Provider>
  );
}

/** Where Browse wants a listen app's frame to appear. */
export function ListenSlot({
  appId,
  inert = false,
}: {
  appId: string;
  inert?: boolean;
}) {
  const { registerSlot } = useListen();
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    registerSlot(appId, { element: ref.current, inert });
    return () => registerSlot(appId, null);
  }, [appId, inert, registerSlot]);
  return <div ref={ref} className="h-full w-full" />;
}

type PictureInPicture = {
  window: Window | null;
  requestWindow: (options: {
    width: number;
    height: number;
  }) => Promise<Window>;
};

/** Document Picture-in-Picture: Chrome and Edge on the desktop. */
function pictureInPicture(): PictureInPicture | null {
  return (
    (window as unknown as { documentPictureInPicture?: PictureInPicture })
      .documentPictureInPicture ?? null
  );
}

/**
 * Give the pop-out this page's styles and theme. It starts as a blank
 * document; the player is rendered into it from here, through a portal.
 */
function mirrorDocument(pip: Window) {
  const target = pip.document;
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const style = target.createElement("style");
      style.textContent = Array.from(
        sheet.cssRules,
        (rule) => rule.cssText,
      ).join("\n");
      target.head.append(style);
    } catch {
      if (!sheet.href) continue;
      const link = target.createElement("link");
      link.rel = "stylesheet";
      link.href = sheet.href;
      target.head.append(link);
    }
  }
  const copy = () => {
    for (const { name, value } of Array.from(
      document.documentElement.attributes,
    ))
      target.documentElement.setAttribute(name, value);
    target.body.className = document.body.className;
  };
  copy();
  // The theme can change while the pop-out is open.
  const observer = new MutationObserver(copy);
  observer.observe(document.documentElement, { attributes: true });
  pip.addEventListener("pagehide", () => observer.disconnect(), { once: true });
}

/** A colour from the artwork: the average, leaning on its most saturated pixels. */
async function tintOf(blob: Blob): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(blob, {
      resizeWidth: 24,
      resizeHeight: 24,
    });
    const canvas = new OffscreenCanvas(24, 24);
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const { data } = context.getImageData(0, 0, 24, 24);
    let r = 0;
    let g = 0;
    let b = 0;
    let total = 0;
    for (let i = 0; i < data.length; i += 4) {
      const max = Math.max(data[i], data[i + 1], data[i + 2]);
      const min = Math.min(data[i], data[i + 1], data[i + 2]);
      const saturation = max === 0 ? 0 : (max - min) / max;
      // Near-black and near-white say little about the colour of a cover.
      const weight =
        0.05 + saturation * saturation * (max > 40 && min < 235 ? 1 : 0.1);
      r += data[i] * weight;
      g += data[i + 1] * weight;
      b += data[i + 2] * weight;
      total += weight;
    }
    return `rgb(${Math.round(r / total)} ${Math.round(g / total)} ${Math.round(b / total)})`;
  } catch {
    return null;
  }
}
