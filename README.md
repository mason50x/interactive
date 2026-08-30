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
no-op, which keeps retries and dashboard replays safe to apply twice.

**When you add a table that holds user-owned rows, delete them in
`deleteFromClerk` too.** Nothing else erases them, so anything missed there
outlives the account.

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

### Production DNS (outstanding)

The Clerk production instance serves from `clerk.interactivelearningresources.org`,
which is not yet pointed at Clerk. Until these CNAMEs exist, Convex cannot fetch
the JWKS and production sign-in will fail:

| host | CNAME target |
| --- | --- |
| `clerk` | `frontend-api.clerk.services` |
| `accounts` | `accounts.clerk.services` |
| `clkmail` | `mail.elzh40fke12s.clerk.services` |
| `clk._domainkey` | `dkim1.elzh40fke12s.clerk.services` |
| `clk2._domainkey` | `dkim2.elzh40fke12s.clerk.services` |

## Deployments

`main` is connected to `mason50x/interactive-learning` (private) and deploys to
production on every push. Other branches get preview deployments.

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
`src/lib/player-token.ts` mints a short HMAC grant naming one game and an
expiry, the dashboard puts it in the frame's URL, and the proxy verifies it
before any rewrite happens. No grant, wrong game, expired, or forged all answer
the same bare 404, so nothing about why is observable and a crawler sees no
page at all. The player origin also serves its own `Disallow: /` robots.txt,
since the app's would otherwise allow the game paths.

A grant is not a session and cannot become one: it authorises loading one game
for two hours, reaches nothing else, and names its subject as a keyed hash of
the Clerk user id rather than the id itself — it travels in the URL, where game
code can read it, so it must not carry an identifier.

`PLAYER_TOKEN_SECRET` signs them and is required in every environment. Without
it the player origin refuses everything rather than falling open.

Two things it does **not** cover, worth knowing before treating it as a content
gate. Static chunks under `/_next/` are excluded from the proxy matcher and
stay public — they are the same bundle the app serves, so there is no game
content in them, but a real asset pipeline (bundles, ROM blobs) would need its
own check. And the grant is only tested when the document loads, so a run in
progress never gets interrupted and a reload after two hours needs a fresh one
from the dashboard.

`NEXT_PUBLIC_PLAYER_ORIGIN` names the player origin. Leave it unset and games
fall back to `/player/<slug>` on the app's own origin with no isolation, which
is how preview deployments work with no configuration; `GameFrame` drops
`allow-same-origin` from the sandbox to compensate. Production always sets it.

Adding a game is an entry in `src/lib/games.ts`, a component under
`src/components/player/`, and a line in the `RUNTIMES` map in
`src/app/player/[slug]/page.tsx`.

## Layout

```
convex/
  schema.ts        users table + byClerkId index
  auth.config.ts   trusts Clerk-issued JWTs
  users.ts         current / store / upsertFromClerk / deleteFromClerk
  http.ts          Clerk webhook endpoint
src/
  proxy.ts         host dispatch; clerkMiddleware; signed-out-only redirects
  lib/
    player.ts      where games are allowed to run, and why
    games.ts       the game catalogue
  app/
    layout.tsx     document shell only — no providers (see Two origins)
    (site)/        landing, marketing chrome
    auth/          sign-in, sign-up, invitations
    dashboard/     auth.protect() per page; one route per game
    player/[slug]  the player origin's only route
  components/
    app-providers.tsx      Clerk > Convex > analytics; never on /player
    app/game-frame.tsx     the app's side of the boundary
    player/snake-game.tsx  Animal Adventure
```

## Adding a table

Add it to `convex/schema.ts`, write functions in a new `convex/*.ts` file, and
`npx convex dev` regenerates `convex/_generated`. Gate anything user-scoped on
`ctx.auth.getUserIdentity()` the way `users.ts` does.
