# 50x · Interactive Learning

[![CI](https://github.com/mason50x/interactive/actions/workflows/ci.yml/badge.svg)](https://github.com/mason50x/interactive/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

An open-source web application with a learning dashboard, activity catalogue,
chat, invitations, streaks, and browser-based simulators. Built with Next.js,
React, TypeScript, Convex, Clerk, and Tailwind CSS.

The application source is available here, including the Convex backend and the
optional Cloudflare Worker in `experience/`. Running it requires your own Clerk
and Convex configuration. Optional image moderation and bot replies use OpenAI
and Gemini. This release does not replace those services with open-source models
or authentication. Hosted third-party games are not included.

## Run locally

Use Node.js 24 (`nvm use`) and npm. You need a Clerk application and a Convex
project of your own; access to the maintainers' hosting accounts is not needed.

```sh
git clone https://github.com/mason50x/interactive.git
cd interactive
npm ci
cp .env.example .env.local
npx convex dev
```

The last command configures your Convex project, writes its deployment and URL
to `.env.local`, and starts watching backend changes. If the initial deployment
asks for Clerk configuration, set the issuer described below and retry.

1. In Clerk, create a development application, enable **username** as a required
   field, and copy its publishable and secret keys to `.env.local`.
2. Create a Clerk JWT template named **convex** with the claims below.
3. In your Convex dashboard, set `CLERK_JWT_ISSUER_DOMAIN` to your Clerk issuer
   URL and `CLERK_SECRET_KEY` to the same development instance's secret key.
   These are backend variables: putting them only in `.env.local` is insufficient.
4. Add a Clerk webhook pointing to
   `https://<your-deployment>.convex.site/clerk-users-webhook`, subscribe to
   `user.created`, `user.updated`, and `user.deleted`, and set its signing secret
   as `CLERK_WEBHOOK_SECRET` on that Convex deployment.
5. Enable sign-ups in your own development Clerk instance, or invite your first
   account through Clerk if you choose restricted sign-up mode.
6. Stop the initial Convex watcher, then run `npm run dev`. It starts Next.js
   and Convex together. Open **http://localhost:3000**.

Clerk JWT template:

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

See [environment configuration](docs/environment.md) for optional features,
admin accounts, and the separation between app and backend variables. Never
commit your `.env.local` or put secret keys in `NEXT_PUBLIC_*` variables.

## Checks

```sh
npm run lint
npm run typecheck
npm test
npm run build                       # needs your public Clerk/Convex configuration
npm audit
npm --prefix experience ci
npm --prefix experience run build
npm --prefix experience audit
```

`npm test` verifies the pinned simulator core, runs its WASM smoke test, and runs
the Vitest suite. CI uses inert public configuration for a build smoke test;
it has no deployment credentials and does not contact a live backend for tests.

## Project layout

| Directory | Purpose |
| --- | --- |
| `src/app/` | Next.js routes and layouts |
| `src/components/` | Dashboard, chat, simulator, and shared UI |
| `src/lib/` | Application helpers and generated activity catalogue |
| `convex/` | Authenticated backend functions, schema, jobs, and webhooks |
| `config/` | Domain defaults, bot settings, and deployment-driven admin helpers |
| `scripts/` | Development, deployment, catalogue, and verification tools |
| `scripts/tests/` | Backend, moderation, simulator, and client logic tests |
| `experience/` | Optional allowlisted browsing Worker; app routes are development-only |
| `public/simulator/core/` | Pinned, licensed binjgb runtime |

Activities are embedded through `/learn/<slug>`; their bundles must be served
from a separate asset origin. The iframe sandbox provides the boundary for
third-party activity code. Leave `ASSET_ORIGIN` empty to disable hosted activities.
The simulator accepts user-provided compatible files; no game ROMs are bundled.

## Deploy your own instance

See [deployment](docs/deployment.md). The frontend can run on a Node.js host
with `npm run build` and `npm start`, or on Vercel. The Convex backend is deployed
separately unless you use the included Vercel build integration. The optional
Worker has its own [setup instructions](experience/README.md).

Change `config/domains.json` and your environment configuration for your own
brand and domains. Review the hosted-service privacy policy and terms before
using them for a different operator or jurisdiction.

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md) and our [Code of Conduct](CODE_OF_CONDUCT.md).
Open a pull request for changes, including documentation. Changes to the README,
license, ownership rules, workflows, and deployment configuration require
maintainer review. See [repository protections](docs/repository-protections.md).

Report vulnerabilities privately using [SECURITY.md](SECURITY.md), not a public
issue. Please keep credentials and personal data out of reports and logs.

## License and third-party materials

Original application code and documentation are available under the [MIT
License](LICENSE). Dependencies and vendored code retain their own licenses.
The MIT grant does **not** relicense third-party game thumbnails, character art,
game bundles, or third-party trademarks. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
for the inventory and unresolved media provenance. Do not assume that an image
or externally hosted game is MIT-licensed because it appears in this project.
