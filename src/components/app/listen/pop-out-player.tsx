"use client";

import { useEffect, useSyncExternalStore } from "react";
import { ExperienceAppIcon } from "@/components/app/experience-app-icon";
import type { MediaCommand } from "@/lib/listen";
import { useListen } from "./listen-provider";
import {
  Artwork,
  Scrubber,
  Transport,
  Volume,
  canSeek,
  trackPosition,
  useNow,
} from "./player-parts";

/**
 * The pop-out: a Document Picture-in-Picture window that floats over every
 * tab and every other app. It is rendered from the site's own React tree
 * through a portal, so it is the same player — the same state, the same
 * buttons — in a window of its own. Tall, it is a cover with the controls
 * under it; squat, a single row.
 */
export function PopOutPlayer({ window: pip }: { window: Window }) {
  const listen = useListen();
  const track = listen.current;
  const appId = listen.currentId;
  const now = useNow(!!track?.state.playing, pip);
  const size = useSyncExternalStore(
    (onChange) => {
      pip.addEventListener("resize", onChange);
      return () => pip.removeEventListener("resize", onChange);
    },
    () => `${pip.innerWidth}x${pip.innerHeight}`,
    () => "0x0",
  );
  const [width, height] = size.split("x").map(Number);
  const tall = height >= 300 && height >= width * 0.9;
  const label =
    listen.services.find((service) => service.id === appId)?.label ?? "Music";

  const title = track?.state.title
    ? `${track.state.title}${track.state.artist ? ` · ${track.state.artist}` : ""}`
    : label;
  useEffect(() => setTitle(pip, title), [pip, title]);

  // Media keys work anywhere; these are for the window itself.
  useEffect(() => {
    if (!track || !appId) return;
    const send = (command: MediaCommand) => listen.command(appId, command);
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || !track || !appId)
        return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("[role='slider']")) return;
      const at = trackPosition(track, Date.now());
      if (event.key === " " || event.key === "k") {
        send({ action: track.state.playing ? "pause" : "play" });
      } else if (event.key === "n") {
        send({ action: "nexttrack" });
      } else if (event.key === "p") {
        send({ action: "previoustrack" });
      } else if (
        (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
        canSeek(track) &&
        at !== null
      ) {
        const step = event.key === "ArrowLeft" ? -10 : 10;
        send({
          action: "seekto",
          seekTime: Math.min(
            track.state.duration ?? at,
            Math.max(0, at + step),
          ),
        });
      } else return;
      event.preventDefault();
    }
    pip.document.addEventListener("keydown", onKey);
    return () => pip.document.removeEventListener("keydown", onKey);
  }, [pip, track, appId, listen]);

  if (!appId) return null;
  const send = (command: MediaCommand) => listen.command(appId, command);

  return (
    <div className="fixed inset-0 isolate flex overflow-hidden bg-neutral-950 text-white select-none">
      {track?.artworkUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={track.artworkUrl}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 size-full scale-125 object-cover opacity-55 blur-3xl saturate-150"
        />
      )}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-black/10 via-black/35 to-black/80"
        style={
          track?.tint
            ? {
                backgroundImage: `linear-gradient(to bottom, color-mix(in oklab, ${track.tint} 35%, transparent), rgb(0 0 0 / 0.45) 55%, rgb(0 0 0 / 0.85))`,
              }
            : undefined
        }
      />

      {!track ? (
        <div className="m-auto flex max-w-60 flex-col items-center gap-3 p-6 text-center">
          <ExperienceAppIcon id={appId} className="size-10" />
          <p className="font-semibold">{label} is open</p>
          <p className="text-sm text-white/70">
            Start something in {label} and it shows up here.
          </p>
        </div>
      ) : tall ? (
        <div className="flex min-h-0 w-full flex-col gap-4 p-5">
          <p className="flex items-center gap-1.5 text-xs font-medium text-white/70">
            <ExperienceAppIcon id={appId} className="size-3.5" />
            {label}
          </p>
          <div className="grid min-h-0 flex-1 place-items-center">
            <Artwork
              track={track}
              appId={appId}
              className="aspect-square h-full max-h-full max-w-full rounded-xl shadow-2xl shadow-black/50"
            />
          </div>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">
              {track.state.title || "Nothing playing"}
            </p>
            <p className="truncate text-sm text-white/70">
              {[track.state.artist, track.state.album]
                .filter(Boolean)
                .join(" · ") || label}
            </p>
          </div>
          {track.state.duration ? (
            <Scrubber track={track} now={now} onCommand={send} tone="light" />
          ) : null}
          <div className="flex justify-center">
            <Transport track={track} onCommand={send} size="lg" tone="light" />
          </div>
          <Volume track={track} onCommand={send} tone="light" />
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-4 p-3">
          <Artwork
            track={track}
            appId={appId}
            className="aspect-square h-full max-h-40 rounded-lg shadow-xl shadow-black/40"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="min-w-0">
              <p className="truncate font-semibold">
                {track.state.title || "Nothing playing"}
              </p>
              <p className="truncate text-sm text-white/70">
                {track.state.artist || label}
              </p>
            </div>
            {track.state.duration && height >= 140 ? (
              <Scrubber
                track={track}
                now={now}
                onCommand={send}
                tone="light"
                times={height >= 170}
              />
            ) : null}
            <Transport track={track} onCommand={send} tone="light" />
          </div>
        </div>
      )}
    </div>
  );
}

/** The pop-out's title bar names the track. */
function setTitle(pip: Window, title: string) {
  pip.document.title = title;
}
