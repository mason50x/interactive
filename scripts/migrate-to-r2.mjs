#!/usr/bin/env node
/**
 * Stages the hosted game bundles and pushes them to the R2 bucket.
 *
 * Run once to fill an empty bucket, and again whenever
 * `scripts/build-catalogue.mjs` changes what ships — it is a sync, not a copy,
 * so a second run uploads only what differs and deletes what left the
 * catalogue.
 *
 *   node scripts/migrate-to-r2.mjs --dry-run   # plan only, touches nothing
 *   node scripts/migrate-to-r2.mjs
 *
 * ## Why not just deploy the files
 *
 * There are ~17,000 of them and 4.85 GB. Vercel caps a deployment at 15,000
 * files, and every byte served would bill as Fast Data Transfer against a
 * 100 GB monthly allowance — one visitor working through the larger titles
 * moves a quarter of a gigabyte. R2 charges nothing for egress, so the bundles
 * live there and the deployment stays small. `src/lib/assets.ts` is the only
 * part of the app that knows where "there" is.
 *
 * ## What gets staged
 *
 * Only the directories named in `src/lib/activities.catalogue.json`, the tile art,
 * and `storage/ruffle` — see `RUFFLE_SOURCE`. Not upstream's whole tree: its
 * `apps/` and `seraphim/` directories are the proxy and site chrome we do not
 * serve, the rest of `storage/` is theirs, and the ROM-bearing game
 * directories were already dropped by the catalogue generator. Staging from
 * the catalogue rather than from a full clone is what makes those exclusions
 * structural — a directory that is not in the catalogue is never fetched, so
 * it cannot be uploaded by accident.
 *
 * That also means the checkout is sparse: git fetches blobs for the 318
 * directories we asked for and skips the rest, which is a meaningful saving
 * over cloning 7.7 GB to keep 4.85.
 *
 * ## What gets rewritten
 *
 * Every game's HTML, on the way through — see `patchGameHtml`. Upstream's
 * pages carry its own Google Analytics tag, and shipping them unmodified would
 * report our users' game activity to a third party.
 */

import { spawn } from "node:child_process";
import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CATALOGUE = join(ROOT, "src", "lib", "activities.catalogue.json");

/**
 * Where the upstream checkout is staged, and deliberately not a temp dir.
 *
 * Materialising it costs ~5 GB over a partial clone's lazy blob fetch, which
 * is several minutes and by far the slowest step. Anything that goes wrong
 * after it — a patch rule that needs widening, a credential that expired —
 * should cost seconds to retry, not another full download. So the checkout
 * persists under `.cache/` (already gitignored) and is reused when it matches
 * the catalogue.
 *
 * `--fresh` forces a re-clone; delete the directory to reclaim the space.
 */
const STAGING = join(ROOT, ".cache", "seraph-staging");

const UPSTREAM = "https://github.com/a456pur/seraph.git";
const UPSTREAM_REF = "main";

/** Upstream's tile art, and where it lands: the repo, not the bucket. Under
 *  2 MB in total, so it ships with the code — see `THUMBNAIL_PATH` in
 *  `src/lib/activity.ts`. */
const THUMBNAILS_SOURCE = "images/thumbnails";
const PUBLIC_THUMBNAILS = join(ROOT, "public", "thumbnails");

/** Upstream Seraph lays its bundles out under `games/<slug>` — that is the
 *  sparse-checkout path and the staging layout, so it is fixed by upstream. */
const UPSTREAM_PREFIX = "games";

/** Prefix the bundles land under in the bucket. Must match `ACTIVITIES_PREFIX`
 *  in `src/lib/assets.ts`, which is what builds the URLs to read them back.
 *  Deliberately not `games/`: the client carries no such path — see the note
 *  in `src/lib/assets.ts`. rclone copies local `<staging>/games` into this
 *  destination prefix, so the two names differ on purpose. */
const BUCKET_PREFIX = "activities";

/**
 * Ruffle, the Flash emulator, and the one path outside `games/` we upload.
 *
 * 152 of the 318 titles are `.swf` — including Papa's Pizzaria and Papa's
 * Burgeria, which sit fourth and fifth on the popular shelf — and no browser
 * has run Flash natively since 2020. Upstream's game pages try unpkg first and
 * fall back to this local copy; `patchGameHtml` inverts that so the bucket is
 * the only source, because a tile that works or not depending on whether a
 * third-party CDN is reachable is not a tile that works.
 *
 * It must land at exactly this path: the game pages reach it with
 * `../../storage/ruffle/ruffle.js`, relative to `games/<slug>/index.html`.
 */
const RUFFLE_SOURCE = "storage/ruffle";

const DRY_RUN = process.argv.includes("--dry-run");
const FRESH = process.argv.includes("--fresh");

/**
 * Credentials. All four are required, and none of them belongs in `.env.local`
 * — that file is pulled from Vercel and read by the app, which has no business
 * holding write access to the bucket. Export them into the shell for the one
 * command instead.
 */
const REQUIRED_ENV = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
];

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${command} exited ${code}`)),
    );
  });
}

async function has(command) {
  try {
    await run(command, ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function bytes(value) {
  return `${(value / 1e9).toFixed(2)} GB`;
}

/**
 * Rewrites one game's HTML on the way into the bucket.
 *
 * Upstream templates the same header into all 318 pages, and two things in it
 * must not be served to our users:
 *
 * - **Their Google Analytics property.** Every page carries the same
 *   measurement id, so shipping these unmodified would report the game
 *   activity of every signed-in user to a third party we do not control. This
 *   is the reason the patch step exists at all.
 * - **Their tab-cloaking helper.** It lives under `storage/js`, which we do
 *   not upload, so the tag would 404 on every load even if we wanted it.
 *
 * And one thing is rewritten rather than removed: the Ruffle loader, pointed
 * at our own copy instead of unpkg. See `RUFFLE_SOURCE`.
 *
 * Deliberately string surgery rather than a DOM parse. The input is 318 copies
 * of one template, the three targets are unambiguous, and the verification is
 * a grep over the result — `assertPatched` fails the run if any survives, so a
 * template change upstream stops the migration instead of quietly leaking.
 */
const GTAG_SHIM = "<script>window.dataLayer=[];window.gtag=function(){};</script>";

/**
 * Puts the shim as early in the document as the markup allows.
 *
 * `<head>` is the obvious home and most pages have one, but not all: `stack`
 * ships minified as `<!doctypehtml><html lang=en><meta charset=UTF-8>` with no
 * head element at all, and a head-only rule silently does nothing there. Each
 * fallback is a step further out, ending at "give up and prepend", which is
 * still valid — browsers hoist a leading script into the implied head.
 */
function injectEarly(html, snippet) {
  for (const anchor of [/<head[^>]*>/i, /<html[^>]*>/i, /<!doctype[^>]*>/i]) {
    const match = anchor.exec(html);
    if (match) {
      const at = match.index + match[0].length;
      return html.slice(0, at) + snippet + html.slice(at);
    }
  }
  return snippet + html;
}

export function patchGameHtml(html) {
  // Tracked separately from the other rewrites: the shim is only warranted
  // when a `gtag` definition was actually removed. A page that merely lost its
  // cloak tag has nothing to strand, and injecting there would edit pages that
  // did not need editing.
  const deanalysed = html
    .replace(/<script[^>]*googletagmanager\.com[^>]*>\s*<\/script>/gi, "")
    .replace(/<script>\s*window\.dataLayer[\s\S]*?<\/script>/gi, "");
  const removedAnalytics = deanalysed !== html;

  const patched = deanalysed
    .replace(/<script[^>]*cloak\.js[^>]*>\s*<\/script>/gi, "")
    .replace(
      /(['"])https:\/\/unpkg\.com\/@ruffle-rs\/ruffle\1/g,
      `'../../${RUFFLE_SOURCE}/ruffle.js'`,
    );

  // Removing the definitions can strand a call. `basketbrosio` carries two
  // analytics blocks — Seraph's and the game author's original — and its own
  // game code calls `gtag(...)` on a scored basket, hundreds of lines away
  // from either. Deleting the tracker without this shim turns that into a
  // ReferenceError partway through play, which is a worse outcome than the
  // tracking was.
  return removedAnalytics ? injectEarly(patched, GTAG_SHIM) : patched;
}

/**
 * Anything here surviving the patch means upstream changed its template and
 * the regexes above no longer match what they were written against.
 *
 * Note how specific the Ruffle entry is. A blanket `unpkg.com` was the first
 * attempt and it was wrong: `ballisticchickens` loads the Kaboom engine from
 * unpkg, which is a real dependency of that game and nothing to do with Flash.
 * The rule has to name the thing being rewritten, or it fails the run over
 * something it was never rewriting.
 *
 * Other games do pull scripts from third-party CDNs — jsdelivr, cdnjs, jQuery
 * — and those are left alone. They are upstream's dependencies, they are a
 * handful of games, and vendoring them is a separate decision from getting the
 * analytics out.
 */
const FORBIDDEN = [
  // The only one that is actually a beacon. A surviving `gtag(` call is not,
  // now that the shim above makes it a no-op — and forbidding it would fail
  // the run over a game's own scoring code.
  "googletagmanager",
  "cloak.js",
  "unpkg.com/@ruffle-rs",
];

function assertPatched(path, html) {
  const found = FORBIDDEN.filter((token) => html.includes(token));
  if (found.length > 0) {
    throw new Error(
      `${path} still contains ${found.join(", ")} after patching.\n` +
        "Upstream's page template has changed — update patchGameHtml.",
    );
  }
}

async function main() {
  const games = JSON.parse(await readFile(CATALOGUE, "utf8"));
  const planned = games.reduce((sum, game) => sum + game.bytes, 0);

  console.log(`catalogue : ${games.length} games, ${bytes(planned)}`);
  console.log(`mode      : ${DRY_RUN ? "dry run" : "live"}\n`);

  if (!(await has("git"))) throw new Error("git is not installed.");
  if (!(await has("rclone"))) {
    throw new Error(
      "rclone is not installed. It handles the 17,000-file transfer with " +
        "parallelism, resume, and checksum verification that a hand-rolled " +
        "uploader would not.\n  brew install rclone",
    );
  }

  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `Missing credentials: ${missing.join(", ")}\n` +
        "These come from the R2 API token — see the R2 section of README.md.",
    );
  }

  const staging = STAGING;
  if (FRESH) await rm(staging, { recursive: true, force: true });

  // The checkout is reusable, but only if it already holds every directory the
  // current catalogue names — otherwise a catalogue that grew since the last
  // run would silently ship without its new games.
  let reusable = false;
  try {
    await stat(join(staging, ".git"));
    await Promise.all(
      games.map((game) =>
        stat(join(staging, UPSTREAM_PREFIX, game.slug, "index.html")),
      ),
    );
    reusable = true;
  } catch {
    reusable = false;
  }

  console.log(`staging   : ${staging}${reusable ? " (reusing)" : ""}\n`);

  {
    if (reusable) {
      console.log("→ reusing existing checkout, skipping fetch");
      // Patching rewrites files in place, so a reused tree may already be
      // patched from a previous run. Discarding local modifications puts it
      // back to upstream's bytes, which is what the patch step expects and
      // what makes `assertPatched` mean something on a re-run.
      await run("git", ["-C", staging, "checkout", "--", "."]);
    } else {
      await rm(staging, { recursive: true, force: true });
      await mkdir(dirname(staging), { recursive: true });

      // `--filter=blob:none` defers file contents until checkout, and
      // `--no-checkout` means nothing is materialised before the sparse cone
      // is set. Together they are what keeps this from pulling the whole
      // 7.7 GB.
      console.log("→ fetching upstream metadata");
      await run("git", [
        "clone", "--depth", "1", "--filter=blob:none", "--no-checkout",
        "--branch", UPSTREAM_REF, UPSTREAM, staging,
      ]);

      console.log("\n→ selecting catalogue directories");
      await run("git", ["-C", staging, "sparse-checkout", "init", "--cone"]);
      await run("git", [
        "-C", staging, "sparse-checkout", "set",
        THUMBNAILS_SOURCE,
        RUFFLE_SOURCE,
        ...games.map((game) => `${UPSTREAM_PREFIX}/${game.slug}`),
      ]);

      console.log("\n→ materialising files");
      await run("git", ["-C", staging, "checkout", UPSTREAM_REF]);
    }

    // A directory in the catalogue that upstream has since renamed or removed
    // would otherwise surface as a tile that 404s. Catch it here, where the
    // fix is to re-run the catalogue generator, rather than in production.
    const absent = [];
    for (const game of games) {
      try {
        await stat(join(staging, UPSTREAM_PREFIX, game.slug, "index.html"));
      } catch {
        absent.push(game.slug);
      }
    }
    if (absent.length > 0) {
      throw new Error(
        `${absent.length} catalogue entries have no index.html upstream ` +
          `(${absent.slice(0, 5).join(", ")}${absent.length > 5 ? ", …" : ""}).\n` +
          "Re-run scripts/build-catalogue.mjs.",
      );
    }
    console.log(`  ${games.length} bundles present`);

    console.log("\n→ patching game pages");
    let patched = 0;
    for (const game of games) {
      const directory = join(staging, UPSTREAM_PREFIX, game.slug);
      for (const file of await readdir(directory, { recursive: true })) {
        if (!file.endsWith(".html")) continue;
        const path = join(directory, file);
        const original = await readFile(path, "utf8");
        const rewritten = patchGameHtml(original);
        assertPatched(join(UPSTREAM_PREFIX, game.slug, file), rewritten);
        if (rewritten !== original) {
          await writeFile(path, rewritten);
          patched += 1;
        }
      }
    }
    console.log(`  ${patched} pages rewritten (analytics and cloaking removed)`);

    // rclone reads its whole config from the environment when given these,
    // so nothing is written to ~/.config/rclone and no secret outlives the
    // process.
    const rcloneEnv = {
      ...process.env,
      RCLONE_CONFIG_R2_TYPE: "s3",
      RCLONE_CONFIG_R2_PROVIDER: "Cloudflare",
      RCLONE_CONFIG_R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
      RCLONE_CONFIG_R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
      RCLONE_CONFIG_R2_ENDPOINT: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      // The bucket is created in the dashboard, and the API token is scoped
      // to it — so the pre-flight bucket check rclone does by default would
      // fail on a permission it deliberately does not have.
      RCLONE_CONFIG_R2_NO_CHECK_BUCKET: "true",
      // R2 has no ACLs. Sending one makes it reject the upload, and rclone
      // sends `private` unless told the field is empty.
      RCLONE_CONFIG_R2_ACL: "",
    };

    const flags = [
      "--transfers", "32",
      "--checkers", "32",
      // R2 bills per class-A operation; the default per-file HEAD before each
      // copy doubles that for no benefit on a first upload.
      "--size-only",
      "--progress",
      "--stats", "10s",
      ...(DRY_RUN ? ["--dry-run"] : []),
    ];

    const bucket = process.env.R2_BUCKET;

    console.log("\n→ syncing bundles");
    await run(
      "rclone",
      [
        "sync",
        join(staging, UPSTREAM_PREFIX),
        `R2:${bucket}/${BUCKET_PREFIX}`,
        // Cone-mode sparse checkout brings down files sitting beside the
        // directories we asked for, which includes upstream's own catalogue
        // page. Serving it would publish a game list linking to the titles
        // this migration deliberately excluded, every one of them a 404.
        "--exclude", "/index.html",
        ...flags,
      ],
      { env: rcloneEnv },
    );

    console.log("\n→ syncing ruffle");
    await run(
      "rclone",
      [
        "sync",
        join(staging, RUFFLE_SOURCE),
        `R2:${bucket}/${RUFFLE_SOURCE}`,
        ...flags,
      ],
      { env: rcloneEnv },
    );

    // Thumbnails go into the repo, not the bucket — see `THUMBNAIL_PATH` in
    // `src/lib/activity.ts` for why. Refreshed here rather than by hand so that
    // one command keeps the art, the catalogue, and the bundles agreeing:
    // a game added upstream cannot end up with a tile pointing at art nobody
    // copied.
    console.log("\n→ refreshing public/thumbnails");
    if (DRY_RUN) {
      console.log(`  would copy ${games.length} files`);
    } else {
      await mkdir(PUBLIC_THUMBNAILS, { recursive: true });

      // Anything not in the current catalogue is removed, so art for a game
      // dropped by the ROM or emulator filters does not linger in the repo.
      const wanted = new Set(games.map((game) => game.thumbnail));
      for (const existing of await readdir(PUBLIC_THUMBNAILS)) {
        if (!wanted.has(existing)) {
          await rm(join(PUBLIC_THUMBNAILS, existing), { force: true });
        }
      }

      let copied = 0;
      for (const game of games) {
        await copyFile(
          join(staging, THUMBNAILS_SOURCE, game.thumbnail),
          join(PUBLIC_THUMBNAILS, game.thumbnail),
        );
        copied += 1;
      }
      console.log(`  ${copied} files, committed with the code`);
    }

    console.log(
      DRY_RUN
        ? "\nDry run complete — nothing was uploaded."
        : `\nDone. ${games.length} games in R2:${bucket}.`,
    );
  }

  // The checkout is deliberately left in place — see STAGING. It is the
  // expensive half of this script, and keeping it is what makes a retry after
  // a widened patch rule cost seconds instead of another five gigabytes.
  console.log(`\nCheckout kept at ${staging}`);
  console.log("  reused automatically next run; --fresh re-clones; delete it to reclaim ~5 GB.");

  if (!DRY_RUN) {
    // Learned the hard way. R2 returns `cache-control: max-age=14400` on a
    // 404 exactly as it does on a hit, so a game opened while this script was
    // still running cached its missing assets — at the Cloudflare edge and in
    // the browser — for four hours after they finished uploading. The game
    // then stays broken long after the bucket is correct, which looks like a
    // failed migration and is not one.
    console.log(
      "\nIf anything was loaded from the bucket while this was running, purge" +
        "\nthe Cloudflare cache for the asset zone before testing: R2 serves" +
        "\n404s with a four-hour max-age, so those misses are sticky." +
        "\n  Dashboard -> the asset zone -> Caching -> Configuration -> Purge Everything",
    );
  }
}

// Only when run as a command. `patchGameHtml` is exported so it can be
// exercised against real upstream pages without that import kicking off a
// 4.85 GB migration as a side effect.
// `argv[1]` is absent under `node -e`, where nothing was invoked directly.
const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  main().catch((error) => {
    console.error(`\n${error.message}`);
    process.exit(1);
  });
}
