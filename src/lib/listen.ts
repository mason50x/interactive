/**
 * Listen: music that keeps playing once you leave Browse.
 *
 * Spotify and Apple Music open in Browse like any other app — their own web
 * players, framed through the experience. What makes them different is that
 * their frames are owned by the app shell rather than the Browse page, so
 * they survive navigation, and that the experience's media bridge
 * (`experience/site/media.js`) reports what they are playing and presses
 * their buttons. That is all the mini player and the pop-out are: a view of
 * the bridge's state and a set of buttons that send it commands.
 *
 * This module is the vocabulary shared by both sides. It has no React in it.
 */

/** Apps that get the mini player. Their frames live in the shell. */
export const LISTEN_APPS: ReadonlySet<string> = new Set([
  "spotify",
  "apple-music",
]);

export function isListenApp(id: string) {
  return LISTEN_APPS.has(id);
}

/** What the bridge reports, as it reports it. */
export type BridgeState = {
  title: string;
  artist: string;
  album: string;
  artworkSrc: string | null;
  artwork: Blob | null;
  playing: boolean;
  /** Seconds, or `null` when the player reports no length. */
  duration: number | null;
  /** Seconds into the track when it was sent. */
  position: number | null;
  rate: number;
  /** Media Session actions the player registered handlers for. */
  actions: string[];
  /** The playing element's volume, or `null` when there is no element. */
  volume: number | null;
  muted: boolean | null;
  sentAt: number;
};

export type MediaCommand =
  | { action: "play" | "pause" | "nexttrack" | "previoustrack" }
  | { action: "seekto"; seekTime: number }
  | { action: "volume"; value: number }
  | { action: "mute"; value: boolean };

export const MEDIA_MESSAGE = {
  /** Launcher → app: the bridge's state, or `null` when the page left. */
  state: "experience-media",
  /** App → launcher: press a button. */
  command: "experience-media-command",
} as const;

/** Validate a relayed state; the frame is a third-party page. */
export function readBridgeState(value: unknown): BridgeState | null {
  if (!value || typeof value !== "object") return null;
  const state = value as Record<string, unknown>;
  const text = (key: string) =>
    typeof state[key] === "string" ? (state[key] as string).slice(0, 500) : "";
  const number = (key: string) =>
    typeof state[key] === "number" && Number.isFinite(state[key])
      ? (state[key] as number)
      : null;
  return {
    title: text("title"),
    artist: text("artist"),
    album: text("album"),
    artworkSrc: text("artworkSrc") || null,
    artwork:
      state.artwork instanceof Blob && state.artwork.type.startsWith("image/")
        ? state.artwork
        : null,
    playing: state.playing === true,
    duration: number("duration"),
    position: number("position"),
    rate: number("rate") ?? 1,
    actions: Array.isArray(state.actions)
      ? state.actions.filter((a): a is string => typeof a === "string")
      : [],
    volume: number("volume"),
    muted: typeof state.muted === "boolean" ? state.muted : null,
    sentAt: number("sentAt") ?? Date.now(),
  };
}

/** Where the track is now, from where it was when the bridge last spoke. */
export function positionAt(
  state: {
    position: number | null;
    duration: number | null;
    rate: number;
    playing: boolean;
  },
  receivedAt: number,
  now: number,
) {
  if (state.position === null) return null;
  const moved = state.playing ? ((now - receivedAt) / 1000) * state.rate : 0;
  const at = Math.max(0, state.position + moved);
  return state.duration ? Math.min(state.duration, at) : at;
}

export function formatTime(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) return "–:––";
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = String(whole % 60).padStart(2, "0");
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}`
    : `${minutes}:${rest}`;
}
