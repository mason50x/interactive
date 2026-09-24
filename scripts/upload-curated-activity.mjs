#!/usr/bin/env node
/** Upload one materialized curated bundle with the project's Wrangler login. */
import { spawn } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const [slug, bucket] = process.argv.slice(2);
if (
  !slug ||
  !bucket ||
  !/^[a-z0-9-]+$/.test(slug) ||
  !/^[a-z0-9-]+$/.test(bucket)
) {
  throw new Error(
    "Usage: node scripts/upload-curated-activity.mjs <slug> <r2-bucket>",
  );
}

const catalogue = (
  await import("../src/lib/activities.catalogue.json", {
    with: { type: "json" },
  })
).default;
const activity = catalogue.find((item) => item.slug === slug);
if (!activity) throw new Error(`No catalogue entry for ${slug}`);
const directory = join(ROOT, ".cache", "curated-activities", slug);
const wrangler = join(ROOT, "node_modules", ".bin", "wrangler");
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".wasm": "application/wasm",
  ".zip": "application/zip",
};

async function put(file) {
  const key = `activities/${activity.path}/${file.replaceAll("\\", "/")}`;
  const args = [
    "r2",
    "object",
    "put",
    `${bucket}/${key}`,
    "--remote",
    "--force",
    "--file",
    join(directory, file),
    "--content-type",
    types[extname(file).toLowerCase()] ?? "application/octet-stream",
  ];
  await new Promise((resolve, reject) => {
    const child = spawn(wrangler, args, {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    for (const stream of [child.stdout, child.stderr]) {
      stream.on("data", (data) => {
        output = (output + data).slice(-4000);
      });
    }
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${key}: ${output}`)),
    );
  });
}

const files = await readdir(directory, { recursive: true });
const realFiles = [];
for (const file of files) {
  if ((await stat(join(directory, file))).isFile()) realFiles.push(file);
}
if (!realFiles.includes("index.html") || !realFiles.includes("game.zip")) {
  throw new Error(`Incomplete staged bundle for ${slug}`);
}

console.log(
  `Uploading ${realFiles.length} objects to R2:${bucket}/activities/${activity.path}/`,
);
await put("game.zip");
realFiles.splice(realFiles.indexOf("game.zip"), 1);
realFiles.splice(realFiles.indexOf("index.html"), 1);
realFiles.sort();
let next = 0;
let complete = 1;
await Promise.all(
  Array.from({ length: 8 }, async () => {
    while (next < realFiles.length) {
      const file = realFiles[next++];
      await put(file);
      complete++;
      if (complete % 25 === 0) {
        console.log(`${complete}/${realFiles.length + 2} objects uploaded`);
      }
    }
  }),
);
await put("index.html");
console.log(`${realFiles.length + 2}/${realFiles.length + 2} objects uploaded`);
console.log(`Uploaded ${slug} to R2:${bucket}/activities/${activity.path}/`);
