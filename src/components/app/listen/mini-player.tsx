"use client";

import {
  ArrowTopRightOnSquareIcon,
  ArrowUpLeftIcon,
  ChevronDownIcon,
  XMarkIcon,
} from "@heroicons/react/20/solid";
import { useRouter } from "next/navigation";
import {
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from "react";
import { ExperienceAppIcon } from "@/components/app/experience-app-icon";
import type { MediaCommand } from "@/lib/listen";
import { readStoredJson, writeStoredJson } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { useListen } from "./listen-provider";
import {
  Artwork,
  Scrubber,
  Transport,
  trackPosition,
  useNow,
} from "./player-parts";

const FOLDED_KEY = "listen:folded";
const CORNER_KEY = "listen:corner";

type Corner = "tl" | "tr" | "bl" | "br";
const CORNERS: Record<Corner, string> = {
  tl: "top-4 left-4",
  tr: "top-4 right-4",
  bl: "bottom-4 left-4",
  br: "bottom-4 right-4",
};

function readCorner(): Corner {
  const stored = readStoredJson<string>(CORNER_KEY);
  // Top right by default: the bottom of the page is where Chat's composer is.
  return stored && stored in CORNERS ? (stored as Corner) : "tr";
}

/**
 * Drag the player to whichever corner is in the way least. It follows the
 * pointer, then settles in the corner nearest where it was let go.
 */
function useCornerDrag(onSettle: (corner: Corner) => void) {
  const [offset, setOffset] = useState<{ x: number; y: number } | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);
  const handlers = {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      if (event.button !== 0) return;
      // Buttons inside the handle are buttons; only a handle that is itself
      // a button drags from anywhere.
      const button = (event.target as Element).closest("button");
      if (button && button !== event.currentTarget) return;
      start.current = { x: event.clientX, y: event.clientY };
      moved.current = false;
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      if (!start.current) return;
      const x = event.clientX - start.current.x;
      const y = event.clientY - start.current.y;
      if (!moved.current && Math.hypot(x, y) < 5) return;
      moved.current = true;
      setOffset({ x, y });
    },
    onPointerUp(event: PointerEvent<HTMLElement>) {
      if (!start.current) return;
      start.current = null;
      setOffset(null);
      if (!moved.current) return;
      const view = event.currentTarget.ownerDocument.defaultView ?? window;
      onSettle(
        `${event.clientY < view.innerHeight / 2 ? "t" : "b"}${
          event.clientX < view.innerWidth / 2 ? "l" : "r"
        }` as Corner,
      );
    },
    onPointerCancel() {
      start.current = null;
      setOffset(null);
    },
  };
  const style: CSSProperties | undefined = offset
    ? {
        transform: `translate(${offset.x}px, ${offset.y}px)`,
        transition: "none",
      }
    : undefined;
  /** A click that ends a drag is not a click. */
  const wasDrag = () => {
    const was = moved.current;
    moved.current = false;
    return was;
  };
  return { handlers, style, dragging: offset !== null, wasDrag };
}

/**
 * The mini player: whatever a listen app is playing, in the corner of every
 * page in the app, until you look at the app itself. Folds down to a record
 * that keeps turning while it plays, and pops out into a window of its own.
 */
export function MiniPlayer() {
  const listen = useListen();
  const router = useRouter();
  const [folded, setFolded] = useState(
    () => readStoredJson<boolean>(FOLDED_KEY) === true,
  );
  const [corner, setCorner] = useState(readCorner);
  const drag = useCornerDrag((next) => {
    setCorner(next);
    writeStoredJson(CORNER_KEY, next);
  });
  const track = listen.current;
  const appId = listen.currentId;
  const now = useNow(!!track?.state.playing);

  if (!appId || listen.onScreen.includes(appId) || listen.popOut.window)
    return null;

  const label =
    listen.services.find((service) => service.id === appId)?.label ?? appId;
  const send = (command: MediaCommand) => listen.command(appId, command);
  const openApp = () => router.push(`/browse/${encodeURIComponent(appId)}`);
  const fold = (next: boolean) => {
    setFolded(next);
    writeStoredJson(FOLDED_KEY, next);
  };

  if (folded) {
    const duration = track?.state.duration ?? 0;
    const position = track ? (trackPosition(track, now) ?? 0) : 0;
    const fraction = duration ? Math.min(1, position / duration) : 0;
    return (
      <button
        type="button"
        onClick={() => {
          if (!drag.wasDrag()) fold(false);
        }}
        {...drag.handlers}
        style={drag.style}
        aria-label={`Show player: ${track?.state.title || label}`}
        title={track?.state.title || label}
        className={cn(
          "fixed z-[60] grid size-14 animate-in touch-none place-items-center rounded-full bg-popover shadow-xl ring-1 shadow-black/[0.18] ring-border transition-[scale] duration-300 fade-in-0 zoom-in-75 hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-95 [[data-pane]_&]:hidden",
          CORNERS[corner],
          drag.dragging && "cursor-grabbing",
        )}
      >
        <svg
          viewBox="0 0 56 56"
          aria-hidden="true"
          className="absolute inset-0 size-full -rotate-90"
        >
          <circle
            cx="28"
            cy="28"
            r="26.5"
            fill="none"
            strokeWidth="3"
            className="stroke-foreground/10"
          />
          <circle
            cx="28"
            cy="28"
            r="26.5"
            fill="none"
            strokeWidth="3"
            pathLength="100"
            strokeLinecap="round"
            strokeDasharray={`${fraction * 100} 100`}
            className="stroke-primary transition-[stroke-dasharray] duration-300"
            style={track?.tint ? { stroke: track.tint } : undefined}
          />
        </svg>
        <Artwork
          track={track}
          appId={appId}
          className={cn(
            "size-11 animate-[spin_12s_linear_infinite] rounded-full motion-reduce:animate-none",
            !track?.state.playing && "[animation-play-state:paused]",
          )}
        />
        <span
          aria-hidden="true"
          className="absolute size-2.5 rounded-full bg-popover ring-1 ring-border"
        />
      </button>
    );
  }

  return (
    <section
      aria-label={`${label} player`}
      style={drag.style}
      className={cn(
        "fixed isolate z-[60] w-[min(22rem,calc(100vw-2rem))] animate-in overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-xl shadow-black/[0.14] duration-300 fade-in-0 [[data-pane]_&]:hidden",
        CORNERS[corner],
        corner[0] === "t" ? "slide-in-from-top-4" : "slide-in-from-bottom-4",
      )}
    >
      {/* The cover, blurred out to the edges, and its colour under it. */}
      {track?.artworkUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={track.artworkUrl}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 size-full scale-150 object-cover opacity-25 blur-2xl saturate-150 dark:opacity-35"
        />
      )}
      {track?.tint && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-20 -left-16 -z-10 size-56 rounded-full opacity-25 blur-3xl"
          style={{ background: track.tint }}
        />
      )}

      <header
        {...drag.handlers}
        title="Drag to another corner"
        className={cn(
          "flex h-9 touch-none items-center gap-1.5 pr-1.5 pl-3",
          drag.dragging ? "cursor-grabbing" : "cursor-grab",
        )}
      >
        <ExperienceAppIcon id={appId} className="size-3.5" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">
          {label}
        </span>
        {listen.popOut.supported && (
          <HeaderButton
            label="Pop out — keep it on top of other tabs"
            onClick={listen.popOut.open}
          >
            <ArrowTopRightOnSquareIcon className="size-4" />
          </HeaderButton>
        )}
        <HeaderButton label={`Open ${label}`} onClick={openApp}>
          <ArrowUpLeftIcon className="size-4" />
        </HeaderButton>
        <HeaderButton label="Fold away" onClick={() => fold(true)}>
          <ChevronDownIcon className="size-4" />
        </HeaderButton>
        <HeaderButton
          label={`Stop and close ${label}`}
          onClick={() => listen.close(appId)}
        >
          <XMarkIcon className="size-4" />
        </HeaderButton>
      </header>

      {track ? (
        <div className="px-3 pb-2.5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={openApp}
              aria-label={`Open ${label}`}
              className="shrink-0 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Artwork
                track={track}
                appId={appId}
                className="size-14 rounded-lg shadow-md shadow-black/20"
              />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {track.state.title || "Nothing playing"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {[track.state.artist, track.state.album]
                  .filter(Boolean)
                  .join(" · ") || label}
              </p>
            </div>
            <Transport track={track} onCommand={send} />
          </div>
          {track.state.duration ? (
            <div className="mt-2">
              <Scrubber track={track} now={now} onCommand={send} />
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex items-center gap-3 px-3 pb-3">
          <Artwork track={null} appId={appId} className="size-14 rounded-lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{label} is open</p>
            <p className="text-xs text-muted-foreground">
              Start something and it plays here while you move around.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

function HeaderButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/[0.08] hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
    >
      {children}
    </button>
  );
}
