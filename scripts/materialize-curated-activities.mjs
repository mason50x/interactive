#!/usr/bin/env node
/**
 * Downloads the explicitly curated activity bundles used alongside Seraph.
 *
 * These are kept separate because their source, licensing, and build process
 * are different. The catalogue generator appends their public metadata, while
 * the R2 migration calls this module to materialise the files that its bucket
 * layout links to.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = join(ROOT, "scripts", "data", "curated-activities.json");
export const CURATED_STAGING = join(ROOT, ".cache", "curated-activities");

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

export async function materializeCuratedActivities({ fresh = false } = {}) {
  const activities = await readCuratedActivities();
  if (fresh) await rm(CURATED_STAGING, { recursive: true, force: true });

  for (const activity of activities) {
    const directory = join(CURATED_STAGING, activity.slug);
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
