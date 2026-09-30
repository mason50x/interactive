/*global __uv*/
// The media bridge: what is playing in a framed music app, and a way to
// press its buttons from outside.
//
// Appended to the page engine (scripts/build-site.mjs), so it runs at the top
// of every proxied document before the site's own scripts. It stands down
// unless its parent is a launcher that asked for it (`#media=1`), which keeps
// it to the one document a music app plays in.
//
// Nothing here knows about Spotify or Apple Music. Both web players already
// describe themselves to the browser through the Media Session API — that is
// how the browser's own media controls show them — so the bridge listens to
// the same calls: the metadata they set, the position they report and the
// action handlers they register. The handlers are recorded, never replaced,
// so the browser's controls keep working exactly as before. A page that sets
// no position or registers no play/pause handler falls back to the media
// element that last played.
//
// State goes up by direct call on the same-origin launcher, which relays it
// to the app. Commands come back down the same way.
(() => {
  if (typeof window === "undefined" || !("mediaSession" in navigator)) return;
  let launcher = null;
  try {
    if (window.parent !== window && window.parent.__experienceMediaLauncher) launcher = window.parent;
  } catch {
    return;
  }
  if (!launcher) return;

  const session = navigator.mediaSession;
  const Session = Object.getPrototypeOf(session);
  const handlers = new Map();
  let position = null;
  let media = null;

  const setActionHandler = Session.setActionHandler;
  Session.setActionHandler = function (action, handler) {
    if (typeof handler === "function") handlers.set(action, handler);
    else handlers.delete(action);
    return setActionHandler.call(this, action, handler);
  };
  const setPositionState = Session.setPositionState;
  Session.setPositionState = function (state) {
    position = state && Number.isFinite(state.duration)
      ? { duration: state.duration, position: state.position ?? 0, rate: state.playbackRate || 1, at: Date.now() }
      : null;
    return setPositionState.call(this, state);
  };

  // Media events do not bubble, but they do capture. An element that was never
  // attached to the document is caught when it is told to play.
  const adopt = (event) => {
    if (event.target instanceof HTMLMediaElement) media = event.target;
  };
  for (const type of ["play", "playing", "pause", "durationchange", "volumechange", "ended"]) {
    window.addEventListener(type, adopt, true);
  }
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...args) {
    media = this;
    return play.apply(this, args);
  };

  const pageUrl = () => {
    try {
      return __uv.meta.url.href;
    } catch {
      return location.href;
    }
  };

  function largestArtwork(artwork) {
    let best = null;
    let bestSize = -1;
    for (const image of artwork || []) {
      const size = Math.max(0, ...String(image.sizes || "").split(/\s+/).map((entry) => parseInt(entry, 10) || 0));
      if (size > bestSize) {
        best = image;
        bestSize = size;
      }
    }
    if (!best?.src) return null;
    try {
      return new URL(best.src, pageUrl()).href;
    } catch {
      return null;
    }
  }

  // Artwork is fetched here, through the page's own proxied fetch, because the
  // app cannot reach the image hosts itself. It goes up as a Blob.
  let artworkSrc = null;
  let artwork = null;
  async function loadArtwork(src) {
    artworkSrc = src;
    artwork = null;
    if (!src) return;
    try {
      const response = await fetch(src);
      const blob = response.ok ? await response.blob() : null;
      if (artworkSrc === src && blob?.type.startsWith("image/")) {
        artwork = blob;
        send(true);
      }
    } catch {
      // No artwork is a state the player shows.
    }
  }

  function snapshot() {
    const metadata = session.metadata;
    const src = metadata ? largestArtwork(metadata.artwork) : null;
    if (src !== artworkSrc) void loadArtwork(src);
    const element = media;
    const declared = session.playbackState;
    const playing = declared === "playing" || (declared !== "paused" && !!element && !element.paused && !element.ended);
    let duration = null;
    let at = null;
    let rate = 1;
    if (position && position.duration > 0) {
      duration = position.duration;
      rate = position.rate;
      at = position.position;
      if (playing) at += ((Date.now() - position.at) / 1000) * rate;
    } else if (element && Number.isFinite(element.duration) && element.duration > 0) {
      duration = element.duration;
      at = element.currentTime;
      rate = element.playbackRate || 1;
    }
    return {
      title: metadata?.title || "",
      artist: metadata?.artist || "",
      album: metadata?.album || "",
      artworkSrc: src,
      playing,
      duration,
      position: at === null ? null : Math.max(0, duration ? Math.min(duration, at) : at),
      rate,
      actions: [...handlers.keys()],
      volume: element ? element.volume : null,
      muted: element ? element.muted : null,
    };
  }

  let last = "";
  function send(force = false) {
    const state = snapshot();
    // Position moves every tick; compare everything else, and let position
    // through on its own every few seconds so a drifting clock recovers.
    const key = JSON.stringify({ ...state, position: state.position === null ? null : Math.round(state.position / 5) });
    if (!force && key === last) return;
    last = key;
    try {
      launcher.__experienceMedia({ ...state, artwork, sentAt: Date.now() });
    } catch {
      // The launcher went away with its frame.
    }
  }

  for (const type of ["play", "playing", "pause", "seeked", "durationchange", "ended"]) {
    window.addEventListener(type, () => setTimeout(send, 0), true);
  }
  setInterval(send, 500);
  window.addEventListener("pagehide", () => {
    try {
      launcher.__experienceMedia(null);
    } catch {
      // Nothing to tell.
    }
  });

  function run(action, details = {}) {
    const handler = handlers.get(action);
    if (!handler) return false;
    handler({ action, ...details });
    return true;
  }

  window.__experienceMediaCommand = (command) => {
    if (!command || typeof command.action !== "string") return;
    const element = media;
    switch (command.action) {
      case "play":
        if (!run("play") && element) element.play().catch(() => {});
        break;
      case "pause":
        if (!run("pause") && element) element.pause();
        break;
      case "nexttrack":
      case "previoustrack":
        run(command.action);
        break;
      case "seekto": {
        const seekTime = Number(command.seekTime);
        if (!Number.isFinite(seekTime) || seekTime < 0) return;
        if (!run("seekto", { seekTime, fastSeek: false }) && element) element.currentTime = seekTime;
        if (position) position = { ...position, position: seekTime, at: Date.now() };
        break;
      }
      case "volume": {
        const value = Number(command.value);
        if (element && Number.isFinite(value)) {
          element.volume = Math.min(1, Math.max(0, value));
          if (element.volume > 0) element.muted = false;
        }
        break;
      }
      case "mute":
        if (element) element.muted = !!command.value;
        break;
      default:
        return;
    }
    setTimeout(() => send(true), 50);
    setTimeout(() => send(true), 400);
  };
  send(true);
})();
