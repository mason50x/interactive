#!/usr/bin/env node
/**
 * Regenerates `src/lib/games.catalogue.json` from the upstream Seraph repo.
 *
 * The catalogue is generated rather than hand-written because it has 300-odd
 * entries and every one of them has to agree with a directory that exists in
 * the asset bucket. Editing it by hand is how a tile ends up pointing at a
 * game nobody uploaded.
 *
 * Two things upstream supplies and we keep:
 *
 * - **Titles and genres.** `games/index.html` is the only place Seraph writes
 *   a human title for a slug; the directory names alone give you
 *   `geometrydashsky`.
 * - **Order.** That file is hand-ordered, most-played first — slope, subway
 *   surfers, flappy bird. That ordering is the only popularity signal that
 *   exists here, so it becomes `rank`, and the dashboard's "popular" row is
 *   just the head of it.
 *
 * One thing it supplies that we drop: console ROMs. See EXCLUDED_EXTENSIONS.
 *
 *   node scripts/build-catalogue.mjs
 */

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO = "a456pur/seraph";
const REF = "main";

/** Upstream's directory holding one subdirectory per game. */
const GAMES_PREFIX = "games";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "lib", "games.catalogue.json");

/**
 * Console ROM containers. A directory holding one of these is dropped from the
 * catalogue and never uploaded.
 *
 * Upstream's permission covers upstream's own work. It cannot cover a Nintendo
 * or Konami ROM, because those were never upstream's to license — so the test
 * is on the file, not on anyone's say-so. Dropping the directory (rather than
 * just the ROM inside it) is deliberate: the emulator shell left behind
 * without its ROM is a tile that loads to a black screen.
 */
const EXCLUDED_EXTENSIONS = [
  ".nds", ".gba", ".gbc", ".gb", ".z64", ".n64", ".v64", ".smc", ".sfc",
  ".nes", ".iso", ".cso", ".pce", ".ws", ".wsc", ".rom", ".sms", ".gg",
  ".32x", ".gen",
];

/**
 * Scene-release naming — `Altered Beast (USA, Europe).zip`. An extension is
 * not itself a signal (plenty of web games ship a `.zip`), but this naming is,
 * so it applies to any file rather than only archives: the Sega Mega Drive
 * ROMs here arrive as `Ecco the Dolphin (USA, Europe).md`.
 */
const SCENE_NAMING = /\((USA|Europe|Japan|World|En,)/;

/**
 * The definitive test, and the reason the two above are only a backstop.
 *
 * [EmulatorJS](https://emulatorjs.org) exists to run console ROMs and nothing
 * else, so a page that loads it *is* an emulator page whatever its ROM happens
 * to be called. Matching on the loader rather than on file extensions is what
 * closes the hole the extension list left: `pokemonunbound.zip` and
 * `f-zero-x.zip` carry no scene naming and no console extension, and sailed
 * straight through an earlier version of this script.
 *
 * It also removes the need to host EmulatorJS at all — those pages reach for
 * `../../storage/emulatorjs/`, which the migration does not upload.
 */
const EMULATOR_MARKERS = ["EJS_core", "EJS_gameUrl", "emulatorjs"];

/**
 * Upstream writes every title lower-case (`subway surfers`), which is a look
 * on their site and looks like a bug in ours. Cased here rather than in the
 * view so the stored title is the displayed one and nothing has to re-derive
 * it — the dashboard, the player's `<title>`, and search all read the field.
 *
 * Minor words stay down unless they lead. A word carrying an interior capital
 * is left exactly as upstream wrote it, which is what stops `OvO` becoming
 * `Ovo`. Digits are not a reason to leave a word alone — `paperio2` still
 * wants its leading capital — so only a letter counts.
 */
const MINOR_WORDS = new Set([
  "a", "an", "and", "at", "for", "in", "of", "on", "or", "the", "to", "vs", "with",
]);

function titleCase(value) {
  return value
    .split(" ")
    .map((word, index) => {
      if (/[A-Z]/.test(word.slice(1))) return word;
      if (index > 0 && MINOR_WORDS.has(word)) return word;
      return word.replace(/^[a-z]/, (character) => character.toUpperCase());
    })
    .join(" ");
}

/** Upstream's `data-genre` values include typos and one-off tags. The select
 *  element on their own page offers only the six on the right. */
const GENRE_ALIASES = {
  aracde: "arcade",
  simulator: "simulation",
  amorphous: "arcade",
  minecraft: "adventure",
  tetris: "puzzle",
  "": "arcade",
};

async function fetchText(path) {
  const url = `https://raw.githubusercontent.com/${REPO}/${REF}/${path}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GET ${url} -> ${response.status}`);
  return response.text();
}

async function fetchTree() {
  const url = `https://api.github.com/repos/${REPO}/git/trees/${REF}?recursive=1`;
  const response = await fetch(url, {
    headers: {
      accept: "application/vnd.github+json",
      // Unauthenticated is 60 requests/hour and this is one of them, but a
      // token raises it to 5000 and CI will want that.
      ...(process.env.GITHUB_TOKEN
        ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
        : {}),
    },
  });
  if (!response.ok) throw new Error(`GET ${url} -> ${response.status}`);
  const body = await response.json();
  if (body.truncated) {
    throw new Error("GitHub truncated the tree; cannot verify ROM exclusions.");
  }
  return body.tree;
}

function isRom(path) {
  const lower = path.toLowerCase();
  if (EXCLUDED_EXTENSIONS.some((extension) => lower.endsWith(extension))) return true;
  return SCENE_NAMING.test(path);
}

/**
 * Fetches each candidate's page and reports which ones load an emulator.
 *
 * One request per game, which is the cost of asking the only question that
 * actually settles it. Sixteen at a time keeps it under a minute against
 * raw.githubusercontent without tripping rate limits.
 *
 * A page that will not load is treated as an emulator page — that is the safe
 * direction to fail. Excluding a working game costs one tile; including a ROM
 * because a fetch timed out is the thing this script exists to prevent.
 *
 * But failing safe must not be able to fail *silently*. A bug here once made
 * every request throw, and because each failure quietly excluded its game the
 * script cheerfully reported an empty catalogue as a success. So failures are
 * counted, and enough of them aborts the run: a handful is upstream being
 * flaky, a third of them is this script being broken, and those two deserve
 * very different outcomes.
 */
const MAX_FETCH_FAILURE_RATIO = 0.1;

async function findEmulatorGames(slugs, concurrency = 16) {
  const emulator = new Set();
  const failures = [];
  const queue = [...slugs];

  async function worker() {
    for (let slug = queue.pop(); slug; slug = queue.pop()) {
      try {
        const html = await fetchText(`${GAMES_PREFIX}/${slug}/index.html`);
        if (EMULATOR_MARKERS.some((marker) => html.includes(marker))) {
          emulator.add(slug);
        }
      } catch (error) {
        failures.push(`${slug}: ${error.message}`);
        emulator.add(slug);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));

  if (failures.length > slugs.length * MAX_FETCH_FAILURE_RATIO) {
    throw new Error(
      `${failures.length} of ${slugs.length} game pages failed to fetch — ` +
        "too many to treat as flakiness.\n  " +
        failures.slice(0, 3).join("\n  "),
    );
  }
  if (failures.length > 0) {
    console.log(`  ${failures.length} pages unreachable, excluded as a precaution`);
  }

  return emulator;
}

/**
 * Pulls one entry per tile out of upstream's catalogue page.
 *
 * Matching the markup rather than parsing it is the right trade here: the file
 * is generated by the same hand that wrote every tile, so the shape is uniform,
 * and a change upstream that breaks this regex should fail loudly rather than
 * silently return a partial catalogue — which is what the count assertion in
 * `main` is for.
 */
function parseCatalogue(html) {
  const pattern =
    /<a[^>]*href="([^"/]+)\/index\.html"\s*>\s*<div class="button"[^>]*background-image:\s*url\('([^']+)'\)[^>]*data-genre="([^"]*)"[^>]*>\s*<h2>([^<]*)<\/h2>/gs;

  const entries = [];
  const seen = new Set();
  for (const match of html.matchAll(pattern)) {
    const [, slug, thumbnail, genre, title] = match;
    if (seen.has(slug)) continue;
    seen.add(slug);
    entries.push({
      slug,
      title: titleCase(title.split(/\s+/).join(" ").trim()),
      genre: GENRE_ALIASES[genre.trim()] ?? genre.trim(),
      thumbnail: thumbnail.split("/").pop(),
    });
  }
  return entries;
}

async function main() {
  const [html, tree] = await Promise.all([
    fetchText("games/index.html"),
    fetchTree(),
  ]);

  const entries = parseCatalogue(html);
  if (entries.length < 400) {
    throw new Error(
      `Parsed only ${entries.length} tiles from upstream — the markup likely changed.`,
    );
  }

  const romDirectories = new Set();
  const bytesByDirectory = new Map();
  for (const node of tree) {
    if (node.type !== "blob" || !node.path.startsWith("games/")) continue;
    const directory = node.path.split("/")[1];
    bytesByDirectory.set(
      directory,
      (bytesByDirectory.get(directory) ?? 0) + (node.size ?? 0),
    );
    if (isRom(node.path)) romDirectories.add(directory);
  }

  // Only the survivors of the cheap file-level test need fetching, which is a
  // few hundred requests rather than one per tile.
  const candidates = entries
    .map((entry) => entry.slug)
    .filter((slug) => !romDirectories.has(slug));
  const emulatorGames = await findEmulatorGames(candidates);

  const games = [];
  const excludedByFile = [];
  const excludedByEmulator = [];
  for (const [index, entry] of entries.entries()) {
    if (romDirectories.has(entry.slug)) {
      excludedByFile.push(entry.title);
      continue;
    }
    if (emulatorGames.has(entry.slug)) {
      excludedByEmulator.push(entry.title);
      continue;
    }
    games.push({ ...entry, rank: index, bytes: bytesByDirectory.get(entry.slug) ?? 0 });
  }

  await writeFile(OUT, `${JSON.stringify(games, null, 1)}\n`);

  const total = games.reduce((sum, game) => sum + game.bytes, 0);
  console.log(`upstream tiles      : ${entries.length}`);
  console.log(`excluded, ROM file  : ${excludedByFile.length}`);
  console.log(`excluded, emulator  : ${excludedByEmulator.length}`);
  console.log(`written             : ${games.length} games, ${(total / 1e9).toFixed(2)} GB`);
  console.log(`                    -> ${OUT}`);
  if (excludedByEmulator.length > 0) {
    console.log(`\nemulator pages dropped: ${excludedByEmulator.slice(0, 8).join(", ")}${
      excludedByEmulator.length > 8 ? ", …" : ""
    }`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
