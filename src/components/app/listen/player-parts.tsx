"use client";

import {
  BackwardIcon,
  ForwardIcon,
  PauseIcon,
  PlayIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
} from "@heroicons/react/24/solid";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { ExperienceAppIcon } from "@/components/app/experience-app-icon";
import { formatTime, positionAt, type MediaCommand } from "@/lib/listen";
import { cn } from "@/lib/utils";
import type { NowPlaying } from "./listen-provider";

/** The clock a moving scrubber reads, from the window it is drawn in. */
export function useNow(running: boolean, win?: Window | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    // A pop-out keeps its own timers at full speed while the tab is hidden.
    const host = win ?? window;
    const timer = host.setInterval(() => setNow(Date.now()), 250);
    return () => host.clearInterval(timer);
  }, [running, win]);
  // Paused, the position does not move, so a stale clock reads the same.
  return now;
}

export function trackPosition(track: NowPlaying, now: number) {
  return positionAt(track.state, track.receivedAt, now);
}

export function canSeek(track: NowPlaying) {
  return (
    !!track.state.duration &&
    (track.state.actions.includes("seekto") || track.state.volume !== null)
  );
}

export function Artwork({
  track,
  appId,
  className,
}: {
  track: NowPlaying | null;
  appId: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden bg-muted",
        className,
      )}
      style={track?.tint ? { background: track.tint } : undefined}
    >
      {track?.artworkUrl ? (
        // A blob URL from the player; nothing for the image optimiser to do.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={track.artworkUrl}
          alt=""
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <ExperienceAppIcon id={appId} className="size-1/3" />
      )}
    </span>
  );
}

export function Transport({
  track,
  onCommand,
  size = "sm",
  tone = "default",
}: {
  track: NowPlaying;
  onCommand: (command: MediaCommand) => void;
  size?: "sm" | "lg";
  tone?: "default" | "light";
}) {
  const playing = track.state.playing;
  const has = (action: string) => track.state.actions.includes(action);
  const skip = cn(
    "grid place-items-center rounded-full transition-[background-color,opacity,scale] active:scale-90 disabled:opacity-35 disabled:active:scale-100 focus-visible:outline-2 focus-visible:outline-ring",
    tone === "light"
      ? "text-white hover:bg-white/15"
      : "text-foreground hover:bg-foreground/[0.08]",
    size === "lg" ? "size-12" : "size-9",
  );
  return (
    <div
      className={cn("flex items-center", size === "lg" ? "gap-4" : "gap-0.5")}
    >
      <button
        type="button"
        aria-label="Previous"
        title="Previous"
        disabled={!has("previoustrack")}
        onClick={() => onCommand({ action: "previoustrack" })}
        className={skip}
      >
        <BackwardIcon className={size === "lg" ? "size-6" : "size-4"} />
      </button>
      <button
        type="button"
        aria-label={playing ? "Pause" : "Play"}
        title={playing ? "Pause" : "Play"}
        onClick={() => onCommand({ action: playing ? "pause" : "play" })}
        className={cn(
          "grid place-items-center rounded-full shadow-sm transition-[scale,background-color] hover:scale-105 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          tone === "light"
            ? "bg-white text-black"
            : "bg-foreground text-background",
          size === "lg" ? "size-16" : "size-10",
        )}
      >
        {playing ? (
          <PauseIcon className={size === "lg" ? "size-7" : "size-5"} />
        ) : (
          <PlayIcon
            className={cn(
              "translate-x-px",
              size === "lg" ? "size-7" : "size-5",
            )}
          />
        )}
      </button>
      <button
        type="button"
        aria-label="Next"
        title="Next"
        disabled={!has("nexttrack")}
        onClick={() => onCommand({ action: "nexttrack" })}
        className={skip}
      >
        <ForwardIcon className={size === "lg" ? "size-6" : "size-4"} />
      </button>
    </div>
  );
}

/** A horizontal slider over `[0, max]`, dragged or stepped with the keys. */
function useTrackDrag(
  max: number,
  onCommit: (value: number) => void,
  onPreview?: (value: number | null) => void,
) {
  const [drag, setDrag] = useState<number | null>(null);
  const bar = useRef<HTMLDivElement>(null);
  const valueAt = (clientX: number) => {
    const box = bar.current?.getBoundingClientRect();
    if (!box || box.width === 0) return 0;
    return Math.min(1, Math.max(0, (clientX - box.left) / box.width)) * max;
  };
  const handlers = {
    onPointerDown(event: PointerEvent<HTMLDivElement>) {
      if (event.button !== 0) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      const value = valueAt(event.clientX);
      setDrag(value);
      onPreview?.(value);
    },
    onPointerMove(event: PointerEvent<HTMLDivElement>) {
      if (drag === null) return;
      const value = valueAt(event.clientX);
      setDrag(value);
      onPreview?.(value);
    },
    onPointerUp(event: PointerEvent<HTMLDivElement>) {
      if (drag === null) return;
      onCommit(valueAt(event.clientX));
      setDrag(null);
      onPreview?.(null);
    },
    onPointerCancel() {
      setDrag(null);
      onPreview?.(null);
    },
  };
  return { bar, drag, handlers };
}

export function Scrubber({
  track,
  now,
  onCommand,
  tone = "default",
  times = true,
}: {
  track: NowPlaying;
  now: number;
  onCommand: (command: MediaCommand) => void;
  tone?: "default" | "light";
  times?: boolean;
}) {
  const duration = track.state.duration ?? 0;
  const seekable = canSeek(track);
  const seek = (seekTime: number) =>
    onCommand({ action: "seekto", seekTime: Math.round(seekTime * 10) / 10 });
  const { bar, drag, handlers } = useTrackDrag(duration, seek);
  const position = drag ?? trackPosition(track, now);
  const fraction = duration && position !== null ? position / duration : 0;
  return (
    <div className="w-full">
      <div
        ref={bar}
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(position ?? 0)}
        aria-valuetext={`${formatTime(position)} of ${formatTime(duration || null)}`}
        aria-disabled={!seekable}
        tabIndex={seekable ? 0 : -1}
        onKeyDown={(event) => {
          if (!seekable || position === null) return;
          const step = event.shiftKey ? 30 : 5;
          if (event.key === "ArrowLeft") seek(Math.max(0, position - step));
          else if (event.key === "ArrowRight")
            seek(Math.min(duration, position + step));
          else return;
          event.preventDefault();
          event.stopPropagation();
        }}
        {...(seekable ? handlers : {})}
        className={cn(
          "group/scrub relative flex h-4 touch-none items-center outline-none",
          seekable && "cursor-pointer",
        )}
      >
        <div
          className={cn(
            "relative h-1 w-full overflow-hidden rounded-full transition-[height] group-hover/scrub:h-1.5 group-focus-visible/scrub:h-1.5",
            tone === "light" ? "bg-white/25" : "bg-foreground/15",
            drag !== null && "h-1.5",
          )}
        >
          <div
            className={cn(
              "absolute inset-y-0 left-0 rounded-full",
              tone === "light" ? "bg-white" : "bg-foreground",
            )}
            style={{ width: `${fraction * 100}%` }}
          />
        </div>
        {seekable && (
          <span
            aria-hidden="true"
            className={cn(
              "absolute size-3 -translate-x-1/2 scale-0 rounded-full shadow transition-[scale] group-hover/scrub:scale-100 group-focus-visible/scrub:scale-100",
              tone === "light" ? "bg-white" : "bg-foreground",
              drag !== null && "scale-100",
            )}
            style={{ left: `${fraction * 100}%` }}
          />
        )}
      </div>
      {times && (
        <div
          className={cn(
            "mt-0.5 flex justify-between text-[0.6875rem] tabular-nums",
            tone === "light" ? "text-white/70" : "text-muted-foreground",
          )}
        >
          <span>{formatTime(position)}</span>
          <span>
            {duration && position !== null
              ? `-${formatTime(Math.max(0, duration - position))}`
              : formatTime(null)}
          </span>
        </div>
      )}
    </div>
  );
}

export function Volume({
  track,
  onCommand,
  tone = "default",
}: {
  track: NowPlaying;
  onCommand: (command: MediaCommand) => void;
  tone?: "default" | "light";
}) {
  const volume = track.state.volume ?? 1;
  const muted = track.state.muted === true || volume === 0;
  const set = (value: number) =>
    onCommand({ action: "volume", value: Math.round(value * 100) / 100 });
  const { bar, drag, handlers } = useTrackDrag(1, set, (value) => {
    if (value !== null) set(value);
  });
  if (track.state.volume === null) return null;
  const shown = drag ?? (muted ? 0 : volume);
  return (
    <div className="flex w-full items-center gap-2">
      <button
        type="button"
        aria-label={muted ? "Unmute" : "Mute"}
        title={muted ? "Unmute" : "Mute"}
        onClick={() =>
          muted && volume === 0
            ? set(0.5)
            : onCommand({ action: "mute", value: !muted })
        }
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-ring",
          tone === "light"
            ? "text-white/80 hover:bg-white/15"
            : "text-muted-foreground hover:bg-foreground/[0.08] hover:text-foreground",
        )}
      >
        {muted ? (
          <SpeakerXMarkIcon className="size-4" />
        ) : (
          <SpeakerWaveIcon className="size-4" />
        )}
      </button>
      <div
        ref={bar}
        role="slider"
        aria-label="Volume"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(shown * 100)}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") set(Math.max(0, shown - 0.1));
          else if (event.key === "ArrowRight") set(Math.min(1, shown + 0.1));
          else return;
          event.preventDefault();
          event.stopPropagation();
        }}
        {...handlers}
        className="group/volume relative flex h-4 flex-1 cursor-pointer touch-none items-center outline-none"
      >
        <div
          className={cn(
            "relative h-1 w-full overflow-hidden rounded-full",
            tone === "light" ? "bg-white/25" : "bg-foreground/15",
          )}
        >
          <div
            className={cn(
              "absolute inset-y-0 left-0 rounded-full",
              tone === "light" ? "bg-white" : "bg-foreground",
            )}
            style={{ width: `${shown * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
