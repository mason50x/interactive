# Deployment

The app runs on Vercel as a stock Next.js build (`next build`). Clerk, Convex
and the separate R2 asset origin remain external services, and the Experience
Worker under `experience/` stays on Cloudflare. Node 24 is used for builds and
functions.

## Local development

Run `npm ci`, copy `.env.example` to `.env.local`, configure development Clerk
and Convex, then run `npm run dev`. Keep the development Convex process
running for local backend work. `npm run build` builds the app; `npm start`
serves that production output locally.

Use development credentials locally, not the production environment backup.

## Production on Vercel

`vercel.json` sets the build command. Production builds run
`npm run build:production`, which deploys Convex and builds the frontend with
the matching `NEXT_PUBLIC_CONVEX_URL`. Preview and development builds run
plain `npm run build` and never touch the production Convex deployment:

| Setting | Value |
| --- | --- |
| Framework | Next.js |
| Root directory | Repository root |
| Build command | from `vercel.json` |
| Production branch | `main` |
| Node version | 24.x |

Scope `CONVEX_DEPLOY_KEY` to **Production only**. It is read by the build and
by server-side account sync at runtime; a preview that could see it could
deploy to production Convex. See `docs/environment.md` for every variable.

Keep Speed Insights, Web Analytics, Observability Plus and other paid add-ons
off. Image optimization is disabled in `next.config.ts` (`images.unoptimized`)
so image transformations never count against the plan.

### Response policy

Everything the Worker wrapper used to do now lives in stock Next:

- `src/proxy.ts` runs the working-hours gate (see `access-hours.md`) before
  Clerk, on every route the proxy matches.
- `next.config.ts` `headers()` sets the crawler opt-out and framing policy on
  every response, `private, no-store` on the signed-in and auth route trees,
  and a one-day public lifetime on the artwork and media under `public/`.
  Vercel serves `/_next/static/` as immutable for a year by default.

Static files are served from Vercel's CDN without invoking a function.

## CPU time

Vercel bills (or, on Hobby, caps) active CPU per function invocation. Waiting
on Clerk, Convex or the asset origin does not count; running JavaScript does.
Rendering a dashboard page costs on the order of 30–60 ms of CPU. Vercel →
the project → Usage reports active CPU and invocations.

What keeps a render's CPU down, and where to look before adding to it:

- **Module evaluation counts.** A client component referenced anywhere in a
  route's tree is imported on the server to render the HTML, whether or not
  it draws anything there, and the first request to touch a module on a
  fresh instance pays to evaluate it. Anything heavy that only works in a
  browser — WebGL, WASM, an editor — goes behind `next/dynamic` with
  `ssr: false` (see `src/components/pixel-blast.tsx`), and a page that only
  needs a constant from another page imports a small shared module, not the
  page (see `src/components/app/home/sections.ts`).
- **One session check per request.** Layouts and pages guard themselves
  through `protectPage` in `src/lib/session.ts`, which memoises
  `auth.protect()` for the request, rather than each re-verifying the
  proxy token.
- **Prefetches are renders.** `src/lib/warm.ts` warms a couple of likely
  destinations once a page is idle and the rest on hover. Warming every
  route on mount multiplies each page load's CPU by the size of the rail.

## Preview environments

Preview deployments use their own Clerk development instance and Convex
development deployment; never give Preview the production keys. Set
`SITE_URL` (or `NEXT_PUBLIC_SITE_URL`) for Preview so invitations point at a
real origin. `*.vercel.app` hosts are treated as deployment hosts by
`src/lib/brand.ts`. The Experience site only permits the production hosts to
frame it (`experience/site/_headers`), so `/browse` is not usable on previews.

Repository CI runs lint, typecheck, unit tests, the production build and HTTP
tests against `next start` with inert fixtures. It never deploys or receives
production credentials.

## Cutover and rollback

Keep the production hostname, Clerk instance/JWT issuer, Convex deployment and
R2 asset origin. Verify a Vercel deployment on its `*.vercel.app` host before
moving DNS.

DNS stays on Cloudflare. To cut over:

1. Add `interactivelearningresources.org` and `www` to the Vercel project.
2. Detach both custom domains from the `interactive-learning` Worker.
3. In Cloudflare DNS, set the records Vercel's domain settings show for the
   apex (A) and `www` (CNAME), **DNS-only**. Leave the Clerk CNAMEs (frontend
   API, accounts, mail and DKIM) untouched and DNS-only.

To roll back, re-attach the Worker custom domains; keep the Worker and its
version history until the Vercel deployment has been stable for a week. The
last Worker source is in Git history before the Vercel migration commit. A
rollback does not roll back Convex data or functions; backend changes must
remain backward-compatible.

## Optional Worker and assets

The independent Worker under `experience/` is unchanged and deploys with its
own `wrangler.toml`. Hosted activity HTML stays on its separate R2 origin;
putting third-party bundles on the app origin would change browser isolation.
