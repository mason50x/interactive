#!/usr/bin/env node
/**
 * Prints the two origins `npm run dev` brings up.
 *
 * They are one server. The app answers on `localhost` and games answer on
 * `127.0.0.1` — the same process reached by a different hostname, which the
 * browser treats as a genuinely separate origin and so keeps game code away
 * from the Clerk session. That is easy to forget when both say `:3000`, and
 * the failure mode is a frame that looks broken rather than blocked, so the
 * banner spells out which URL is which before Next starts logging.
 *
 * See src/lib/player.ts for why the split exists at all.
 */

import { readFileSync } from "node:fs";

/** Minimal `.env` reader: enough for `KEY=value` and `KEY="value"`, which is
 *  all `vercel env pull` ever writes. */
function readEnvFile(path) {
  const values = {};
  let contents;
  try {
    contents = readFileSync(path, "utf8");
  } catch {
    return values;
  }

  for (const line of contents.split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    values[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return values;
}

/**
 * The game slugs, lifted out of the catalogue by pattern rather than by
 * import: this runs as plain Node before the bundler exists, so a TypeScript
 * module is not loadable here. A missed slug costs a line of the banner and
 * nothing else.
 */
function readGameSlugs() {
  try {
    const source = readFileSync("src/lib/games.ts", "utf8");
    return [...source.matchAll(/slug:\s*"([^"]+)"/g)].map((match) => match[1]);
  } catch {
    return [];
  }
}

const env = { ...readEnvFile(".env.local"), ...process.env };
const app = (env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
const player = (env.NEXT_PUBLIC_PLAYER_ORIGIN || "").replace(/\/$/, "");

const dim = (text) => `\u001b[2m${text}\u001b[0m`;
const bold = (text) => `\u001b[1m${text}\u001b[0m`;

const lines = ["", bold("  One dev server, two origins"), "", `  App     ${app}`];

if (player) {
  lines.push(`  Player  ${player}${dim("   (games only - / is a 404 here)")}`);
  for (const slug of readGameSlugs()) {
    lines.push(dim(`          ${player}/${slug}`));
  }
  lines.push(
    "",
    dim("  Same process, different hostname, so the browser keeps game code away"),
    dim("  from the Clerk session. On the app origin /player/* 404s on purpose."),
  );
} else {
  lines.push(
    "",
    dim("  NEXT_PUBLIC_PLAYER_ORIGIN is unset, so games fall back to"),
    dim(`  ${app}/player/<slug> with no origin isolation. Run \`vercel env pull\`.`),
  );
}

lines.push("");
console.log(lines.join("\n"));
