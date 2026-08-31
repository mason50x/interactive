#!/usr/bin/env node
/**
 * Prints the origins `npm run dev` brings up, and what is missing.
 *
 * The app and the games are one server. The app answers on `localhost` and
 * games answer on `127.0.0.1` — the same process reached by a different
 * hostname, which the browser treats as a genuinely separate origin and so
 * keeps game code away from the Clerk session. That is easy to forget when
 * both say `:3000`, and the failure mode is a frame that looks broken rather
 * than blocked, so the banner spells out which URL is which before Next starts
 * logging.
 *
 * It also reports the asset origin, because the way that one fails is worse
 * than a broken frame: with `ASSET_ORIGIN` unset the games grid
 * still renders, just with every hosted game absent. That reads as a bug in
 * the page rather than a variable nobody pulled.
 *
 * See src/lib/player.ts and src/lib/assets.ts for why the split exists at all,
 * and `npm run domains` for what moving any of the three costs.
 */

import { readFileSync } from "node:fs";
import { resolveDomains } from "./resolve-domains.mjs";

/** The catalogue. Plain JSON, so it can be parsed rather than scraped — which
 *  matters here because this runs as plain Node, before the bundler exists,
 *  so the TypeScript module that wraps it is not loadable. */
function readHostedGames() {
  try {
    return JSON.parse(readFileSync("src/lib/activities.catalogue.json", "utf8"));
  } catch {
    return [];
  }
}

// Shared with `npm run domains` rather than re-derived, so the banner and the
// move checklist can never print origins that disagree with each other.
const domains = resolveDomains();
const app = domains.site.url;
const player = domains.player.url || "";
const assets = domains.asset.url || "";

const dim = (text) => `\u001b[2m${text}\u001b[0m`;
const bold = (text) => `\u001b[1m${text}\u001b[0m`;
const warn = (text) => `\u001b[33m${text}\u001b[0m`;

const games = readHostedGames();

const lines = [
  "",
  bold("  One dev server, two origins"),
  "",
  `  App     ${app}`,
  `  Games   ${app}/dashboard/activities`,
  "",
];

if (player) {
  lines.push(`  Player  ${player}${dim("   (games only - / is a 404 here)")}`);
  // Two examples rather than a listing: the catalogue runs to hundreds, and
  // a couple of pasteable URLs is the whole point of printing any.
  if (assets) {
    for (const game of games.slice(0, 2)) {
      lines.push(dim(`          ${player}/${game.slug}`));
    }
  }
} else {
  lines.push(
    warn("  NEXT_PUBLIC_PLAYER_ORIGIN is unset"),
    dim(`  Games fall back to ${app}/player/<slug> with no origin isolation.`),
    dim("  Run `vercel env pull`."),
  );
}

lines.push("");

if (assets) {
  lines.push(`  Assets  ${assets}${dim(`   (${games.length} games)`)}`);
} else {
  lines.push(
    warn("  ASSET_ORIGIN is unset"),
    dim(`  All ${games.length} games are hidden — every one of them loads from`),
    dim("  the bucket. Run `vercel env pull`."),
  );
}

lines.push(
  "",
  dim("  Same process, different hostname, so the browser keeps game code away"),
  dim("  from the Clerk session. On the app origin /player/* 404s on purpose."),
  "",
);

console.log(lines.join("\n"));
