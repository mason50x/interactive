"use client";

import { useEffect, useRef } from "react";
import type { MediaCommand } from "@/lib/listen";
import type { NowPlaying } from "./listen-provider";

/**
 * The tab's own media session, standing in for the framed player's.
 *
 * Chrome opens a pop-out by itself when you switch tabs — automatic
 * picture-in-picture — but only for media playing in the top-level page,
 * and the music plays in a frame. So while it plays, this page plays a
 * 25 Hz tone far below anything a speaker or an ear picks up: enough for
 * Chrome to count the page as audible, and nothing for the listener. The
 * session describes the track and routes the media keys back to the
 * player, so the browser's controls keep working, and its
 * `enterpictureinpicture` handler opens the same pop-out as the button.
 *
 * Chrome also wants the site to be one you play media on often, or to be
 * allowed automatic picture-in-picture in its settings. Until then, the
 * button is the way in.
 */
export function useTabMediaSession({
  active,
  track,
  command,
  popOut,
}: {
  active: boolean;
  track: NowPlaying | null;
  command: (command: MediaCommand) => void;
  popOut: () => void;
}) {
  const latest = useRef({ command, popOut, track });
  useEffect(() => {
    latest.current = { command, popOut, track };
  });

  const playing = active && !!track?.state.playing;
  const tone = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    if (!playing) {
      tone.current?.pause();
      return;
    }
    tone.current ??= Object.assign(new Audio(toneUrl()), { loop: true });
    // Needs a click somewhere in the page first; the music itself did too.
    tone.current.play().catch(() => {});
  }, [playing]);
  useEffect(() => () => tone.current?.pause(), []);

  const title = track?.state.title ?? "";
  const artist = track?.state.artist ?? "";
  const album = track?.state.album ?? "";
  const artworkUrl = track?.artworkUrl ?? null;
  const label = track?.label ?? "";
  useEffect(() => {
    if (!active || !("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = track
      ? new MediaMetadata({
          title: title || label,
          artist,
          album,
          artwork: artworkUrl ? [{ src: artworkUrl, sizes: "512x512" }] : [],
        })
      : null;
    // `track` itself is read only for whether there is one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, !!track, title, artist, album, artworkUrl, label]);

  const state = track?.state;
  useEffect(() => {
    if (!active || !("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    session.playbackState = state ? (state.playing ? "playing" : "paused") : "none";
    if (!state?.duration || state.position === null) return;
    try {
      session.setPositionState({
        duration: state.duration,
        position: Math.min(state.duration, state.position),
        playbackRate: state.rate || 1,
      });
    } catch {
      // A player can briefly report a position past its end.
    }
  }, [active, state]);

  useEffect(() => {
    if (!active || !("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    const send = (command: MediaCommand) => latest.current.command(command);
    const handlers: [string, MediaSessionActionHandler][] = [
      ["play", () => send({ action: "play" })],
      ["pause", () => send({ action: "pause" })],
      ["nexttrack", () => send({ action: "nexttrack" })],
      ["previoustrack", () => send({ action: "previoustrack" })],
      [
        "seekto",
        (details) => {
          if (details.seekTime != null)
            send({ action: "seekto", seekTime: details.seekTime });
        },
      ],
      ["enterpictureinpicture", () => latest.current.popOut()],
    ];
    const set = (action: string, handler: MediaSessionActionHandler | null) => {
      try {
        session.setActionHandler(action as MediaSessionAction, handler);
      } catch {
        // Not every browser knows every action.
      }
    };
    for (const [action, handler] of handlers) set(action, handler);
    return () => {
      for (const [action] of handlers) set(action, null);
      session.metadata = null;
      session.playbackState = "none";
    };
  }, [active]);
}

let tone: string | null = null;

/** One second of a 25 Hz sine at −48 dBFS, 16-bit, looping seamlessly. */
function toneUrl() {
  if (tone) return tone;
  const rate = 8000;
  const samples = rate;
  const data = new DataView(new ArrayBuffer(44 + samples * 2));
  const text = (at: number, value: string) =>
    [...value].forEach((c, i) => data.setUint8(at + i, c.charCodeAt(0)));
  text(0, "RIFF");
  data.setUint32(4, 36 + samples * 2, true);
  text(8, "WAVEfmt ");
  data.setUint32(16, 16, true);
  data.setUint16(20, 1, true);
  data.setUint16(22, 1, true);
  data.setUint32(24, rate, true);
  data.setUint32(28, rate * 2, true);
  data.setUint16(32, 2, true);
  data.setUint16(34, 16, true);
  text(36, "data");
  data.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++) {
    const value = Math.sin((2 * Math.PI * 25 * i) / rate) * 0.004 * 32767;
    data.setInt16(44 + i * 2, Math.round(value), true);
  }
  tone = URL.createObjectURL(new Blob([data.buffer], { type: "audio/wav" }));
  return tone;
}
