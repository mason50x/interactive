# 50x

Next.js + Convex + Clerk + Tailwind foundation. Clerk owns authentication;
every signed-in user is mirrored into the Convex `users` table.

## Running it

```bash
npm run dev      # Next.js + convex dev, and prints both origins
```

It comes up on two of them:

| | | |
|---|---|---|
| App | `http://localhost:3000` | the site, the dashboard, the session |
| Player | `http://127.0.0.1:3000` | games only; `/` is a 404 here |

That is one server reached by two hostnames — see [Two origins](#two-origins).

## How auth flows through

1. `src/proxy.ts` runs `clerkMiddleware()` on every request, which is what
   makes the session readable by `auth()` and `currentUser()`. It enforces
   nothing: authentication lives on the resource. Every page under
   `/dashboard` calls `auth.protect()` itself, and the layout repeats it as a
   floor — the router does not re-render a shared layout on navigation between
   pages beneath it, so a layout-only check would not hold. The one thing
   middleware still decides is cosmetic: sending a signed-in visitor from `/`
   or a sign-in form to the dashboard, which keeps `/` statically rendered.
2. `ClerkProvider` (in `src/app/layout.tsx`) wraps the app, and
   `ConvexClientProvider` sits inside it. `ConvexProviderWithClerk` passes the
   Clerk session token to Convex, so `ctx.auth.getUserIdentity()` resolves
   inside queries and mutations.
3. `convex/auth.config.ts` tells Convex to trust that token. It reads
   `CLERK_JWT_ISSUER_DOMAIN` from the Convex deployment's environment and
   matches `applicationID: "convex"` against the `aud` claim of the **convex**
   JWT template in the Clerk dashboard.

### The convex JWT template

Convex builds `identity` purely from the claims in the token, so the template
has to emit them. A template containing only `{"aud": "convex"}` authenticates
fine but yields an identity with no email, name, or picture — rows land with
just a `clerkId`. The template configured on this instance is:

```json
{
  "aud": "convex",
  "email": "{{user.primary_email_address}}",
  "name": "{{user.full_name}}",
  "picture": "{{user.image_url}}",
  "given_name": "{{user.first_name}}",
  "family_name": "{{user.last_name}}",
  "nickname": "{{user.username}}"
}
```

Convex maps `email` -> `identity.email`, `name` -> `identity.name`, and
`picture` -> `identity.pictureUrl`. Add a claim here first if you want a new
field available to `users.store`.

## How users reach the database

Two paths, both funnelling into one `upsertUser` helper in `convex/users.ts`:

- **Client sync** — `<StoreUser />` calls `users.store` once the Convex client
  is authenticated. It reads name/email/image from the verified JWT, never from
  client arguments. This works with no extra setup.
- **Webhook** — `convex/http.ts` exposes `/clerk-users-webhook`, verifies the
  Svix signature, and handles `user.created`, `user.updated`, and
  `user.deleted`. This is the authoritative sync and the only path that catches
  profile edits and deletions made outside the app.

The webhook is live on both Clerk instances, each pointed at its own Convex
deployment's `.convex.site` host (not `.convex.cloud`) and subscribed to
`user.created`, `user.updated`, and `user.deleted`:

| Clerk instance | endpoint |
| --- | --- |
| development (`great-joey-9314`) | `https://cheerful-guanaco-637.convex.site/clerk-users-webhook` |
| production (`clerk.interactivelearningresources.org`) | `https://posh-chicken-69.convex.site/clerk-users-webhook` |

Each endpoint has its own signing secret, stored as `CLERK_WEBHOOK_SECRET` on
the matching Convex deployment. Rotating one in the Clerk dashboard means
re-running `npx convex env set CLERK_WEBHOOK_SECRET whsec_...` (add `--prod`
for production) — a mismatched secret makes every delivery fail verification
and return 400.

### Deleting a user

`user.deleted` runs `users.deleteFromClerk`, which is the single cascade point
for erasing someone from Convex. It deletes every `users` row for that Clerk id
— `.collect()` rather than `.unique()`, so a stray duplicate can't throw and
wedge the webhook on Svix's retries — and a delete for an unknown user is a
no-op, which keeps retries and dashboard replays safe to apply twice. It also
clears the two other tables keyed by that id: the `invites` they spent and
their `preferences` row. The streak needs no line of its own, being fields on
the `users` document rather than a table.

One thing it deliberately leaves alone: invitations this user sent that are
still pending at Clerk. An invitation already in someone's inbox is addressed
to that person, not to the account that sent it, and there is no signed-in
caller here to revoke them as.

**When you add a table that holds user-owned rows, delete them in
`deleteFromClerk` too.** Nothing else erases them, so anything missed there
outlives the account.

## Invitations

Sign-up is invite-only, and every account gets five invitations of its own —
invited accounts included, with no grant step: the allowance is five minus the
rows you own, and a new user owns none.

The work is split because neither system can do it alone. Clerk owns the
invitation (`invitations.createInvitation` is a Backend API call, so it needs
the secret key and can never run in a browser) and has no notion of a per-user
budget. Convex owns the accounting, because it is the side that can count five
transactionally. `src/lib/invite-actions.ts` is the seam between them, and the
order is the whole design:

1. `invites.reserve` writes a `sending` row inside the same transaction as the
   count that allowed it. Two clicks a few milliseconds apart cannot both read
   four-used.
2. Clerk mails the invitation.
3. `invites.confirm` turns the reservation into a spent credit, or
   `invites.release` deletes it if Clerk refused — a failed send costs nothing.

Revoking runs the other way round: Clerk kills the link *first*, then
`invites.markRevoked` hands the credit back. Refunding first would leave a live
invitation in someone's inbox that this side had stopped counting.

The allowance is a count of rows rather than a number being decremented, which
is what makes a revoke refund for free and what makes the count survive a lost
response.

Acceptance is learned from the `user.created` webhook and nowhere else — Clerk
fires no event of its own for it, and the app never sees the sign-up, since the
recipient completes it on Clerk's side with the ticket from the email. The join
key is the email address, normalized on both sides.

Every export in `invite-actions.ts` is a Server Action, which means every one
is a public POST endpoint. Rendering the dialog for signed-in users only is not
the check; the `auth()` call at the top of each action is, and the ownership
checks in `convex/invites.ts` are the second one.

`NEXT_PUBLIC_SITE_URL` matters here more than anywhere else. Clerk bakes
`redirect_url` into the invitation at the moment it is created and mails it
out, so the origin has to be right *then* — see `src/lib/site-url.ts`. A
production invite carrying `localhost` is a dead link whose only symptom is
someone who cannot sign up.

## Streaks and preferences

Two small pieces of per-account state, stored differently on purpose.

**The streak** lives on the `users` row as three fields rather than in a table
of visits. Nothing ever asks for the log — the only questions are "how many
days in a row" and "is today one of them" — and keeping it on the document the
caller already has bounds the write to one patch per user per day. The day key
is the user's local day, not UTC: a streak is a human counting bedtimes, so the
client sends its UTC offset and the server does the arithmetic. The date itself
is never taken from the client. `streakCount` is the run that ended on
`streakLastDay`, which is not the same as the run in effect now; deciding
whether it is still alive is the reader's job.

**Preferences** get their own table, and the browser keeps a copy in
`localStorage` that is what the page actually reads. A preference needing a
round trip would paint the wrong accent first, and the panic key has to work on
a page that has not finished loading. The row is what makes the choices follow
the person to their next browser, and it wins on a conflict: on sign-in it is
copied down over whatever the device had. The theme is deliberately *not* in
it — a laptop in a bright room and a phone in bed want different answers from
the same account, so it stays device-local.

The accent is stored as a name from `src/lib/preferences.ts`, not a colour,
which is what lets the palette be retuned without rewriting anyone's row and
makes a bad value a fallback rather than an arbitrary colour on the page.

## Environment variables

The Vercel project `cognify/interactive-learning` holds all three
environments, each mirroring `.env.local` exactly:

```bash
vercel env pull          # rewrites .env.local from Vercel
vercel env ls
```

They are stored as Config (readable) rather than Sensitive, which is what makes
`vercel env pull` able to return real values. That is fine for the Clerk
*development* instance keys. Once real production keys land, mark
`CLERK_SECRET_KEY` sensitive for Production — production never needs `env pull`.

Each environment points at its own backends:

| variable | Development / Preview | Production |
| --- | --- | --- |
| `NEXT_PUBLIC_CONVEX_URL` | `cheerful-guanaco-637` (dev) | `posh-chicken-69` (prod) |
| `CONVEX_DEPLOYMENT` | `dev:cheerful-guanaco-637` | `prod:posh-chicken-69` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_test_` | `pk_live_` |
| `CLERK_SECRET_KEY` | `sk_test_` (Config) | `sk_live_` (Sensitive) |
| `CONVEX_DEPLOY_KEY` | not set | prod deploy key (Sensitive) |
| `NEXT_PUBLIC_PLAYER_ORIGIN` | `http://127.0.0.1:3000` / unset on Preview | the player domain |
| `PLAYER_TOKEN_SECRET` | per environment (Sensitive) | per environment (Sensitive) |
| `NEXT_PUBLIC_ASSET_ORIGIN` | the bucket's public domain (same one) | the bucket's public domain |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` / unset on Preview | `https://interactivelearningresources.org` |

Production's `CLERK_SECRET_KEY` is stored Sensitive, so `vercel env pull
--environment=production` returns it blank. That is expected — only the build
and runtime can read it.

Note that `vercel env add --force` silently no-ops against a record that spans
two targets. Remove the combined record first, then add each target separately.

Two variables live on the Convex deployment instead of here, because Convex
functions read them at runtime:

```bash
# dev deployment
npx convex env set CLERK_JWT_ISSUER_DOMAIN https://great-joey-9314.clerk.accounts.dev
npx convex env set CLERK_WEBHOOK_SECRET whsec_...

# prod deployment
npx convex env set --prod CLERK_JWT_ISSUER_DOMAIN https://clerk.interactivelearningresources.org
npx convex env set --prod CLERK_WEBHOOK_SECRET whsec_...
```

Both are set on both deployments. The webhook secret is per Clerk instance, so
the two deployments hold different `CLERK_WEBHOOK_SECRET` values — see the
webhook endpoint table above.

### Production DNS

The Clerk production instance serves from
`clerk.interactivelearningresources.org`, and these CNAMEs are live. They are
what lets Convex fetch the JWKS; without them production sign-in fails, so if
sign-in ever breaks wholesale this is the first thing to re-check:

| host | CNAME target |
| --- | --- |
| `clerk` | `frontend-api.clerk.services` |
| `accounts` | `accounts.clerk.services` |
| `clkmail` | `mail.elzh40fke12s.clerk.services` |
| `clk._domainkey` | `dkim1.elzh40fke12s.clerk.services` |
| `clk2._domainkey` | `dkim2.elzh40fke12s.clerk.services` |

```bash
curl -sI https://clerk.interactivelearningresources.org/.well-known/jwks.json
```

## Deployments

`main` is connected to `mason50x/interactive-learning` (private) and deploys to
production on every push. Other branches get preview deployments.

### Commit authorship

The repository is private and `cognify` is a Hobby team, and the Hobby plan does
not support collaboration on private repositories. So Vercel builds a commit
only when its author is the team owner. Which half of the author it compares
depends on how the deploy was created, and the deploy history shows both:

| deploy source | author email | GitHub login | result |
| --- | --- | --- | --- |
| git | masonsyzn@ | mason50x | READY, then BLOCKED |
| git | masonsingel20@ | Msingelhassio | BLOCKED |
| cli | masonsingel20@ | — | READY |
| cli | masonsyzn@ | — | BLOCKED |

A git deploy carries `githubCommitAuthorLogin`, and Vercel matches that against
the login connected to the account. A CLI deploy has no login, so it falls back
to the verified addresses on the account — which is why the same commit can be
blocked through git and build through the CLI. The `masonsyzn@` git deploys
built until the GitHub connection lapsed and the fallback started applying.

So both halves have to line up: the connected login must be the account that
authors the commits, and that account's address must also be verified on Vercel
so the fallback agrees. Two addresses have authored here, which is what makes
this worth writing down.

A commit authored under the wrong address is accepted by GitHub and pushed
normally; the deploy is then created and immediately `BLOCKED`, with no build
and no log to read. Nothing about the push says so.

`.githooks/pre-commit` refuses to write such a commit and `.githooks/pre-push`
refuses to push one that arrived from somewhere the first hook did not run —
another machine, a cloud agent, the GitHub web editor. `npm install` runs
`prepare`, which points `core.hooksPath` at `.githooks`, so a fresh clone is
covered without anyone remembering. The address is `vercel.authorEmail` in git
config, defaulting to the one the Vercel account carries; `VERCEL_AUTHOR_CHECK=0`
skips the check for a commit that genuinely belongs to someone else.

The hooks only keep the repository consistent. What makes Vercel accept the
address is on the account: under **Account Settings → Login Connections** the
GitHub account must be connected and must be the one that authors the commits,
and under **Account Settings → Email** every address used to author commits
should be added and verified, which covers the fallback. A commit blocked for
this reason needs no new commit once the account is fixed — redeploying it from
the dashboard is enough.

Until then the CLI is the way out, deploying from a tree with no git metadata at
all so neither check applies:

```sh
d=$(mktemp -d) && git archive HEAD | tar -x -C "$d"
mkdir -p "$d/.vercel" && cp .vercel/project.json "$d/.vercel/"
(cd "$d" && vercel deploy --prod)
```

That ships exactly what is committed — `git archive` carries tracked files only,
so `.cache`, `node_modules` and `.env*` stay out — and the build runs on Vercel
against the Production environment, so `CONVEX_DEPLOY_KEY` is present and the
Convex backend ships with it as usual.

A production build ships the Convex backend along with the frontend.
`vercel.json` overrides the build command with:

```sh
if [ -n "$CONVEX_DEPLOY_KEY" ]; then npx convex deploy --cmd 'npm run build'; else npm run build; fi
```

`npx convex deploy` runs `npm run build` first, with
`NEXT_PUBLIC_CONVEX_URL` and `NEXT_PUBLIC_CONVEX_SITE_URL` set to the deployment
its key names, then typechecks `convex/`, regenerates `convex/_generated`, and
pushes functions, indexes, and schema there. Any step failing fails the Vercel
build, so the frontend and the backend land together or not at all.

The key is `CONVEX_DEPLOY_KEY`, stored Sensitive on **Production only** and
minted with:

```bash
npx convex deployment token create vercel-production --prod
```

Preview builds have no key, so the `else` branch runs a plain `npm run build`
and they keep talking to the shared dev deployment (`cheerful-guanaco-637`),
whose functions `npx convex dev` pushes from your machine.

To give each preview branch its own Convex backend instead, generate a
**Preview** deploy key in the Convex dashboard under Project Settings (the CLI
only mints keys scoped to an existing deployment) and add it as
`CONVEX_DEPLOY_KEY` for Vercel's Preview environment — the build command picks
it up with no further changes, naming each deployment after its branch. Drop the
Preview `CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL`, and
`NEXT_PUBLIC_CONVEX_SITE_URL` overrides at that point — the key picks the
deployment and `--cmd` injects both URLs.

## Two origins

Games are third-party code. Even the one in this repo today is a stand-in for
bundles a studio shipped, so the rule is written for the worst case: anything
executing on the app's own origin can read `localStorage`, lift the Clerk
session, and call Convex as the signed-in user. Games therefore answer on a
hostname of their own, and the browser enforces the rest — an origin is
scheme + host + port, and a document on the far side of that line cannot reach
across it whatever it does with the DOM it is handed.

It is still **one codebase and one Vercel project**. The split is a hostname:

- `src/proxy.ts` reads the `Host` header. The player host is rewritten into the
  `/player` segment and never reaches `clerkMiddleware`; on the app host,
  `/player/*` 404s outright, so a game can never be framed same-origin where
  the `sandbox` attribute would be decorative.
- `AppProviders` (Clerk, Convex, analytics) is mounted by `(site)`, `/auth` and
  `/dashboard` rather than by the root layout, which also wraps `/player`.
  Mounting it higher would load Clerk's script and set its cookies on the
  player origin.
- `next.config.ts` sets `frame-ancestors` per host: the player may be framed by
  the app and nothing else, the app by nothing at all. It matches on hostname
  with the port stripped — that is what a `has: [{ type: "host" }]` matcher
  compares, and a value carrying `:3000` silently matches nothing.
- The frame gets `sandbox` and a `postMessage` channel, nothing else. A score
  arriving from it is a claim, not a fact: `GameFrame` displays it and anything
  destined for Convex has to be written by code the player cannot reach.

### Nothing on the player origin is public

Requiring a session there is exactly what the boundary forbids — a Clerk cookie
on the player origin is a cookie game code can read. So the app signs instead.
`src/lib/player-token.ts` mints a short HMAC grant, the dashboard puts it in
the frame's URL, and the proxy verifies it before any rewrite happens. No
grant, expired, or forged all answer the same bare 404, so nothing about why is
observable and a crawler sees no page at all. The player origin also serves its
own `Disallow: /` robots.txt, since the app's would otherwise allow the game
paths.

A grant says one thing: this came from someone signed in, recently. It is not
scoped to a game, because being signed in *is* the entitlement — every game is
available to every account. If that stops being true, the check belongs on the
dashboard route that decides to render the frame, not on the grant; the player
origin should not be the place that knows who may play what.

A grant is not a session and cannot become one: it authorises loading games for
two hours, reaches nothing else, and names its subject as a keyed hash of the
Clerk user id rather than the id itself — it travels in the URL, where game
code can read it, so it must not carry an identifier.

`PLAYER_TOKEN_SECRET` signs them and is required in every environment. Without
it the player origin refuses everything rather than falling open.

Two things it does **not** cover, worth knowing before treating it as a content
gate. Static chunks under `/_next/` are excluded from the proxy matcher and
stay public — they are the same bundle the app serves, so there is no game
content in them. And the grant is only tested when the document loads, so a run
in progress never gets interrupted and a reload after two hours needs a fresh
one from the dashboard.

A third is now live: the asset origin, where hosted bundles are served from,
sits outside this deployment entirely and so outside the proxy that checks
grants. See [The asset origin](#the-asset-origin).

`NEXT_PUBLIC_PLAYER_ORIGIN` names the player origin. Leave it unset and games
fall back to `/player/<slug>` on the app's own origin with no isolation, which
is how preview deployments work with no configuration; `GameFrame` drops
`allow-same-origin` from the sandbox to compensate. Production always sets it.

Games are not added one at a time — the catalogue is generated. See below.

## The game catalogue

Every game is a static bundle (HTML, WASM, Unity, Flash) served from the asset
bucket. There were briefly two kinds, the second being a game compiled into the
app's own bundle, carried as a discriminated union on a `runtime` field; that
is gone and so is the union. `src/lib/games.ts` documents the shape to restore
if one comes back.

The catalogue comes from the [Seraph](https://github.com/a456pur/seraph)
archive and is generated, never edited:

```bash
node scripts/build-catalogue.mjs   # rewrites src/lib/games.catalogue.json
node scripts/migrate-to-r2.mjs     # fills the bucket to match
```

The generator takes titles, genres, and *order* from upstream's own index
page. That order is the app's only popularity signal — upstream hand-sorts it
most-played first — so it becomes `rank`, and the dashboard's popular shelf is
the head of it. Everything past `POPULAR_COUNT` is reachable only by search,
which runs client-side over the whole catalogue.

**What the generator drops.** Any game directory containing a console ROM. The
upstream archive ships ~124 of them — Nintendo, Konami, Sega — as raw `.nds`
and scene-named `.zip` files. Permission from the archive's maintainer covers
the archive's own work and cannot extend to those, so the test is on the file
extension rather than on anyone's assurance: see `EXCLUDED_EXTENSIONS` in
`scripts/build-catalogue.mjs`. Removing the ROM alone would leave an emulator
shell that boots to a black screen, so the whole directory goes.

This is a carve-out, not a clearance. Plenty of what remains is commercial web
content that upstream also had no licence to redistribute; dropping the ROMs
removes the least defensible class, not the question.

**What the migration rewrites.** Every game page, on the way into the bucket
— `patchGameHtml` in `scripts/migrate-to-r2.mjs`. Upstream templates the same
header into all 366 of them, carrying its own Google Analytics measurement id;
uploaded as-is, every play by a signed-in user would beacon to a third party we
do not control. The same pass drops a tab-cloaking helper we do not serve and
repoints the Ruffle loader at our own bucket instead of unpkg. A grep over the
result fails the run if any of the three survives, so a template change
upstream stops the migration rather than quietly reintroducing the leak.

**Flash.** 159 of the 366 are `.swf`, including Papa's Pizzaria and Papa's
Burgeria at fourth and fifth on the popular shelf, and no browser has run Flash
natively since 2020. They work because [Ruffle](https://ruffle.rs) is uploaded
alongside them at `storage/ruffle` — 27 MB, the one path outside `games/` the
migration touches. The relative path in those pages
(`../../storage/ruffle/ruffle.js`) is why it has to land at exactly that key.

## The asset origin

Hosted bundles are served from a Cloudflare R2 bucket, and
`src/lib/assets.ts` is the only module that knows its URL
(`NEXT_PUBLIC_ASSET_ORIGIN`).

They are not in the deployment for two reasons, both hard: there are ~18,000
files, against a documented Vercel limit of 15,000 per deployment; and 5.4 GB
served from Vercel bills as Fast Data Transfer, where the Hobby allowance is
100 GB a month and a single visitor working through the larger titles moves a
quarter of a gigabyte. R2 charges nothing for egress.

**The bucket is not gated, and this is the one place the grant does not
reach.** `src/proxy.ts` verifies a grant on requests to *this deployment*; a
request straight to the bucket never passes through it. So the catalogue, the
dashboard, and every score path stay behind the session, but a bundle URL,
once known, fetches without one. That is an accepted trade for a copy of a
public archive — closing it means short-lived signed bucket URLs minted beside
the grant, and it should be closed before anything private lands there.

**Do not open a game while `migrate-to-r2.mjs` is running.** R2 serves a 404
with the same `cache-control: max-age=14400` it puts on a hit, so an asset
requested a moment before it finished uploading is cached as missing — at the
Cloudflare edge *and* in the browser — for four hours after the bucket became
correct. The game stays broken long after the migration succeeded, which reads
as a failed migration and is not one. If it happens: purge the asset zone's
cache (Caching → Configuration → Purge Everything) and hard-reload.

Three origins now, and only two of them are boundaries:

| origin | what it is |
| --- | --- |
| app | the session, the dashboard, Convex |
| player | where game code is allowed to run — the boundary that matters |
| asset | a file server; framed *by* the player, so it inherits that document |

## Layout

```
convex/
  schema.ts        users, invites, preferences
  auth.config.ts   trusts Clerk-issued JWTs
  users.ts         current / store / upsertFromClerk / deleteFromClerk
  invites.ts       the five-invite allowance, counted transactionally
  streaks.ts       the daily streak, one write per user per day
  preferences.ts   the account-level half of the settings sheet
  http.ts          Clerk webhook endpoint
src/
  proxy.ts         host dispatch; clerkMiddleware; signed-out-only redirects
  lib/
    player.ts      where games are allowed to run, and why
    assets.ts      where hosted bundles are served from, and what that costs
    games.ts       the catalogue: authored + generated, one union
    games.catalogue.json   generated — do not edit
    nav.ts         the rail's destinations
    site-url.ts    the origin an invitation link has to be baked with
    invitations.ts the Clerk Backend API calls
    invite-actions.ts  the seam: Convex counts, Clerk sends
    preferences.ts accents, the panic key, and their defaults
    streak.ts      the client's half of the streak
  app/
    layout.tsx     document shell only — no providers (see Two origins)
    (site)/        landing, marketing chrome
    auth/          sign-in, sign-up, accept-invite
    dashboard/
      activities/  the shelves, and [slug] — one route for every game
    player/[slug]  the player origin's only route
  components/
    app-providers.tsx      Clerk > Convex > analytics; never on /player
    preferences-provider.tsx  localStorage first, the row second
    streak-provider.tsx    reports a visit once a day
    app/game-frame.tsx     the app's side of the boundary
    app/activities-browser.tsx  popular shelf + client-side search
    app/settings-sheet.tsx accent, constellation, panic key
    app/invite-card.tsx    the allowance, in the account menu
    player/hosted-game.tsx frames a bundle from the asset origin
scripts/
  build-catalogue.mjs  regenerates the catalogue from upstream
  migrate-to-r2.mjs    stages and syncs bundles to the bucket
```

## Adding a table

Add it to `convex/schema.ts`, write functions in a new `convex/*.ts` file, and
`npx convex dev` regenerates `convex/_generated`. Gate anything user-scoped on
`ctx.auth.getUserIdentity()` the way `users.ts` does.
