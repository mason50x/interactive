/**
 * The experience: sites that open inside the app, framed through our own
 * Worker, and the list of them that shows up as apps.
 *
 * The Worker lives in `experience/` and only fetches hosts named in
 * `config/experience-allowlist.json`. This module reads the same file so the
 * app can list the entries that are meant to be opened directly — the ones
 * with an `id`, a `label` and a `start` URL — and resolve the experience origin
 * the same way `src/lib/assets.ts` resolves the asset origin. The other
 * entries are dependencies a listed app pulls in (fonts, video hosts, one
 * script on google.com); the Worker enforces them, nothing here shows them.
 *
 * No fallback origin, for the reason `assets.ts` gives: unset is a state the
 * page can report, and a stale default would fail silently.
 */

import allowlist from "../../config/experience-allowlist.json";
import { originFromEnv } from "@/lib/origin";

/** One line of the allowlist, as the Worker also reads it. */
type ExperienceSite = {
  host: string;
  id?: string;
  label: string | null;
  start: string | null;
  paths?: string[];
};

/** An allowlist entry that is also an app: it has a name and a front door. */
export type ExperienceApp = {
  /** The route segment, `/dashboard/experience/<id>`. */
  id: string;
  label: string;
  host: string;
  /** The URL the app opens on. */
  start: string;
};

const SITES: ExperienceSite[] = allowlist.sites;

export const EXPERIENCE_APPS: ExperienceApp[] = SITES.flatMap((site) =>
  site.id && site.label && site.start
    ? [{ id: site.id, label: site.label, host: site.host, start: site.start }]
    : [],
);

/** The apps list. */
export const EXPERIENCE_HREF = "/dashboard/experience";

export function experienceAppHref(id: string): string {
  return `${EXPERIENCE_HREF}/${encodeURIComponent(id)}`;
}

export function findExperienceApp(id: string): ExperienceApp | null {
  return EXPERIENCE_APPS.find((app) => app.id === id) ?? null;
}

/** The experience origin, or `null` when none is configured. */
export function experienceOrigin(): string | null {
  return originFromEnv(
    process.env.EXPERIENCE_ORIGIN,
    process.env.NEXT_PUBLIC_EXPERIENCE_ORIGIN,
  );
}

/** The `src` that frames `target` through the experience, or `null` with no origin. */
export function experienceSrc(target: string): string | null {
  const origin = experienceOrigin();
  return origin ? `${origin}/?u=${encodeURIComponent(target)}` : null;
}
