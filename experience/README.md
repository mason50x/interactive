# The experience

An allowlisted experience for the app, as one Cloudflare Worker on the Free
plan. A rewriting engine in the browser handles the pages; a small Bare v3 server in
`src/worker.js` does the fetching, and refuses any host not listed in
`config/experience-allowlist.json` at the repo root.

    https://experience.interactivelearning-content-net.work/?u=https://en.wikipedia.org/

That hostname is on the same zone as the R2 bucket. The workers.dev address is
switched off, so this is the only place the Worker answers.

The app frames that page from `/dashboard/experience` — see `src/lib/experience.ts`.
That route is development only: its page files are `page.dev.tsx`, an extension
`next build` does not register, so no deployment has the route, the rail entry,
or any of this code in its bundles. Only `next dev` does.

## Layout

    src/worker.js          the Bare server and the allowlist check
    site/                  the frontend: index.html, sw.js, engine.config.js, _headers
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

`npm run dev` serves over HTTP/1.1, and Chromium will not stream a request
body over HTTP/1.1, so any POST a proxied page makes fails locally with a 500
from the service worker. The deployed Worker is HTTP/2 and unaffected; test
POST-heavy sites against the cloud.

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
