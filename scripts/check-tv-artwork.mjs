import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";

const root = new URL("../", import.meta.url);
const catalogue = JSON.parse(
  await readFile(new URL("src/lib/tv.catalogue.json", root), "utf8"),
);
const artwork = JSON.parse(
  await readFile(new URL("scripts/data/tv-artwork.json", root), "utf8"),
);
const errors = [];
let verified = 0;
for (const entry of catalogue) {
  const record = artwork[entry.slug];
  try {
    if (!record?.identity || !record.source || !record.image) {
      throw new Error("needs an identified title and artwork source");
    }
    if (
      entry.thumbnail !== record.thumbnail ||
      !/^\/thumbnails\/tv\/[a-z0-9-]+\.jpg$/.test(entry.thumbnail)
    ) {
      throw new Error(
        "cover must match the manifest's local JPEG, not a placeholder or remote URL",
      );
    }
    const file = new URL(`public${entry.thumbnail}`, root);
    if ((await stat(file)).size < 1024)
      throw new Error("cover is empty or too small");
    const bytes = await readFile(file);
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
      throw new Error("cover is not a JPEG");
    }
    if (createHash("sha256").update(bytes).digest("hex") !== record.sha256) {
      throw new Error("cover differs from the reviewed artwork");
    }
    verified++;
  } catch (error) {
    errors.push(`${entry.slug}: ${error.message}`);
  }
}
console.log(`Verified artwork: ${verified}/${catalogue.length}`);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
}
