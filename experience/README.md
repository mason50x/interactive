# The experience

An allowlisted experience for the app, as one Cloudflare Worker on the Free
plan. A experience engine in the browser handles the pages; a small Bare v3 server in
`src/worker.js` does the fetching, and refuses any host not listed in
`config/experience-allowlist.json` at the repo root.

    https://experience.interactivelearning-content-net.work/?u=https://en.wikipedia.org/

That hostname is on the same zone as the R2 bucket. The workers.dev address is
switched off, so this is the only place the Worker answers.

The app frames that page from `/dashboard/experience` — see `src/lib/experience.ts`.
The route and sidebar entry are included in production and development builds.
Set `EXPERIENCE_ORIGIN` to the Experience Worker origin in the app deployment.
Signed-in accounts share five minutes per UTC day across apps; verified admins
get five hours. Convex stores the allowance and removes expired daily records.

## Layout

    src/worker.js          the Bare server and the allowlist check
    site/                  the frontend: index.html, sw.js, experience.config.js, _headers
    site/dist/             built output (gitignored): site/ plus the vendored
                           engine, bridge and transport bundles from node_modules
    scripts/build-site.mjs assembles site/dist from node_modules
    wrangler.toml          one Worker, static assets bound as ASSETS

Only `/v3/` runs Worker code. Everything else is a static file, and static
asset requests do not count toward the Free plan's 100,000 requests a day.

## Commands

    npm install
    npm run dev       # build the site, then wrangler dev on localhost:8787
    npm run deploy    # build the site, then wrangler deploy
    npm run tail      # live logs from the deployed Worker
    npm test          # browser regressions (uses the root Playwright install)

`npm run dev` serves over HTTP/1.1. `site/transport.mjs` buffers request
bodies on loopback hosts because Chromium cannot stream uploads over HTTP/1.1.
Video responses remain streamed. The commands explicitly select `wrangler.toml`
so the main app's parent Wrangler configuration cannot take over.

The build applies a checked compatibility patch to the engine's CSS URL
matcher: empty `url()` fallbacks must not consume enclosing parentheses.
Without it, YouTube's stylesheet loses thousands of component rules. Review
this patch when upgrading the engine; the build fails if its source changes.
Service worker updates bypass the script cache and activate before framing
the destination, so returning visitors receive the corrected engine.

Deploying needs `wrangler login` once on the machine. There are no secrets and
no environment variables; the allowlist is compiled in.

## Changing the allowlist

Edit `config/experience-allowlist.json`, then run `npm run deploy` here and deploy
the app. `host` is what the Worker enforces, as an exact match or any
subdomain, so `wikipedia.org` covers `en.wikipedia.org`. An entry with `id`,
`label` and `start` is an app: it gets a tile on `/dashboard/experience` and
opens at `/dashboard/experience/<id>` inside a browser-shaped shell. Sites usually pull
scripts and images from a second domain; add that too, with `label` and
`start` set to `null` so it is enforced but not listed. When the dependency is
one path on a domain you do not want to open, add `paths`: a list of path
prefixes, and only URLs under them are allowed on that host.

## Checking it

    curl https://experience.interactivelearning-content-net.work/bare/
    curl -i https://experience.interactivelearning-content-net.work/v3/ \
      -H 'x-bare-url: https://en.wikipedia.org/' -H 'x-bare-headers: {}'
    curl -i https://experience.interactivelearning-content-net.work/v3/ \
      -H 'x-bare-url: https://example.com/' -H 'x-bare-headers: {}'   # 403

## Cost

Nothing, as long as the account stays on Workers Free. Past 100,000 `/v3/`
requests in a day the Worker returns error 1027 until midnight UTC; it does
not bill. There is no KV, R2 or Durable Object behind it.
