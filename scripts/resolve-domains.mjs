/**
 * What this checkout resolves each domain to, for the plain-Node scripts.
 *
 * The app resolves the same three origins in `src/lib/site-url.ts`,
 * `src/lib/player.ts`, and `src/lib/assets.ts`. This is not a fourth opinion:
 * it reads the same variables in the same order and falls back to the same
 * `config/domains.json`. It exists because `scripts/dev-urls.mjs` and
 * `scripts/domains.mjs` both run as plain Node, before the bundler exists, so
 * the TypeScript modules are not loadable — and two scripts printing origins
 * that disagreed with each other would be worse than neither printing any.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Minimal `.env` reader: enough for `KEY=value` and `KEY="value"`, which is
 *  all `vercel env pull` ever writes. */
export function readEnvFile(path = join(ROOT, ".env.local")) {
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

/** The one place in the repo a domain is spelled out. */
export function fallbacks() {
  return JSON.parse(readFileSync(join(ROOT, "config", "domains.json"), "utf8"));
}

const trim = (value) => (value || "").replace(/\/$/, "");

/**
 * A value that is present but cannot be an origin — most often the literal
 * `[SENSITIVE]` that `vercel env pull` writes for a variable stored as a
 * Secret. Treating one as "set" would report a domain nobody can reach and,
 * worse, hide the working value in the variable behind it. Mirrors the
 * candidate loop in `src/lib/assets.ts`.
 */
function usable(value) {
  if (!value) return null;
  try {
    new URL(trim(value));
    return trim(value);
  } catch {
    return null;
  }
}

/**
 * Every domain, with the variable each came from.
 *
 * The `from` field is the useful half. "It resolved to the right thing" and
 * "it resolved to the right thing *for the reason I intended*" are different
 * states, and only the second one survives a move — an origin that is correct
 * today because of a `config/domains.json` fallback is an origin that will be
 * wrong tomorrow on Vercel, where that file is the least specific answer.
 */
export function resolveDomains(env = { ...readEnvFile(), ...process.env }) {
  const defaults = fallbacks();

  const site = env.NEXT_PUBLIC_SITE_URL
    ? { url: trim(env.NEXT_PUBLIC_SITE_URL), from: "NEXT_PUBLIC_SITE_URL" }
    : env.VERCEL_PROJECT_PRODUCTION_URL && env.VERCEL_ENV === "production"
      ? {
          url: `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`,
          from: "VERCEL_PROJECT_PRODUCTION_URL",
        }
      : env.VERCEL_URL
        ? { url: `https://${env.VERCEL_URL}`, from: "VERCEL_URL" }
        : { url: trim(defaults.site), from: "config/domains.json" };

  const player = usable(env.NEXT_PUBLIC_PLAYER_ORIGIN)
    ? {
        url: usable(env.NEXT_PUBLIC_PLAYER_ORIGIN),
        from: "NEXT_PUBLIC_PLAYER_ORIGIN",
      }
    : { url: null, from: null };

  const asset = usable(env.ASSET_ORIGIN)
    ? { url: usable(env.ASSET_ORIGIN), from: "ASSET_ORIGIN" }
    : usable(env.NEXT_PUBLIC_ASSET_ORIGIN)
      ? {
          url: usable(env.NEXT_PUBLIC_ASSET_ORIGIN),
          from: "NEXT_PUBLIC_ASSET_ORIGIN",
        }
      : { url: null, from: null };

  // Mirrors `resolveDomain` in `src/lib/brand.ts`, deployment-host rule and
  // all: role addresses live on the brand's domain or on the committed
  // fallback, never on whatever host happens to be serving the page.
  const override = env.NEXT_PUBLIC_BRAND_DOMAIN || defaults.mail;
  const siteHost = hostOf(site.url);
  const mail = override
    ? {
        host: override.replace(/^https?:\/\//, ""),
        from: env.NEXT_PUBLIC_BRAND_DOMAIN
          ? "NEXT_PUBLIC_BRAND_DOMAIN"
          : "config/domains.json",
      }
    : isDeploymentHost(siteHost)
      ? { host: hostOf(defaults.site), from: "config/domains.json" }
      : { host: siteHost, from: `derived from ${site.from}` };

  return { site, player, asset, mail };
}

/** A host that is a deployment rather than a brand — see the note of the same
 *  name in `src/lib/brand.ts`. */
function isDeploymentHost(host) {
  return (
    host === "localhost" ||
    host.startsWith("localhost:") ||
    host.startsWith("127.0.0.1") ||
    host.endsWith(".vercel.app")
  );
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
