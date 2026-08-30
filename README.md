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

All three environments (Development, Preview, Production) currently hold the
same values, so pushes to `main` build and ship to production automatically.

That means **production is running on Clerk development keys and the Convex dev
deployment.** Fine for a foundation; swap both before real users:

- Create a Clerk production instance (needs a domain + DNS), then set
  `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` for Production only.
- Create a Convex production deployment and switch the Vercel build command to
  `npx convex deploy --cmd 'npm run build'` with a `CONVEX_DEPLOY_KEY`, which
  pushes functions and rewrites `NEXT_PUBLIC_CONVEX_URL` at build time.

Two variables live on the Convex deployment instead of here, because Convex
functions read them at runtime:

```bash
npx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your-app>.clerk.accounts.dev
npx convex env set CLERK_WEBHOOK_SECRET whsec_...
```

## Deployments

`main` is connected to `mason50x/interactive-learning` (private) and deploys to
production on every push. Other branches get preview deployments.

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
