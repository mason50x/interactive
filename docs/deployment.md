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
and traces, with query strings redacted so authentication parameters do not enter invocation logs. Static assets are separate from dynamic rendering. The wrapper in
`worker.ts` sets framing/crawler policy and prevents shared caching on auth,
dashboard and learn routes. `public/_headers` covers static responses.

### What runs through the Worker

`assets.run_worker_first` in `wrangler.jsonc` routes rendered pages, RSC
requests, route handlers and Server Actions through `worker.ts`. Hashed
build output under `/_next/static/` and the public artwork and media
directories (`/thumbnails/`, `/app-icons/`, `/logos/`, `/brand/`, `/images/`,
`/fonts/`, `/audio/`, `/avatars/`, `/onboarding/`, `/entertainment-setup/`,
`/simulator/`) are negated from that list: the asset layer serves them
directly, from Cloudflare's cache, and the Worker is not invoked. Their
headers come from `public/_headers`: the crawler and framing policy on every
file, a one-year immutable lifetime for hashed output, and a one-day public
lifetime for artwork. A request under one of those prefixes with no matching
file falls through to the Worker as before.

Two consequences follow. A page load is one Worker invocation plus its RSC
requests, not one per script, font and thumbnail; the activities grid alone
used to cost a couple of hundred. And those files are outside the
working-hours gate in `worker.ts`: a hashed chunk or a game thumbnail is a
public file with no session behind it, and the gate still covers every page,
payload and action. Files under route prefixes, such as the chat avatars in
`public/chat/`, still pass through the Worker.

Smart Placement is off. A rendered page makes no back-end round trips of its
own — Clerk verifies the session against a cached key set and Convex is a
browser subscription — so the default placement, nearest the visitor, is the
fastest. Cloudflare also notes that placement decisions are unreliable in
combination with `run_worker_first`.

## CPU time

Workers Free allows 10 ms of CPU per request. Workers Paid allows 30 seconds
by default, and `limits.cpu_ms` in `wrangler.jsonc` can raise that to five
minutes. Waiting on Clerk, Convex or the asset origin does not count; running
JavaScript does.

Rendering a dashboard page costs well over 10 ms of CPU: React server
rendering, RSC serialisation and Clerk session verification together measure
around 30 ms for the home page in a local workerd, and the activities page
about twice that before the first-paint slicing described in
`src/components/app/activities-browser.tsx`. On the Free plan the runtime
tolerates an occasional overrun and terminates the Worker once overruns are
consistent, which is exactly what a class loading the site at the same time
produces: bursts of `Worker exceeded CPU time limit` (error 1102) in
Observability, one per failed page, and a blank error for the visitor.

Production must therefore run on Workers Paid. The default 30 s limit is
ample; do not set `limits.cpu_ms` on the Free plan, where the API rejects it.
Workers & Pages → the Worker → Metrics reports CPU time per invocation, and
Observability lists each overrun with its URL.

What keeps a render's CPU down, and where to look before adding to it:

- **Module evaluation counts.** A client component referenced anywhere in a
  route's tree is imported on the server to render the HTML, whether or not
  it draws anything there, and the first request to touch a module on a
  fresh isolate pays to evaluate it. Anything heavy that only works in a
  browser — WebGL, WASM, an editor — goes behind `next/dynamic` with
  `ssr: false` (see `src/components/pixel-blast.tsx`), and a page that only
  needs a constant from another page imports a small shared module, not the
  page (see `src/components/app/home/sections.ts`). Compare
  `dist/server/ssr/_next/static/*.js` sizes after a build to see what a
  route pulls in.
- **One session check per request.** Layouts and pages guard themselves
  through `protectPage` in `src/lib/session.ts`, which memoises
  `auth.protect()` for the request, rather than each re-verifying the
  middleware token.
- **Prefetches are renders.** `src/lib/warm.ts` warms a couple of likely
  destinations once a page is idle and the rest on hover. Warming every
  route on mount multiplies each page load's CPU by the size of the rail.

## Preview environments

Do not use `build:production` for untrusted PRs. Build with isolated Clerk/Convex
credentials and `npm run build`, then use `npm run deploy:preview` to upload an
inactive Worker version. A version preview is not a separate backend. Configure
its credentials deliberately, or use a separate staging Worker/Convex deployment.
Set `NEXT_PUBLIC_SITE_URL` explicitly;
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
