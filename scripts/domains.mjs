#!/usr/bin/env node
/**
 * What every domain currently resolves to, and what a move actually costs.
 *
 *   npm run domains
 *
 * A domain move is cheap in this repo and expensive outside it, and the gap
 * between those two is where the mistakes live. Every origin the app knows
 * about comes from an environment variable, so the code half is one variable
 * and a redeploy — but the root domain is also stored by Vercel, by Clerk, and
 * by the Convex deployment, and the ones that fail do so late and quietly. A
 * wrong `CLERK_JWT_ISSUER_DOMAIN` does not break the build; it breaks every
 * authenticated query, after the deploy, in production.
 *
 * So this prints two things: what resolved, and *which variable it came from*.
 * The second is the one that matters. An origin that is right today because of
 * the `config/domains.json` fallback is an origin that will be wrong tomorrow
 * on Vercel, and only the provenance says which of those you are looking at.
 *
 * See `config/domains.md` for the runbook this checklist summarises.
 */

import { resolveDomains } from "./resolve-domains.mjs";

const dim = (text) => `\u001b[2m${text}\u001b[0m`;
const bold = (text) => `\u001b[1m${text}\u001b[0m`;
const warn = (text) => `\u001b[33m${text}\u001b[0m`;
const good = (text) => `\u001b[32m${text}\u001b[0m`;

const { site, asset, mail } = resolveDomains();

const rows = [
  ["Site", site.url, site.from],
  ["Assets", asset.url, asset.from],
  ["Mail", `@${mail.host}`, mail.from],
];

const lines = ["", bold("  Resolved domains"), ""];

for (const [label, value, from] of rows) {
  if (!value) {
    lines.push(`  ${label.padEnd(8)}${warn("unset")}`);
    continue;
  }
  lines.push(`  ${label.padEnd(8)}${value}  ${dim(from ?? "")}`);
}

if (!asset.url) {
  lines.push(
    "",
    warn("  No asset origin — every hosted activity is hidden."),
    dim("  Set ASSET_ORIGIN. There is no fallback on purpose: a stale default"),
    dim("  would serve the old bucket silently. See config/domains.md."),
  );
}

if (site.from === "config/domains.json") {
  lines.push(
    "",
    warn("  Site origin came from the committed fallback, not an env var."),
    dim("  Fine locally. On Vercel it means NEXT_PUBLIC_SITE_URL is missing."),
  );
}

lines.push(
  "",
  bold("  Moving the asset domain"),
  dim("  1. Point the new hostname at the same R2 bucket (Cloudflare → R2 →"),
  dim("     Settings → Custom Domains). Nothing is re-uploaded: bundle HTML"),
  dim("     references its own files relatively and never learns its host."),
  dim("  2. Set ASSET_ORIGIN on Vercel (Production)."),
  dim("  3. Redeploy."),
  "",
  bold("  Moving the root domain"),
  dim("  1. Set NEXT_PUBLIC_SITE_URL. That one variable carries brand.url,"),
  dim("     the sitemap, robots.txt, metadataBase, the JSON-LD, and every"),
  dim("     role address — help@, privacy@, legal@ — which derive from it."),
  dim("     Mail staying put during a cutover? Set NEXT_PUBLIC_BRAND_DOMAIN."),
  dim("  2. Update config/domains.json once the move is permanent."),
  dim("  3. Vercel — add the domain, make it the production domain."),
  dim("  4. Clerk — rebind the production instance, re-verify DNS."),
  dim("     This rotates the JWT issuer."),
  warn("  5. Convex — npx convex env set CLERK_JWT_ISSUER_DOMAIN \\"),
  warn("       https://clerk.<new domain> --prod"),
  dim("     Miss this and every authenticated query fails after the Clerk"),
  dim("     change lands, not before. It is the one with no build-time signal."),
  dim("  6. Send yourself one invitation and click it. Clerk stamps"),
  dim("     redirect_url at send time; there is no editing it afterwards."),
  "",
  good("  scripts/invite.mjs resolves the production origin from PROD_SITE_URL"),
  good("  or config/domains.json, so it moves with step 1 or 2 by itself."),
  "",
);

console.log(lines.join("\n"));
