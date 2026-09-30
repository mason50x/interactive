import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test.use({ launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] } });

// One pixel, so the artwork has something to fetch.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

// The launcher relays whatever the bridge reports. Here it keeps it.
const LAUNCHER = `<!doctype html><script>
  window.states = [];
  window.__experienceMediaLauncher = true;
  window.__experienceMedia = (state) => window.states.push(state);
  window.command = (command) => document.querySelector("iframe").contentWindow.__experienceMediaCommand(command);
</script><iframe src="/player" allow="autoplay"></iframe>`;

// A stand-in for a web player: a detached audio element, described to the
// browser through Media Session the way Spotify and Apple Music do.
const PLAYER = `<!doctype html><script src="/media.js"></script><script>
  window.calls = [];
  const wav = (seconds) => {
  const rate = 8000, data = new Uint8Array(44 + rate * seconds);
  const view = new DataView(data.buffer);
  const text = (at, value) => [...value].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, "RIFF"); view.setUint32(4, 36 + rate * seconds, true); text(8, "WAVEfmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate, true); view.setUint16(32, 1, true);
  view.setUint16(34, 8, true); text(36, "data"); view.setUint32(40, rate * seconds, true);
  data.fill(128, 44);
  return URL.createObjectURL(new Blob([data], { type: "audio/wav" }));
  };
  const audio = new Audio(wav(30));
  const describe = (title) => {
    navigator.mediaSession.metadata = new MediaMetadata({
      title, artist: "The Testers", album: "Fixtures",
      artwork: [{ src: "/small.png", sizes: "64x64" }, { src: "/art.png", sizes: "512x512" }],
    });
  };
  describe("Song A");
  navigator.mediaSession.setActionHandler("play", () => { calls.push("play"); audio.play(); });
  navigator.mediaSession.setActionHandler("pause", () => { calls.push("pause"); audio.pause(); });
  navigator.mediaSession.setActionHandler("nexttrack", () => { calls.push("next"); describe("Song B"); });
  audio.play();
  // Spotify keeps a short muted clip playing beside the track. It must not
  // be mistaken for the music.
  const clip = new Audio(wav(7));
  clip.muted = true;
  clip.loop = true;
  setTimeout(() => clip.play(), 200);
</script>`;

test("the media bridge reports a web player and presses its buttons", async ({ page }) => {
  const bridge = await readFile(new URL("../site/media.js", import.meta.url));
  const server = createServer((request, response) => {
    const path = new URL(request.url, "http://localhost").pathname;
    const send = (type, body) => response.writeHead(200, { "Content-Type": type }).end(body);
    if (path === "/") send("text/html", LAUNCHER);
    else if (path === "/player") send("text/html", PLAYER);
    else if (path === "/media.js") send("text/javascript", bridge);
    else if (path === "/art.png") send("image/png", PNG);
    else response.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, resolve));
  try {
    await page.goto(`http://localhost:${server.address().port}/`);
    const latest = () => page.evaluate(() => {
      const state = window.states.at(-1);
      return state && { ...state, artwork: state.artwork ? state.artwork.type : null };
    });

    await expect.poll(latest).toMatchObject({
      title: "Song A",
      artist: "The Testers",
      album: "Fixtures",
      playing: true,
      duration: 30,
      artwork: "image/png",
    });
    expect((await latest()).artworkSrc).toMatch(/\/art\.png$/);
    expect((await latest()).actions).toEqual(["play", "pause", "nexttrack"]);

    const player = page.frames()[1];
    await page.evaluate(() => window.command({ action: "pause" }));
    await expect.poll(async () => (await latest()).playing).toBe(false);
    expect(await player.evaluate(() => window.calls)).toEqual(["pause"]);

    // No seek handler: the bridge moves the element itself.
    await page.evaluate(() => window.command({ action: "seekto", seekTime: 12 }));
    await expect.poll(async () => Math.round((await latest()).position)).toBe(12);

    await page.evaluate(() => window.command({ action: "volume", value: 0.25 }));
    await expect.poll(async () => (await latest()).volume).toBe(0.25);

    await page.evaluate(() => window.command({ action: "nexttrack" }));
    await expect.poll(async () => (await latest()).title).toBe("Song B");

    await page.evaluate(() => window.command({ action: "play" }));
    await expect.poll(async () => (await latest()).playing).toBe(true);
    expect(await player.evaluate(() => window.calls)).toEqual(["pause", "next", "play"]);
  } finally {
    server.close();
  }
});

test("the media bridge reads the time a player prints under its scrubber", async ({ page }) => {
  const bridge = await readFile(new URL("../site/media.js", import.meta.url));
  const server = createServer((request, response) => {
    const path = new URL(request.url, "http://localhost").pathname;
    const send = (type, body) => response.writeHead(200, { "Content-Type": type }).end(body);
    if (path === "/") send("text/html", LAUNCHER);
    else if (path === "/player") send("text/html", `<!doctype html><script src="/media.js"></script>
      <div data-testid="playback-position">1:38</div><div data-testid="playback-duration">3:44</div>
      <script>navigator.mediaSession.metadata = new MediaMetadata({ title: "Pink Skies" });</script>`);
    else if (path === "/media.js") send("text/javascript", bridge);
    else response.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, resolve));
  try {
    await page.goto(`http://localhost:${server.address().port}/`);
    await expect
      .poll(() => page.evaluate(() => {
        const state = window.states.at(-1);
        return state && { position: state.position, duration: state.duration };
      }))
      .toEqual({ position: 98, duration: 224 });
  } finally {
    server.close();
  }
});
