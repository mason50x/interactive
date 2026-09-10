/** Repair only the three hosted Moto X3M entry pages, without a full migration.
 * node --env-file=.env.local scripts/repair-moto-pages.mjs --dry-run
 * Export R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 * and run without --dry-run to upload. Requires rclone, like the migration.
 */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { patchGameHtml, assertPatched } from "./migrate-to-r2.mjs";

const slugs = new Set(["motox3mpool", "motox3mspooky", "motox3mwinter"]);
const catalogue = JSON.parse(
  await readFile(
    new URL("../src/lib/activities.catalogue.json", import.meta.url),
    "utf8",
  ),
);
const games = catalogue.filter(({ slug }) => slugs.has(slug));
if (games.length !== slugs.size)
  throw new Error("Moto X3M catalogue entries missing.");
const dryRun = process.argv.includes("--dry-run");
const origin = process.env.ASSET_ORIGIN || process.env.NEXT_PUBLIC_ASSET_ORIGIN;
if (!origin)
  throw new Error("Set ASSET_ORIGIN to the live asset bucket origin.");
if (!dryRun) {
  for (const key of [
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET",
  ]) {
    if (!process.env[key])
      throw new Error(
        `Missing ${key}; export the bucket credentials before uploading.`,
      );
  }
  if (spawnSync("rclone", ["version"], { stdio: "ignore" }).status !== 0) {
    throw new Error("rclone is required, as for scripts/migrate-to-r2.mjs.");
  }
}
const directory = await mkdtemp(join(tmpdir(), "moto-repair-"));
try {
  // Validate all three pages before writing anything to the bucket.
  for (const game of games) {
    const url = new URL(
      `activities/${game.path}/index.html`,
      `${origin.replace(/\/$/, "")}/`,
    );
    url.searchParams.set("repair", Date.now().toString());
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`${game.slug}: HTTP ${response.status}`);
    const html = await response.text();
    if (!html.includes('src="motox3m.min.js"'))
      throw new Error(`${game.slug}: unexpected entry page`);
    const patched = patchGameHtml(html);
    assertPatched(game.slug, patched);
    await writeFile(join(directory, `${game.slug}.html`), patched);
    console.log(
      `${game.slug}: ${patched === html ? "already patched" : "repair validated"}`,
    );
  }
  if (!dryRun) {
    const env = {
      ...process.env,
      RCLONE_CONFIG_R2_TYPE: "s3",
      RCLONE_CONFIG_R2_PROVIDER: "Cloudflare",
      RCLONE_CONFIG_R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
      RCLONE_CONFIG_R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
      RCLONE_CONFIG_R2_ENDPOINT: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      RCLONE_CONFIG_R2_NO_CHECK_BUCKET: "true",
      RCLONE_CONFIG_R2_ACL: "",
    };
    for (const game of games) {
      const result = spawnSync(
        "rclone",
        [
          "copyto",
          join(directory, `${game.slug}.html`),
          `R2:${process.env.R2_BUCKET}/activities/${game.path}/index.html`,
          "--ignore-times",
          "--header-upload",
          "Content-Type: text/html; charset=utf-8",
          "--header-upload",
          "Cache-Control: no-cache",
        ],
        { env, stdio: "inherit" },
      );
      if (result.error) throw result.error;
      if (result.status !== 0)
        throw new Error(`Upload failed for ${game.slug}`);
    }
    console.log(
      "Uploaded three entry pages. Purge their URLs from the Cloudflare cache, then reload the games.",
    );
  } else {
    console.log("Dry run passed; no bucket files changed.");
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}
