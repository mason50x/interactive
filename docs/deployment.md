# Deployment

The app runs on Cloudflare Workers using vinext. Clerk, Convex and the separate
R2 asset origin remain external services. Node 24 is used for builds; deployed
request handlers run in workerd.

## Local development

Run `npm ci`, copy `.env.example` to `.env.local`, configure development Clerk
and Convex, then run `npm run dev`. The Vite Cloudflare plugin runs server code
in workerd. Keep the development Convex process running for local backend work.
`npm run build` builds the Worker; `npm start` serves that production output locally.
Rebuild and restart `npm start` together after changes to avoid stale asset hashes.

Development variables can be loaded from `.env.local` or `.dev.vars`. Prefer one
source; `.dev.vars` takes precedence for Worker bindings. These files are ignored.
Use development credentials locally, not the production environment backup.

## Production on Cloudflare

Worker: `interactive-learning` in the Cognify account. `wrangler.jsonc` is the
source configuration; the build generates `dist/server/wrangler.json`.

Cloudflare Workers Builds settings:

| Setting | Value |
| --- | --- |
| Root directory | Repository root |
| Build command | `npm run build:production` |
| Deploy command | `npm run deploy` |
| Production branch | `main` |
| Node version | 24 |

`build:production` runs Convex deployment and builds the frontend with the
matching `NEXT_PUBLIC_CONVEX_URL`. `deploy` uploads the already-built Worker.
Build variables must be configured separately from runtime variables/secrets.
See `docs/environment.md`. Manual deployments upload the current build output,
so build the intended commit first; they no longer archive HEAD through Vercel.

For a local production build, load the intended environment into the build
process (do not replace your development `.env.local`). For example, Node's
`--env-file` can load a protected production export for a wrapper that spawns
`npm run build:production`. A secret JSON/.env file may be supplied to
`npm run deploy -- --secrets-file /absolute/path/to/file` to upload runtime
values with the same Worker version. Never commit or print that file.

The Worker preserves dashboard-managed variables (`keep_vars`) and enables logs
and traces, with query strings redacted so invitation tickets do not enter invocation logs. Static assets are separate from dynamic rendering. The wrapper in
`worker.ts` sets framing/crawler policy and prevents shared caching on auth,
dashboard and learn routes. `public/_headers` covers static responses.

## Preview environments

Do not use `build:production` for untrusted PRs. Build with isolated Clerk/Convex
credentials and `npm run build`, then use `npm run deploy:preview` to upload an
inactive Worker version. A version preview is not a separate backend. Configure
its credentials deliberately, or use a separate staging Worker/Convex deployment.
Set `SITE_URL` (runtime invitation origin) or `NEXT_PUBLIC_SITE_URL` explicitly;
Workers preview URLs are not inferred from Vercel system variables. Set
`NEXT_PUBLIC_BRAND_DOMAIN` if staging mail must use the production brand domain.

Repository CI runs lint, typecheck, unit tests, the production build, workerd HTTP
tests and a deployment dry run with inert fixtures. It never deploys or receives
production credentials. Configure the trusted Cloudflare Git integration in the
account; the repository does not contain an API token.

## Cutover and rollback

Keep the production hostname, Clerk instance/JWT issuer, Convex deployment and
R2 asset origin. Test the Worker before routing the apex and www to it. Configure
custom domains only after acceptance, preserving Clerk and mail DNS records.
`vercel.json` disables Vercel Git deployments on migrated branches.
Retain the previous Vercel deployment for rollback. Worker rollback does not roll
back Convex data or functions; backend changes must remain backward-compatible.

## Optional Worker and assets

The independent Worker under `experience/` is unchanged. App experience routes
remain development-only. Hosted activity HTML stays on its separate R2 origin;
putting third-party bundles on the app origin would change browser isolation.

## Current production DNS

The apex and `www` are Worker custom domains. Cloudflare manages their proxied
AAAA `100::` placeholder records; do not replace those with Vercel records.
Clerk CNAMEs (frontend API, accounts, mail and DKIM) must remain DNS-only.

For an emergency Vercel rollback, remove the Worker custom domains, restore apex
A `216.198.79.1` (proxied) and www CNAME
`eac8a8c8a865ba95.vercel-dns-017.com` (DNS-only), and verify the retained Vercel
deployment before enabling automatic builds again.
