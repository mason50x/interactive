# The experience

An allowlisted experience for the app, as one Cloudflare Worker on the Free
plan. A experience engine in the browser handles the pages; a small Bare v3 server in
`src/worker.js` does the fetching, and refuses any host not listed in
`config/experience-allowlist.json` at the repo root.

    https://experience.interactivelearning-content-net.work/?u=https://en.wikipedia.org/

That hostname is on the same zone as the R2 bucket. The workers.dev address is
switched off, so this is the only place the Worker answers.

The app frames that page from `/experience` — see `src/lib/experience.ts`.
The route and sidebar entry are included in production and development builds.
Set `EXPERIENCE_ORIGIN` to the Experience Worker origin in the app deployment.
Signed-in accounts share ten minutes per UTC day across apps; verified admins
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
`label` and `start` is an app: it gets a tile on `/experience` and
opens at `/experience/<id>` inside a browser-shaped shell. Sites usually pull
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

## Netflix

Netflix is included with its published service/CDN domains from
https://openconnect.netflix.com/mobiledeliverydomains.txt plus the observed
OneTrust consent endpoints. The shared allowlist covers exact hosts and their
subdomains, without opening unrelated advertising networks.

The public landing page and sign-in form are browser-tested through Experience.
Signed-in video playback still needs account testing: Netflix may reject proxy
connections or require DRM capabilities the embedded browser cannot supply.
Both frame layers delegate `encrypted-media`; this does not bypass Netflix's
account, device, DRM, or network restrictions.

The build also applies checked engine compatibility patches for postMessage's
options/transfer-list form and original script-src lookup used by consent SDKs.

## Authentication and additional apps

The catalog also includes Spotify, ChatGPT, Claude, Gemini, and Apple Music.
Google account/consent hosts and the `/js/bg/` authentication scripts are
allowed for YouTube and Gemini. Google Search remains outside the allowlist.
Spotify's separate asset domains, Apple's account/media hosts, and Claude's
asset and CAPTCHA hosts are dependencies rather than additional tiles.
ChatGPT's authentication and asset entries follow the relevant domains in
[OpenAI's network guidance](https://help.openai.com/en/articles/9247338-network-recommendations-for-chatgpt-errors-on-web-and-apps).

The published engine also needs two module compatibility corrections, applied
in `scripts/build-site.mjs` to both page and service-worker engines:

- Use pinned Meriyah 6.1.4 instead of the older parser embedded in the bundle.
  Claude uses a valid `for (const item of await of(...))` loop that the embedded
  parser rejects, leaving the entire script's imports unrewritten.
- Resolve dynamic imports with the emitted argument order `(base, specifier)`.
  The upstream method reverses these arguments, importing the calling module
  itself. Apple Music consequently loses its player and sign-in controls.

Browser regressions cover both cases. Run `npm test` here, plus
`npx vitest run scripts/tests/experience-allowlist.test.ts` from the repo root
for relay enforcement and catalog coverage. These deterministic tests do not
prove third-party account login, chat completion, or licensed playback.

Live local testing on 2026-09-15 reached YouTube and Spotify sign-in forms,
Gemini's signed-out screen and Google sign-in, and Apple Music's catalog and
player controls. Full account testing is still pending. ChatGPT returned an
upstream "Unable to load site" page; Claude remained blank after loading its
scripts; Apple's nested sign-in navigation still reached a missing page.
Do not treat these services as fully verified until login and actual playback
or chat have been tested through the deployed proxy and app frame.

## TikTok

TikTok is a catalog app with a locally bundled favicon. Its allowlist includes
`tiktok.com`, `tiktokcdn-us.com`, `tiktokcdn.com`, `tiktokv.us`, `tiktokw.us`,
`tiktokv.com`, `ttwstatic.com`, and `muscdn.com` (including subdomains).
The US homepage and live browser requests on 2026-09-15 identified the regional
API, verification, login, script, image, and video hosts; the homepage also
references the international CDN and muscdn image host. Do not open all of
ByteDance or unrelated social networks to resolve an individual failed request.

Local browser checks at localhost:8788 rendered TikTok's navigation and login
modal and opened the phone login form. The local app served the bundled logo
as a decoded 32×32 image. The observed login run had no relay allowlist denials.
Feed loading was inconsistent: TikTok showed “Something went wrong”, an earlier
run returned feed API 403 responses and a script error (`a.init is not a function`).
Adding hosts does not establish that those failures are fixed. Authenticated
login, third-party OAuth, video playback, and other regions remain unverified.
Deploy both the app and Experience Worker for the catalog and relay changes
to take effect in production.

Regression coverage: the Experience Vitest tests exercise TikTok's catalog,
route, logo, all eight host families, representative dependency URLs, and
lookalike-host rejection. The Experience Playwright suite checks the shared
proxy engine. These deterministic tests do not assert live TikTok playback.
