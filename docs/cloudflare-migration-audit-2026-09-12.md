# Vercel → Cloudflare migration audit

Historical pre-migration audit. Implementation update: vinext builds and runs on Workers; production domains and Clerk DNS are configured, production/development environments are backed up, unit and workerd tests pass, and development sign-in/out plus production sign-in rendering were verified. Invitation email delivery, production account mutations, and multi-region performance remain outside the smoke-test scope. See `deployment.md` for current operations.

Audited 2026-09-12 at commit `d387754`. Recommendation: proceed with a compatibility prototype, but do not cut production over yet. This is a moderate frontend/runtime migration; it does not require migrating the database or rewriting the backend.

## Evidence and scope

Reviewed application code, dependencies, local Next.js 16.3.3 deployment/proxy documentation, deployment scripts, CI, and environment documentation. Vercel's project API confirms `interactive-learning` uses Next.js and Node 24, with its latest production deployment READY and both `interactivelearningresources.org` and `www.interactivelearningresources.org` attached.

Ran `npx --yes vinext check` using vinext `1.0.0-beta.9`: 15 supported checks, two partial, one issue; the tool reports 89% compatibility. This is a static heuristic, not proof of runtime compatibility. No migration build, authenticated browser tests, Cloudflare account/DNS inventory, billing review, or deployment was performed. No application configuration or secrets were changed.

## What moves

| Component | Current implementation | Migration impact |
| --- | --- | --- |
| App hosting | Next.js 16.3.3, React 19.2.8, App Router on Vercel | Move rendering, proxy, Server Actions and static app files to Workers |
| Authentication | Clerk middleware, server auth and browser provider | Keep Clerk; verify adapter compatibility and preview origins |
| Data, subscriptions, uploads, AI | Convex functions and storage; external model providers | Keep existing services and endpoints |
| Hosted activity bundles | Separate R2 origin via `src/lib/assets.ts` | Keep bucket and separate origin; no bulk copy needed |
| App static assets | 326 files in `public/`, about 14 MB | Include in Workers static assets; largest file about 1.6 MB |
| Experience | Separate Worker under `experience/`; app pages development-only | Keep independent; preserve exclusion from production |

No direct Vercel SDK dependency, Vercel Blob/KV integration, or Vercel cron configuration was found. AI SDK usage is in Convex and does not itself require Vercel hosting. The one `next/image` consumer explicitly uses `unoptimized`; image optimization is not a migration blocker today. OG images are static PNGs. No explicit application ISR/revalidation APIs were found; avoid adding caching infrastructure without a demonstrated need.

## Findings

### 1. High: authentication compatibility must pass before choosing a runtime

Cloudflare now recommends vinext for migrating Next.js apps, but identifies it as beta. It reimplements the Next.js API surface on Vite. [Cloudflare Next.js guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/).

The executed checker reports partial support for `@clerk/nextjs`: server-component `auth()` requires a headers shim described as work in progress. This matters directly: `src/app/dashboard/layout.tsx:57` and many dashboard pages call `auth.protect()`, and invitation/account Server Actions use Clerk server APIs. The follow-up below confirms the specific stale-header bug is fixed in the checked package. Treat the scanner warning as conservative metadata, not evidence that current Clerk server auth is broken. Full app runtime verification remains necessary.

OpenNext preserves `next build`, but Cloudflare's current support table says Node.js middleware is not supported. Local Next.js docs say Proxy defaults to Node.js and does not accept a runtime override. The app's authentication gate is `src/proxy.ts`. Therefore OpenNext is also not a verified drop-in. An edge-compatible middleware adaptation may be possible, but requires checking the pinned adapter and Clerk versions and testing the actual build. [OpenNext support table](https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/).

Recommendation: evaluate vinext first under the current Cloudflare guidance; keep OpenNext as an alternative if the Clerk integration cannot pass. Retain Vercel until one path passes end-to-end.

### 2. Configuration: preserve explicit origins; replace generated preview URLs

`src/lib/site-url.ts:26` uses `NEXT_PUBLIC_SITE_URL`, then Vercel-specific production/preview values, then localhost. Cloudflare previews following today's documented “leave site URL unset” practice will generate localhost invitation links.

The migration includes moving the configured environment, as confirmed by the user. Preserving an explicit production `NEXT_PUBLIC_SITE_URL` resolves the production concern; missing credentials are not an assumed blocker. Establish a trusted preview-origin mechanism. A stable staging hostname is the simplest initial option. Do not derive emailed URLs from arbitrary request Host headers. Update preview guidance in `docs/environment.md`.

`src/lib/brand.ts:38` and `scripts/resolve-domains.mjs` recognize `.vercel.app` as a deployment host but not `.workers.dev`; setting a Workers preview URL can consequently produce bogus role email addresses. Set `NEXT_PUBLIC_BRAND_DOMAIN` for staging or update host classification.

### 3. Configuration: move environments and recreate backend deployment

`vercel.json` deploys Convex around the frontend build when `CONVEX_DEPLOY_KEY` exists. Cloudflare does not execute that Vercel configuration. Port the deployment sequence so the frontend receives the matching Convex endpoint and backend changes ship deliberately.

The deploy key is also a runtime credential in `src/lib/account-actions.ts:13`, not just a CI secret. Preserve that behavior with a Worker secret, or explicitly validate the existing token-authenticated fallback before omitting it. Clerk's server key also belongs in runtime secrets. Public Clerk/Convex/site values must be available at build time. Keep Convex-only model keys and webhook secrets in Convex; R2 maintenance credentials are not required by the app host.

Replace `scripts/deploy.mjs` and the package deploy command; preserve its committed-HEAD deployment behavior. Keep production and preview credentials isolated. Existing GitHub checks do not deploy; add a separate trusted deployment path and Workers build validation rather than assuming the current CI is sufficient.

### 4. Medium: vinext changes build semantics beyond hosting

The checker flags missing `"type": "module"`. Adding it requires reviewing Node-executed JavaScript/config files. It also reports Google fonts loaded from a CDN instead of being self-hosted at build time (`src/app/layout.tsx:4`), changing network, privacy and offline behavior. Preserve self-hosting if desired.

The scanner reports only `headers` under supported configuration; it does not establish parity for this project's conditional `pageExtensions`, Turbopack `resolveExtensions`, or `experimental.staleTimes`. Explicitly verify `.dev.tsx` experience pages and `.dev.ts` imports remain excluded from production and that navigation warming still behaves as intended.

### 5. Medium: preserve response headers and origin boundaries

`next.config.ts` permits same-origin framing on `/learn`, forbids framing elsewhere, and emits crawler opt-out headers everywhere. Check actual HTML, RSC, redirects, errors and static asset responses on Workers. Static asset delivery can take a different path from rendered requests.

Keep R2 activity HTML on its separate origin: it contains third-party code. Moving it under the application origin changes the browser isolation model. Keep authenticated responses private and test signed-out access independently of cached signed-in requests.

## Cutover and acceptance plan

1. Create an isolated migration branch and pin the chosen runtime/adapter and Wrangler. Configure build/runtime environments, then build and run under Workers tooling. Measure compressed Worker bundle size, startup, memory and CPU against current [Workers limits](https://developers.cloudflare.com/workers/platform/limits/).
2. Use staging with isolated Clerk/Convex credentials. Verify sign-in/out, deep links, invitation acceptance/revocation, account synchronization, chat subscriptions, uploads, bot replies, hosted activities and simulator save/load. Invitation email testing needs explicit authorization to send.
3. Test anonymous and authenticated HTML/RSC access, Server Action authorization, route matching with dotted path segments, response headers, and absence of development routes. Verify browser WASM loading and retained IndexedDB saves.
4. Compare navigation and auth latency with Vercel from representative regions. Backend calls still reach Clerk and Convex; global Workers placement alone does not establish a speedup.
5. Preserve the existing production hostname. Audit apex/www routing, TLS, DNS, Clerk subdomains and mail records; move only the application routing. A hosting-only move does not require changing the Clerk instance/JWT issuer or Convex data. Keep the asset origin unchanged.
6. Pause duplicate production deploy triggers, cut over after acceptance, and retain the Vercel deployment/domain configuration for rollback. Keep backend changes backward-compatible: frontend routing rollback does not roll Convex back. Keeping the hostname also preserves origin-bound browser saves.

## Economics and effort

Workers Standard has a $5 monthly subscription, including 10 million requests and 30 million CPU-ms, with overages of $0.30/million requests and $0.02/million CPU-ms. Additional services/builds/log usage can add costs. These are platform rates, not a project estimate. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).

Actual savings are unknown without Vercel billing and traffic/CPU measurements. The large activity downloads already use R2, so that bandwidth benefit has already been obtained. Convex, Clerk and model costs remain. Budget engineering time for adapter upgrades and preview/deployment maintenance.

Planning estimate, not a measured commitment: roughly 1–2 engineering days for a compatibility prototype, then 1–3 days for deployment integration, regression testing and cutover if authentication works without upstream fixes. An unresolved Clerk/proxy gap can extend this substantially. Proceed for a concrete cost or operational reason; current evidence does not justify an immediate production migration.


## Follow-up: deeper authentication audit

The user confirmed that the environment will move with the application. This audit assumes the same production hostname, Clerk instance and Convex deployment, with configured public variables and secrets available at their required build/runtime phases. Vercel-generated system variables still need replacement; copying a generated preview URL once would preserve a stale hostname.

### Revised compatibility finding

The downloaded vinext 1.0.0-beta.9 contains the header/cookie snapshot invalidation fix from [vinext PR #812](https://github.com/cloudflare/vinext/pull/812), merged April 10, 2026. The old failure was that middleware read headers, injected Clerk auth headers, but the subsequent Server Component saw the cached pre-middleware snapshot. The checker still describes this integration as partial; that description alone is insufficient to call Clerk blocked.

Inspected the installed Clerk 7.8.3 implementation: `auth()` constructs a request from awaited `next/headers`, checks for middleware auth state and validates the middleware token signature before decoding signed-in session claims. `clerkMiddleware` authenticates the request and forwards its state using Next's middleware request-header protocol. This identifies the exact compatibility boundary: middleware execution, header forwarding, request-scoped context, redirects and cookies. Simply replacing server auth with a decoded browser JWT would discard required verification and is not recommended.

Executed a synthetic test directly against the downloaded vinext header shim. It passed header/cookie refresh after a primed snapshot, removal of an overridden Authorization header, and isolation of two concurrent request contexts. This confirms the specific mechanism in Node; it does not verify Clerk JWTs, the entire request pipeline or workerd execution. The existing Next.js proxy matcher suite also passed all 12 cases. That suite mocks Clerk and uses Next's matcher, so it does not prove vinext matching/authentication parity.

### App-specific auth boundaries

| Boundary | Evidence | Assessment |
| --- | --- | --- |
| Dashboard HTML/RSC | `src/app/dashboard/layout.tsx` plus individual pages call `auth.protect()` | Keep server checks and middleware context; test full render and RSC requests |
| Activity wrapper | `src/app/learn/[slug]/page.tsx` and its layout have no server auth check; protection is exclusively in `src/proxy.ts` | Highest-priority resource to verify. Add page-level `auth.protect()` during migration; it does not require mounting the browser ClerkProvider |
| Browser Convex access | `ConvexProviderWithClerk` uses Clerk `useAuth`; Convex validates the configured issuer and audience `convex` | Hosting-independent if Clerk instance, template and Convex endpoint remain matched |
| Invitation actions | `src/lib/invite-actions.ts` checks `auth()`, obtains the `convex` template token, then invokes Convex | Verify token minting and forwarded identity in Server Actions, not just browser sign-in |
| Invitation ownership | `convex/invites.ts` reads verified identity and checks inviter ownership | Backend boundary stays in Convex; frontend hosting does not replace it |
| Account synchronization | `src/lib/account-actions.ts` checks caller identity and fetches authoritative Clerk user before an admin mutation | Preserve server-only key placement; copied deploy key retains existing behavior |
| Account-sync fallback | `convex/accountSync.ts:mine` verifies Convex identity and fetches that subject from Clerk | Alternative already exists, but changing to it is optional and needs separate validation |
| Webhooks | `convex/http.ts` verifies Svix signature against raw request body at `/clerk-users-webhook` | Endpoint is on Convex, not Vercel; no webhook relocation or secret rotation required solely for this host move |
| Invitation acceptance | `/auth/accept-invite` uses server auth, redirects and ticket query parameters; wrong-account flow signs out then returns | Preserve query strings and cookies across redirects; test existing, expired and wrong-account cases |

Adding a resource-level check on `/learn` also aligns with [Clerk's current migration guidance](https://clerk.com/docs/guides/development/upgrading/upgrade-guides/migrate-from-create-route-matcher): keep middleware for Clerk initialization while enforcing access at the protected resource. This is an observed defense-in-depth gap, not a demonstrated bypass of the current deployment.

### What the environment move does and does not solve

- Preserve `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, Clerk route/fallback variables, `NEXT_PUBLIC_CONVEX_URL`, explicit site URL, asset origin and the current runtime deploy key. Public values must be supplied before bundling; secret values must remain server-only.
- Leave the Clerk JWT issuer, model keys and webhook secret in Convex. They are not Vercel environment variables to relocate.
- Keeping the same Clerk instance/domain avoids user migration and should permit existing sessions to continue. Actual refresh/handshake behavior still needs verification on Workers; preserving env does not prove cookie or redirect handling.
- Staging on a different hostname needs a compatible Clerk environment and deliberate redirects. Production keys copied to an arbitrary Workers preview are not evidence that the preview domain is configured correctly.

### Remaining acceptance gates

Use the real app on workerd with controlled test accounts to verify: signed-out and expired-cookie access to dashboard and learn; valid session rendering; refresh/handshake Set-Cookie preservation; sign-out followed by back/prefetch navigation; separate simultaneous users; no shared caching of authenticated HTML/RSC; direct unauthorized Server Action requests; Convex JWT template minting and subscriptions; currentUser/account sync; invitation ticket preservation. Test forged Clerk/middleware headers only against the isolated prototype and confirm they cannot establish identity. Run the dotted-route matcher cases against vinext itself.

Revised judgment: there is no confirmed Clerk incompatibility in the inspected vinext release. The environment move removes missing-configuration concerns from the blocker list. The remaining work is app-level verification of the adapter and strengthening the learn resource boundary, not replacing Clerk or migrating users. No application auth code, environment values or live services were changed by this follow-up.
