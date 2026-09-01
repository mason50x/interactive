# Moving a domain

Every domain this deployment knows about is resolved from an environment
variable. `config/domains.json` holds the *fallback* for the one domain that
cannot be absent — the site's own origin — and it is the only place in the
repo a domain is spelled out. Nothing else hard-codes one.

Run `npm run domains` to see what the current environment resolves to, and
what has to change outside the repo for each move.

## The two domains

| What | Variable | Fallback | Cost of a move |
| --- | --- | --- | --- |
| Assets (R2 bucket) | `ASSET_ORIGIN`, or `NEXT_PUBLIC_ASSET_ORIGIN` | none — hosted activities disappear | one variable |
| Site (root) | `NEXT_PUBLIC_SITE_URL` | `config/domains.json` | one variable, plus the identity providers below |

The asset origin has **no fallback on purpose**. A stale default would
silently keep serving the old bucket, and it fails quietly: hosted activities
would simply be absent. Unset is a state the app reports; wrong is a state it
cannot detect.

## Moving the asset domain

The cheaper of the two, by design.

1. Point the new hostname at the same R2 bucket (Cloudflare → R2 → Settings →
   Custom Domains). The bucket keeps its contents.
2. Set `ASSET_ORIGIN` on Vercel (Production) to the new origin.
3. Redeploy.
4. Re-create the Redirect Rule that sends `/` on the asset hostname to the
   site. It is zone configuration, not bucket contents, so it does not travel
   with the bucket — see "The asset origin" in the README for why it exists.

A move is for changing where the bucket answers, not for escaping a content
filter's categorisation. A filter that has labelled the old hostname will
label the new one the same way once it scans the same pages, and the hop
counts against the next appeal. Fix the categorisation instead; the README
says how.

Nothing is re-uploaded and nothing is rewritten. Bundle HTML references its
own files relatively — `scripts/migrate-to-r2.mjs` rewrites the one absolute
URL upstream ships (Ruffle) into a relative path precisely so the bucket's
contents never learn their own hostname. `src/lib/assets.ts` is the only
module that knows the origin, and it is imported by exactly one server
component, so the value never reaches the client bundle.

## Moving the root domain

The expensive one, because three services outside this repo store it.

In the repo:

1. Set `NEXT_PUBLIC_SITE_URL` on Vercel (Production) to the new origin. That
   one variable carries `brand.url`, the sitemap, `robots.txt`,
   `metadataBase`, the JSON-LD, **and** every role email address
   (`help@`, `privacy@`, `legal@`, …), which derive their domain from it.
2. If mail stays on the old domain — usual during a cutover — set
   `NEXT_PUBLIC_BRAND_DOMAIN` to the old bare domain and the addresses stay
   put while everything else moves.
3. Update `config/domains.json` once the move is permanent, so a deployment
   with no variables set still resolves correctly.

Outside the repo:

4. **Vercel** — add the domain to the project and make it the production
   domain, so `VERCEL_PROJECT_PRODUCTION_URL` agrees.
5. **Clerk** — the production instance is bound to a domain. Change it in the
   dashboard, re-verify the DNS records (`clerk.`, `accounts.`, and the mail
   CNAMEs), and note that this rotates the JWT issuer.
6. **Convex** — `npx convex env set CLERK_JWT_ISSUER_DOMAIN https://clerk.<new
   domain> --prod`. Miss this one and every authenticated query fails after
   the Clerk change lands, not before.
7. Send one invitation to yourself and click it. Clerk stamps `redirect_url`
   into the email at send time; there is no editing it afterwards.

`scripts/invite.mjs` reads the production origin from `PROD_SITE_URL`, falling
back to `config/domains.json`, so it moves with step 1 or 3 rather than
carrying a literal of its own.
