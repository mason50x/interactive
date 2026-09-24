#!/usr/bin/env node
/**
 * Downloads the explicitly curated activity bundles used alongside Seraph.
 *
 * These are kept separate because their source, licensing, and build process
 * are different. The catalogue generator appends their public metadata, while
 * the R2 migration calls this module to materialise the files that its bucket
 * layout links to.
 */
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  copyFile,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = join(ROOT, "scripts", "data", "curated-activities.json");
export const CURATED_STAGING = join(ROOT, ".cache", "curated-activities");
const execFileAsync = promisify(execFile);

export async function readCuratedActivities() {
  return JSON.parse(await readFile(MANIFEST, "utf8"));
}

async function download(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GET ${url} -> ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function patchBlackjackHtml(source) {
  const html = source
    // The vendor demo biases outcomes to a configured 40% win rate. Their
    // documentation defines -1 as ordinary deal-driven play.
    .replace("win_occurrence: 40", "win_occurrence: -1")
    // CTL Arcade can listen for this event and insert an interlevel ad. The
    // standalone bundle has no plugin, but zero also prevents the event.
    .replace("ad_show_counter: 3", "ad_show_counter: 0");

  if (
    !html.includes("win_occurrence: -1") ||
    !html.includes("ad_show_counter: 0")
  ) {
    throw new Error("BlackJack 3D settings changed upstream; patch failed.");
  }
  return html;
}

function patchBlackjackScript(source) {
  const domainGate =
    /seekAndDestroy\(\)\?f=new CPreloader:\s*window\.location\.href="https:\/\/www\.codethislab\.com\/contact-us\.html"/;
  if (!domainGate.test(source)) {
    throw new Error("BlackJack 3D domain gate changed upstream; patch failed.");
  }

  // The public build is restricted to the publisher's showcase domain. Our
  // approved self-hosted copy should enter the same preloader directly.
  return source.replace(domainGate, "f=new CPreloader");
}

function patchDdlcHtml(source) {
  if (!source.includes("</body>") || !source.includes("renpy-pre.js")) {
    throw new Error(
      "DDLC web page changed upstream; review the file panel patch.",
    );
  }
  return source
    .replace(/\s*<link rel="canonical"[^>]*>/i, "")
    .replace(
      "</body>",
      '<script defer src="character-files.js"></script></body>',
    );
}

async function materializeDdlc(activity, directory) {
  const { source } = activity;
  const archive = join(directory, "game.zip");
  const gameZip = await download(new URL("game.zip", source.bundleUrl));
  const hash = createHash("sha256").update(gameZip).digest("hex");
  if (hash !== source.gameZipSha256) {
    throw new Error(
      `DDLC game.zip changed upstream (${hash}); review before staging.`,
    );
  }
  await mkdir(directory, { recursive: true });
  await writeFile(archive, gameZip);

  // Ren'Py Web places small placeholders in game.zip and streams the actual
  // artwork from game/<path>. The list inside the pinned archive is the source
  // of truth; omitting those files would make later scenes fail after launch.
  const { stdout } = await execFileAsync(
    "unzip",
    ["-p", archive, "game/renpyweb_remote_files.txt"],
    { maxBuffer: 1024 * 1024 },
  );
  const lines = stdout.trim().split(/\r?\n/);
  if (lines.length % 2 !== 0 || lines.length < 600) {
    throw new Error("Unexpected DDLC remote file manifest in game.zip.");
  }
  const remoteFiles = lines
    .filter((_, index) => index % 2 === 0)
    .map((path) => `game/${path}`);
  const files = [...source.files, ...remoteFiles];
  if (
    new Set(files).size !== files.length ||
    files.some((path) => path.startsWith("/") || path.includes(".."))
  ) {
    throw new Error("Invalid or duplicate DDLC source path.");
  }

  let next = 0;
  await Promise.all(
    Array.from({ length: 12 }, async () => {
      while (next < files.length) {
        const relative = files[next++];
        const output = join(directory, relative);
        if (relative !== "index.html") {
          try {
            if ((await stat(output)).size > 0) continue;
          } catch {
            // Missing staged files are fetched below.
          }
        }
        const bytes = await download(new URL(relative, source.bundleUrl));
        await mkdir(dirname(output), { recursive: true });
        await writeFile(
          output,
          relative === "index.html"
            ? patchDdlcHtml(bytes.toString("utf8"))
            : bytes,
        );
      }
    }),
  );
  await copyFile(
    join(ROOT, "scripts", "assets", "ddlc-character-files.js"),
    join(directory, "character-files.js"),
  );
  return files.length + 2; // Source files, pinned archive, and our file panel.
}

export async function materializeCuratedActivities({ fresh = false } = {}) {
  const activities = await readCuratedActivities();
  if (fresh) await rm(CURATED_STAGING, { recursive: true, force: true });

  for (const activity of activities) {
    const directory = join(CURATED_STAGING, activity.slug);
    if (activity.source.kind === "renpy-web") {
      const count = await materializeDdlc(activity, directory);
      console.log(`  ${activity.slug}: ${count} files`);
      continue;
    }
    console.log(`  ${activity.slug}: ${activity.source.files.length} files`);
    for (const relative of activity.source.files) {
      const output = join(directory, relative);
      await mkdir(dirname(output), { recursive: true });
      const bytes = await download(
        new URL(relative, activity.source.bundleUrl),
      );
      let content = bytes;
      if (relative === "index.html") {
        content = patchBlackjackHtml(bytes.toString("utf8"));
      } else if (relative === "js/main.js") {
        content = patchBlackjackScript(bytes.toString("utf8"));
      }
      await writeFile(output, content);
    }
  }

  return { activities, staging: CURATED_STAGING };
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  materializeCuratedActivities({ fresh: process.argv.includes("--fresh") })
    .then(({ activities, staging }) =>
      console.log(`Materialised ${activities.length} bundle(s) in ${staging}`),
    )
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}
