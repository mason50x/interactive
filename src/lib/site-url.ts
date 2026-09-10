import { withoutTrailingSlash } from "@/lib/origin";

/**
 * The public origin of the deployment that is currently running.
 *
 * This exists because of invitations. Clerk bakes `redirect_url` into the
 * invitation at the moment it is created and mails it out, so the origin has
 * to be right *then* — there is no editing the link once it is sitting in
 * someone's inbox. A production invite carrying `http://localhost:3000` is
 * simply a dead link, and the only symptom is a person who cannot sign up.
 *
 * Resolution runs most-explicit first:
 *
 * 1. `NEXT_PUBLIC_SITE_URL` — set per environment on Vercel, and written into
 *    `.env.local` by `vercel env pull` for local dev.
 * 2. `VERCEL_PROJECT_PRODUCTION_URL` — the project's stable production host,
 *    used only on production builds.
 * 3. `VERCEL_URL` — the generated host of a preview/branch deployment, which
 *    changes per deployment and so can never be a stored env var.
 * 4. `localhost` — plain `next dev` with nothing configured.
 *
 * Steps 2-4 are the reason preview deployments need no configuration at all:
 * an invite sent from a preview points back at that same preview.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return withoutTrailingSlash(explicit);

  if (
    process.env.VERCEL_ENV === "production" &&
    process.env.VERCEL_PROJECT_PRODUCTION_URL
  ) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }

  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;

  return `http://localhost:${process.env.PORT ?? 3000}`;
}
