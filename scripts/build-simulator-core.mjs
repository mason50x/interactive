import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
const commit = "c60e138da5a795ebb55e56b11b7e90024e41112c";
const dir = new URL("../public/simulator/core/c60e138/", import.meta.url);
await mkdir(dir, { recursive: true });
const files = {
  "runtime.js": "docs/binjgb.js",
  "runtime.wasm": "docs/binjgb.wasm",
  "LICENSE.txt": "LICENSE",
};
const checksums = {};
for (const [target, source] of Object.entries(files)) {
  const path = new URL(target, dir);
  if (process.argv.includes("--fetch")) {
    const response = await fetch(
      `https://raw.githubusercontent.com/binji/binjgb/${commit}/${source}`,
    );
    if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
    await writeFile(path, Buffer.from(await response.arrayBuffer()));
  }
  checksums[target] = createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
}
const manifestPath = new URL("build.json", dir);
if (process.argv.includes("--record")) {
  await writeFile(
    manifestPath,
    JSON.stringify({ commit, formatVersion: 1, checksums }, null, 2) + "\n",
  );
} else {
  const pinned = JSON.parse(await readFile(manifestPath, "utf8"));
  if (JSON.stringify(checksums) !== JSON.stringify(pinned.checksums))
    throw new Error("Pinned core checksum mismatch");
}
console.log("Pinned simulator core verified.");
