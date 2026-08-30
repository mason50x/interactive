# 50x

Next.js + Convex + Clerk + Tailwind foundation. Clerk owns authentication;
every signed-in user is mirrored into the Convex `users` table.

## Running it

```bash
npx convex dev   # terminal 1 — pushes functions, watches convex/
npm run dev      # terminal 2 — Next.js on http://localhost:3000
```

## How auth flows through

1. `src/proxy.ts` runs `clerkMiddleware()` on every request and calls
   `auth.protect()` for `/dashboard(.*)`.
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

To turn the webhook on:

1. In the Clerk dashboard under **Webhooks**, add an endpoint pointing at
   `$NEXT_PUBLIC_CONVEX_SITE_URL/clerk-users-webhook` (the `.convex.site`
   host, not `.convex.cloud`), subscribed to `user.created`, `user.updated`,
   and `user.deleted`.
2. Copy the signing secret and run:
   `npx convex env set CLERK_WEBHOOK_SECRET whsec_...`

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

The webhook is configured per Clerk instance, so the production instance needs
its own endpoint (pointing at `https://posh-chicken-69.convex.site/clerk-users-webhook`)
and its own signing secret.

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

`npx convex deploy` typechecks `convex/`, regenerates `convex/_generated`,
pushes functions, indexes, and schema to the deployment its key names, and only
then runs `npm run build` — with `NEXT_PUBLIC_CONVEX_URL` pointed at that same
deployment. A schema or typecheck failure fails the Vercel build before anything
ships, so the two halves never drift apart.

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
Preview `CONVEX_DEPLOYMENT` override at that point, and note that
`NEXT_PUBLIC_CONVEX_SITE_URL` would still point at the dev deployment; only
`NEXT_PUBLIC_CONVEX_URL` is rewritten by `--cmd`.

## Layout

```
convex/
  schema.ts        users table + byClerkId index
  auth.config.ts   trusts Clerk-issued JWTs
  users.ts         current / store / upsertFromClerk / deleteFromClerk
  http.ts          Clerk webhook endpoint
src/
  proxy.ts         clerkMiddleware + protected routes
  app/
    layout.tsx     ClerkProvider > ConvexClientProvider
    page.tsx       landing
    dashboard/     protected; reads the Convex user row
    sign-in/, sign-up/
  components/
    convex-client-provider.tsx
    store-user.tsx
    site-header.tsx
```

## Adding a table

Add it to `convex/schema.ts`, write functions in a new `convex/*.ts` file, and
`npx convex dev` regenerates `convex/_generated`. Gate anything user-scoped on
`ctx.auth.getUserIdentity()` the way `users.ts` does.
