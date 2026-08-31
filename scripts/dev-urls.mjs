#!/usr/bin/env node
/**
 * Prints the URLs `npm run dev` brings up, and what is missing.
 *
 * The app runs on one origin now — activities are framed at `/learn/<slug>` on
 * the app's own host, gated by the session (see `src/lib/learn.ts`). The one
 * thing still worth surfacing is the asset origin, because the way that fails
 * is quiet: with `ASSET_ORIGIN` unset the activities grid still renders, just
 * with every hosted activity absent, which reads as a bug in the page rather
 * than a variable nobody pulled.
 *
 * See src/lib/assets.ts for where activity bundles load from, and
 * `npm run domains` for what moving any domain costs.
 */

import { readFileSync } from "node:fs";
import { resolveDomains } from "./resolve-domains.mjs";

/** The catalogue. Plain JSON, so it can be parsed rather than scraped — which
 *  matters here because this runs as plain Node, before the bundler exists,
 *  so the TypeScript module that wraps it is not loadable. */
function readActivities() {
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
const assets = domains.asset.url || "";

const dim = (text) => `[2m${text}[0m`;
const bold = (text) => `[1m${text}[0m`;
const warn = (text) => `[33m${text}[0m`;

const activities = readActivities();

const lines = [
  "",
  bold("  Dev server"),
  "",
  `  App          ${app}`,
  `  Activities   ${app}/dashboard/activities`,
  "",
];

if (assets) {
  lines.push(
    `  Assets       ${assets}${dim(`   (${activities.length} activities)`)}`,
  );
  // Two examples rather than a listing: the catalogue runs to hundreds, and a
  // couple of openable URLs is the whole point of printing any.
  for (const activity of activities.slice(0, 2)) {
    lines.push(dim(`               ${app}/dashboard/activities/${activity.slug}`));
  }
} else {
  lines.push(
    warn("  ASSET_ORIGIN is unset"),
    dim(`  All ${activities.length} hosted activities are hidden — every one loads`),
    dim("  from the bucket. Run `vercel env pull`."),
  );
}

lines.push(
  "",
  dim("  Activities are framed at /learn/<slug> behind the session, and the"),
  dim("  bundle they load is a cross-origin file on the asset origin."),
  "",
);

console.log(lines.join("\n"));
