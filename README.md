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
whether it is still alive is the reader's job. Only Monday–Friday advances the
streak: weekends neither increment it nor break it, and the strip shows those
five weekdays. Existing counts and personal bests are preserved.

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

A third one is for chat pictures. Every picture is run past OpenAI's
moderation endpoint before anybody sees it — the endpoint is free, so the key
is never billed for this — and without the key every picture is refused
rather than let through unread. See `convex/moderation/images.ts`.

```bash
npx convex env set OPENAI_API_KEY sk-...
npx convex env set --prod OPENAI_API_KEY sk-...
```

The feature has its own switch, so it can be turned off without a deploy.
`1` is on; anything else is off — the plus button goes, pastes and drops are
ignored, and the server refuses uploads. Pictures already sent stay visible.
See `convex/features.ts`.

```bash
npx convex env set IMAGES_ENABLED 1
npx convex env set --prod IMAGES_ENABLED 1
```

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

`main` is connected to `mason50x/interactive-learning` (private), but the git
integration does not currently build anything. Deploy with `npm run deploy`.

### Why pushing does not deploy

`cognify` is a Hobby team and the repository is private, and the Hobby plan does
not support collaboration on private repositories — so Vercel builds a commit
only when it can match the author to the team owner. It compares the GitHub
account under **Login Connections**, or, when no account is connected, the
verified addresses on the Vercel account.

Neither matches here, and no local git setting changes that. Every git deploy
since 2026-08-31 07:55 CDT has been `BLOCKED` regardless of who authored it —
`masonsyzn@` / `mason50x` and `masonsingel20@` / `Msingelhassio` alike — while
CLI deploys of those same commits went `READY` minutes apart. The block is on
the account, not in the commit. It arrives with no build and no log to read; the
only trace is the deployment's `errorLink`, which points at
[troubleshoot-project-collaboration][collab].

[collab]: https://vercel.com/docs/deployments/troubleshoot-project-collaboration#team-configuration

The connection went stale rather than missing, which is why the account looked
connected while nothing built. `/v2/user` kept reporting
`importFlowGitProvider: github`, but
`/v1/integrations/git-namespaces?provider=github` returned `[]` — the connection
reached no GitHub account at all. With no namespace to resolve the author
against, every commit fails the ownership check equally, which is what made the
blocks look indifferent to who authored them.

That endpoint is the one to check, because it is the only one that distinguishes
a live connection from a stale one. Reconnecting repopulates it:

```json
[{ "provider": "github", "slug": "mason50x", "id": 69379218, "ownerType": "user" }]
```

The `id` there is Vercel's own namespace id, not a GitHub user id — looking it up
against GitHub's user API returns an unrelated account.

The fix is at [vercel.com/account/authentication][auth] — avatar → **Settings** →
**Authentication** in the left sidebar. Remove the GitHub connection there and
add it back as `mason50x`. It has to be removed first: a Hobby team allows only
one login connection per provider, so there is no way to add the second GitHub
account alongside the first. Confirm a passkey or email login works before
removing it, since that connection may be how the account signs in.

[auth]: https://vercel.com/account/authentication

Fixing the account does not rescue anything already blocked. A blocked
deployment can never be rebuilt — the API refuses it with
`deployment_can_never_deploy`, "Please try again from a fresh commit" — so the
only way to confirm the account is working again is to push a new commit and
watch what the deploy does.

### Deploying

```sh
npm run deploy               # production
npm run deploy -- --preview  # a preview URL
```

`scripts/deploy.mjs` exports `HEAD` with `git archive` into a temporary
directory and runs `vercel deploy` there. A CLI deploy carries no commit author,
so the ownership check does not apply. Exporting rather than uploading the
working directory is what keeps the deploy honest about what shipped: `git
archive` carries tracked files only, so `.cache`, `node_modules` and `.env*`
stay out, and what lands is exactly what is committed. The build still runs on
Vercel against the Production environment, so `CONVEX_DEPLOY_KEY` is present and
the Convex backend ships with it as usual.

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

**What the generator drops.** Shooters — games whose core mechanic is
shooting a gun — via `EXCLUDED_SLUGS` in `scripts/build-catalogue.mjs`, a
judgement list keyed by slug with upstream's title noted beside each entry. And any game directory containing a console ROM. The
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
do not control. The same pass drops a tab-cloaking helper we do not serve,
repoints the Ruffle loader at our own bucket instead of unpkg, and strips
upstream's branding: the `| Seraph` suffix on every title, the one loading
splash that names the archive, and a favicon link into a directory we never
upload. A grep over the result fails the run if any of them survives, so a
template change upstream stops the migration rather than quietly reintroducing
the leak — or the name. Why the name matters is under
[The asset origin](#the-asset-origin).

The pass also removes the paired `antiClickjack` style and frame-busting script
from Moto X3M Pool, Spooky, and Winter. That upstream block hides the body when
framed and tries to navigate the top window; our sandbox correctly blocks the
navigation, leaving a black screen. An unrecognized version of the block fails
validation instead of being uploaded. The same pass restores the missing
`content` container these Phaser bundles require for input and resume listeners.
The sandbox stays unchanged.

To repair these three existing bucket pages without staging every game, run
`node --env-file=.env.local scripts/repair-moto-pages.mjs --dry-run`. It fetches
the live pages and validates the patches without writing to R2. With `rclone`
installed and the four `R2_*` migration credentials exported, omit `--dry-run`
to upload just their `index.html` files. Purge those three URLs from Cloudflare's
cache afterward and reload the games. An app deployment alone does not update
the bucket. Regression checks: `npx vitest run scripts/tests/activity-html.test.ts`.

**Where a bundle lands.** Not under its slug. Each catalogue entry carries a
`path` — the slug reversed, so Crossy Road (`crossy`) is served from
`activities/yssorc/index.html` — and that field, never the slug, is the bucket
key. Titles are untouched. `bucketPath` in `scripts/build-catalogue.mjs` is the one place the rule is
written; the migration lays the bucket out from the field and
`activityBundleUrl` reads it back from the same field. Routes, thumbnails, and
scores all still key on the slug.

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

**Content filters see the bucket as a site of its own.** School filters
categorise per hostname, and the asset host is a hostname with no front page
— an R2 custom domain answers `/` with a 404 — so a scanner that visits it
finds nothing but the game pages. Securly's PageScan did exactly that and
filed the host under adult content while leaving the site alone. Two things
fed it: every page was titled `<Game> | Seraph`, an unblocked-games archive
its database already had on file, and the scanner is tuned for violence,
which the popular shelf has plenty of. The migration now strips the branding
and uploads a `robots.txt`, and two more things live outside the repo:

- Add a Redirect Rule in the asset zone (Rules → Redirect Rules) sending `/`
  on the asset hostname to the site, so a rescan or a human reviewer lands on
  something that explains what the host is.
- Recategorisation can only be requested by a district's Securly admin, from
  Policy Editor → Category Lookup. The honest category is Games, which most
  districts block by default, so the outcome that actually works is the admin
  adding the asset host to the Allow list beside the site.

Do not rotate the hostname to get out from under a block. The same content
earns the same label within days, and the hop reads as evasion to whoever
reviews the next appeal. `config/domains.md` covers what a move is for.

Three origins now, and only two of them are boundaries:

| origin | what it is |
| --- | --- |
| app | the session, the dashboard, Convex |
| player | where game code is allowed to run — the boundary that matters |
| asset | a file server; framed *by* the player, so it inherits that document |

## Layout

```
convex/                 the backend; Convex bundles it on its own terms
config/                 hand-laid tables: domains and the chat admins
scripts/                catalogue and asset tooling, deploy, and the vitest suite under tests/
src/
  proxy.ts              host dispatch; clerkMiddleware; signed-out-only redirects
  app/
    layout.tsx          document shell only — no providers (see Two origins)
    (site)/             landing, about, contact — the marketing chrome
    (legal)/            /pp and /tos, the same reader over two documents
    auth/               sign-in, sign-up, accept-invite
    dashboard/          everything behind the sign-in; each page calls auth.protect()
      activities/       the shelves, and [slug] — one route for every activity
      chat/             the conversation column and [conversationId]
      learning-simulator/  the library, and [contentHash] in two formats
    learn/[slug]        the activity shell, framed by the dashboard
  components/
    ui/                 the primitives — see Primitives below
    app/                the dashboard: rail, search, settings, activities, home
      chat/             the chat feature; thread/, group-panel/, chat-tools/ split its screens
      rail/ search/ settings/ user-menu/ invite/ constellation/
                        the pieces each shell file is assembled from
    landing/            one file per band of the landing page, plus the shared parts
    legal/              the legal reader
    simulator/          both simulator formats over one set of shared parts
    activity/           the /learn side of the activity boundary
    *.tsx               providers and site chrome mounted from src/app
  lib/
    use-*.ts            React hooks with no UI of their own
    simulator/          the simulator's engine, stores and sync (under test)
    *.ts                pure modules: one vocabulary each
```

A shell file — `app-sidebar.tsx`, `thread.tsx`, `settings-panel.tsx` — keeps
its path and its exports and is assembled from the folder of the same name
beside it. Nothing is reached through a barrel; every import names the module
it wants.

### Primitives

`src/components/ui/` is the whole visual vocabulary, and anything drawn more
than once in the app is drawn there once:

| primitive | what it is |
| --- | --- |
| `Button`, `ButtonLink` | every button; `shape="circle"` for an icon in a round well |
| `Card` | the raised surface, with `radius`, `surface` and `hover` variants |
| `Section`, `SectionHeading`, `PageIntro`, `Eyebrow` | a band of a marketing page and its head |
| `Container`, `Page`, `PageTitle` | the measure of a site page and of a dashboard page |
| `Input`, `InputGroup`, `InputAddon`, `Textarea` | the one text field, alone or with company |
| `Select`, `Switch`, `SegmentedControl` | the other controls |
| `Menu*`, `Popup`, `popupVariants`, `Tooltip*`, `Sheet*` | every floating surface, on one popup style |
| `Badge`, `CountBadge`, `Kbd`, `Pips` | small marks |
| `Alert`, `FieldError`, `EmptyState`, `Spinner` | states |
| `Separator`, `CheckList`, `OutlineIcon`, `SolidIcon` | the rest |

Variants are `cva`; classes merge through `cn`, so a caller that passes a
conflicting utility wins. Every primitive spreads its props and carries a
`data-slot`.

### Conventions

- **Formatting** is Prettier's, with the Tailwind class-sorting plugin:
  `npm run format`, and `npm run format:check` in CI. `npm run typecheck`
  runs `next typegen` first so the route prop types exist.
- **Type is set at its natural case and spacing.** No `uppercase`, no
  `tracking-*`, no `letter-spacing`, in a class or an SVG attribute — and
  ESLint says so if one appears.
- **Imports** go through `@/` for `src`, `@convex/` for the backend's
  generated API and types, and `@config/` for the tables. Value imports from
  `convex/chat` and anything from `convex/moderation` are refused by lint;
  see `eslint.config.mjs` for why.
- **Modules** are named exports, `type` rather than `interface`, inline prop
  types, `"use client";` on line one followed by a blank line, and a header
  comment that says what the file is for and why it is shaped that way. The
  three simulator chunks that `dynamic()` imports keep a default export.
- **Hooks** with no UI live in `src/lib/use-*.ts`. `useAuthedQuery` is how a
  dashboard component asks Convex for something behind the sign-in;
  `useDebounced`, `useClickOutside`, `useTransientFlag` and `useHeld` are the
  four patterns that used to be re-typed.
- **Browser storage** goes through `src/lib/storage.ts`, and a message
  between two distant parts of the page through `channel` in
  `src/lib/events.ts`.

## Adding a table

Add it to `convex/schema.ts`, write functions in a new `convex/*.ts` file, and
`npx convex dev` regenerates `convex/_generated`. Gate anything user-scoped on
`ctx.auth.getUserIdentity()` the way `users.ts` does.

## Learning Simulator

The protected `/dashboard/learning-simulator` library accepts `.gb` / `.gbc`
imports. Imported program files are cached in account-namespaced IndexedDB on
this browser so they can be reopened after refresh; they are never uploaded.
Only metadata and bounded native progress checkpoints sync to Convex. Deleting
an entry or clearing the local library also removes its cached program. A new
browser, cleared browser storage, or a failed cache write requires selecting the
original file again. Starting playback still requires a click to enable audio.

Local autosave runs every ten active seconds; cloud sync runs every minute and
on explicit save/pause. Current/previous autosaves and three manual slots use
revision checks, a durable outbox and explicit conflict choices. Cloud limits
are 20 entries and five slots each, up to 512 KiB binary per slot. Web Locks are
required to start a player; the same file cannot run twice in one browser profile.

- `npm run test:simulator`: verify the pinned core, exercise actual WASM save
  restoration, and run file/Convex/synchronization regressions.
- `node scripts/build-simulator-core.mjs --fetch`: restore the pinned upstream
  runtime assets and verify their recorded checksums. Keep the bundled MIT notice.
- `npx convex dev --once`: generate/push functions to the configured development
  deployment; inspect `.env.local` deployment selection before running.

See [the implementation plan and verification report](docs/learning-simulator-mvp.md)
for routes, files, schema, privacy boundaries and release checks. No new secrets,
Next API endpoints, `_storage` blobs or production infrastructure are required.
