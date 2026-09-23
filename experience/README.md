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
Every account starts with 20 minutes shared across proxy apps, games,
entertainment and simulators. Browsing catalogues is free. The allowance resets
at 7:35 a.m. America/Chicago (including daylight saving changes). At exhaustion,
an accepted new chat message, including a short reply, earns two minutes; see
[the playtime policy](../docs/playtime.md). Convex owns all accounting.

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
Service worker updates bypass the script cache. First visits wait for activation;
returning visitors can use the already activated worker while an update waits for
its previous requests to finish. Requiring that pending update before framing the
destination caused the launcher to time out before reaching the relay. Updates
still activate automatically when the browser can retire the previous worker.

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

The catalog also includes Spotify, Gemini, and Apple Music.
Google account/consent hosts and the `/js/bg/` authentication scripts are
allowed for YouTube and Gemini. Google Search remains outside the allowlist.
Spotify's separate asset domains and Apple's account/media hosts are
dependencies rather than additional tiles.

The published engine also needs two module compatibility corrections, applied
in `scripts/build-site.mjs` to both page and service-worker engines:

- Use pinned Meriyah 6.1.4 instead of the older parser embedded in the bundle.
  The embedded parser rejects valid `for (const item of await of(...))` loops,
  leaving the entire script's imports unrewritten.
- Resolve dynamic imports with the emitted argument order `(base, specifier)`.
  The upstream method reverses these arguments, importing the calling module
  itself. Apple Music consequently loses its player and sign-in controls.

Browser regressions cover both cases. Run `npm test` here, plus
`npx vitest run scripts/tests/experience-allowlist.test.ts` from the repo root
for relay enforcement and catalog coverage. These deterministic tests do not
prove third-party account login, chat completion, or licensed playback.

Live local testing on 2026-09-15 reached YouTube and Spotify sign-in forms,
Gemini's signed-out screen and Google sign-in, and Apple Music's catalog and
player controls. Full account testing is still pending. Apple's nested sign-in
navigation still reached a missing page.
Do not treat these services as fully verified until login and actual playback
or chat have been tested through the deployed proxy and app frame.

## TikTok

TikTok is a catalog app with a locally bundled favicon. Its allowlist includes
`tiktok.com`, `tiktokcdn-us.com`, `tiktokcdn-eu.com`, `tiktokcdn.com`,
`tiktokv.us`, `tiktokw.us`, `tiktokv.eu`, `tiktokw.eu`,
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
route, logo, all eleven host families, representative dependency URLs, and
lookalike-host rejection. The Experience Playwright suite checks the shared
proxy engine. These deterministic tests do not assert live TikTok playback.


On 2026-09-16, production reproduced a completely blank TikTok skeleton:
its homepage selected `sf16-website-login.neutral.tiktokcdn-eu.com` for app
scripts, while local connections selected the already allowed US CDN. The
relay rejected every EU script, so hydration never ran. The fix adds the
observed EU CDN plus `tiktokw.eu` and `tiktokv.eu` for regional configuration
and SDK requests. Hostname lookalikes remain denied. Denials now log only the
host under `experience_destination_denied`, without signed paths or queries.
The production relay hotfix preserves existing assets and unrelated settings.
Browser verification must use a ChromeOS user agent, including worker requests,
because this deployment intentionally restricts its hostname to ChromeOS.

The repaired production flow was verified in a nested sandboxed Chromium frame
with a ChromeOS user agent at 1365×900: EU app scripts and the feed returned
200, and video reached readyState 4 with advancing playback time. The Log in → Use phone or email interaction displayed the phone-number and
verification-code inputs. No relay destination denials were observed after the
complete fix. This verifies the
reported skeleton failure, not authenticated login or every regional variant.

## X

X is a private preview for Mason's exact Clerk account, recorded in
`config/experience-access.json`. It is absent from other users' service lists
and routes. `x.com`, `twitter.com`, `twimg.com`, and `t.co` are marked as
restricted in the shared allowlist; both HTTP and WebSocket relay requests
require a short-lived, signed X grant. Changing a username or staff role does
not grant access, and the relay never receives a Clerk session token.

Set the same random `EXPERIENCE_ACCESS_SECRET` (at least 32 characters) on both
the app Worker and this Worker before deploying. Local development uses the
app's `.env.local` and this package's `.dev.vars`. Missing or mismatched secrets
deny X. Deploy both Workers for this change. See `docs/environment.md`.

Embedded tabs request a fresh grant before starting and renew it while open.
Popups carry the current grant, which expires after at most ten minutes; reopen
an expired popup from Experience. Grants do not appear in query parameters or
upstream request headers.

The following verification notes describe X's existing compatibility work.
The observed Apple sign-in SDK is allowed only under
`appleid.cdn-apple.com/appleauth/`. Existing Google and Apple authentication
entries are shared. External destinations behind `t.co` still require their
own allowlist entry; a short link does not grant access to arbitrary websites.

Live local Chrome testing on 2026-09-21 verified user-completed login,
a populated home timeline, Explore, search results, and playing video
(readyState 4). The initial login exposed X API error 353: a rotated CSRF
cookie disagreed with the page's stale cookie snapshot. The engine build now
reads committed response cookies before injecting the next document and
refreshes the JavaScript cookie view on service-worker cookie updates.
Regression tests cover both cases and keep HttpOnly cookies out of that view.

This is local relay verification, not production deployment verification.
The actual app shell was also verified with Clerk development keys: the X
tile opens the nested sandboxed frame, preserves the X session, loads the
timeline, and plays video. Local setup uses `EXPERIENCE_ORIGIN=http://localhost:8788`
in `.env.local` and a relay running on port 8788. Production Clerk keys reject
localhost. Clerk telemetry also requires excluding `next/compat/router` from
Vite dependency prebundling to avoid a duplicate React hook instance.
Alternate OAuth, account challenges,
posting, messages, Spaces, and paid features have not been verified.
Deploy both the app and Experience Worker to release the catalog, dependencies,
and cookie compatibility fixes together.

## Xbox Cloud Gaming and proxy compatibility (2026-09-22)

Xbox Cloud Gaming is available at `/experience/xbox`, starting at
`https://www.xbox.com/play`. Its unmodified official 180×180 icon is bundled in
`public/experience/xbox.png`; the source is recorded in `public/experience/ASSETS.md`.

The dependency inventory comes from Xbox's current landing page, its shipped
JavaScript, and a browser trace through Microsoft sign-in. The shared allowlist
includes these hosts and their subdomains:

- Application, assets, Xbox authentication, profiles, and regional streaming APIs:
  `xbox.com`, `xboxlive.com`, `xboxservices.com`, `catalog.gamepass.com`.
  This covers `sisu`, `user.auth`, `xsts.auth`, `gamingconsent`, `gssv-play-prod`,
  and regional `*.gssv-play-prod.xboxlive.com` endpoints.
- Microsoft authentication and verification: `login.live.com`, `account.live.com`,
  `login.microsoftonline.com`, `logincdn.msauth.net`, `logincdn.msftauth.net`,
  `fpt.live.com`, `df.cfp.microsoft.com`.
- Account, family, and consent: `account.microsoft.com`, `family.microsoft.com`,
  `consentservice.microsoft.com`, `consent.config.office.com`, `wcpstatic.microsoft.com`.
- Catalog and artwork: `displaycatalog.mp.microsoft.com`, `ratingsedge.rnr.microsoft.com`,
  `store-images.s-microsoft.com`, `res.public.onecdn.static.microsoft`.
- Shared navigation: `uhf.microsoft.com` and its observed asset host
  `uhf-exp-fd-gbcrdgggfbggh0g3.b02.azurefd.net`.
- Narrow shared dependencies: `cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/`,
  `www.microsoft.com/store/buy/cartcount`, and
  `www.microsoft.com/store/XboxComMsCom3PAdsOptOutCookieSync.html`.

The app frame grants Xbox pointer lock, gamepad, microphone, and screen wake lock;
the inner launcher delegates the corresponding permissions. Microphone access
still requires browser permission. The Bare relay carries HTTP and WebSockets;
Xbox's WebRTC media connection is browser-native and is **not** tunneled through
this relay. Actual gameplay therefore requires account, entitlement, controller,
and network verification. The inventory is not a promise that every future
region or authentication challenge uses the same domains.

Two shared engine corrections accompany this addition:

- Preserve noncomputed class-field names (`parent`, `top`, `location`, `eval`).
  Xbox's dependency container otherwise becomes invalid JavaScript and repeatedly
  fails to load chunk 2092. Computed keys and field values still get rewritten.
- Await a script-written cookie's commit before refreshing `document.cookie`.
  The previous asynchronous refresh could replace a freshly rotated login token
  with an older IndexedDB snapshot.

The relay now records `experience_upstream_response` for upstream HTTP errors and
`experience_upstream_failed` for network failures/timeouts. Fields contain only
host, method, status/error category, and elapsed time; no paths, queries, cookies,
or authentication tokens. This distinguishes upstream 403/429 responses from
allowlist failures even though the Bare envelope normally returns HTTP 200.

Local ChromeOS-UA testing at 1365×900 and 390×844 reached Xbox's catalog
and Microsoft email sign-in inside both sandboxed frame layers,
with no uncaught Xbox JavaScript errors after the rewriter fix. Local test-browser
permission was granted for localhost network access. The same testing reached
Spotify's email/Google/Apple login screen, and YouTube's Google sign-in screen.
The YouTube test video returned `playabilityStatus: OK` and video `readyState: 4`.
TikTok's direct feed played, but the proxied feed still returned upstream 403s and
its monitoring SDK reported `a.init is not a function`. That failure remains
unresolved; broadening unrelated domains is not an established fix. No completed
account logins, Spotify licensed playback, or Xbox gameplay were verified.

Deploy **both** the app and Experience Worker to release the tile, permissions,
allowances, and engine changes together. This work was verified locally, not
released to production.
