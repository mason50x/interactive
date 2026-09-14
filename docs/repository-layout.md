# Repository layout

Where things live, and the rule each place follows. Paths are relative to the
repository root.

## Top level

| Path | What it is |
| --- | --- |
| `src/` | The Next.js app: routes, components, and the modules they share. |
| `convex/` | The backend: schema, functions, moderation, and the helpers they share. |
| `config/` | Hand-edited tables the app and the Workers both read: domains, the bot identity, admin ids, the experience allowlist. |
| `tests/` | Every automated test. See below. |
| `scripts/` | Maintenance scripts run by hand: the catalogue build, the R2 sync, invitations, domain checks. |
| `experience/` | A separate Cloudflare Worker with its own `package.json`; see its README. |
| `public/` | Static files served as they are: brand assets, tile art, the pinned simulator core. |
| `docs/` | Operating notes, one topic per file. |
| `worker.ts` | The Cloudflare entry point that wraps the app with access hours and response policy. |

## `src/`

| Path | Rule |
| --- | --- |
| `src/app/` | Routes only. A route file renders a component from `src/components` and does no work of its own beyond auth and data loading. |
| `src/components/ui/` | The design system: primitives with no knowledge of the product. |
| `src/components/providers/` | Context providers mounted by layouts: Convex, Clerk, theme, preferences, streaks. |
| `src/components/site/` | The signed-out chrome: header, footer, and the shell that holds them. |
| `src/components/landing/`, `legal/` | The marketing and legal pages' sections. Server components; no `"use client"`. |
| `src/components/app/` | The signed-in app. Each feature owns a folder: `activities/`, `chat/`, `home/`, `invite/`, `rail/`, `search/`, `settings/`, `user-menu/`, `voting/`. A file stays flat in `app/` only when it belongs to the shell rather than to one feature. |
| `src/components/simulator/`, `activity/` | The two players and their libraries. |
| `src/lib/` | Pure modules and vocabulary: types, constants, formatting, validation. Anything a browser or a server can import. |
| `src/lib/hooks/` | React hooks. A file here starts with `use-`, or exports one hook under another name (`motion.ts`, `warm.ts`). |
| `src/lib/server/` | Server-only modules: server actions, the Clerk backend client, the catalogue behind `server-only`, and the origins read from server environment. Never imported from a `"use client"` file. |
| `src/lib/simulator/` | The simulator's own storage, sync, engine, and hooks. |

Within a feature folder the convention is `X.tsx` for the public component and
`X/` beside it for its private parts, as `chat/thread.tsx` and `chat/thread/`
do.

## `convex/`

| Path | Rule |
| --- | --- |
| `convex/*.ts` | One module per public API area (`users`, `views`, `streaks`, `invites`, `preferences`, `voting`), plus the helpers the areas share: `identity.ts`, `email.ts`, `days.ts`, `features.ts`. |
| `convex/chat/` | The chat functions, one file per concern, with `shared.ts` for the lookups they all use, `model.ts` for the validators the schema shares with the mutations, and `look.ts` for the face picker. |
| `convex/moderation/` | Server-side only. Nothing under `src/` may import it; the ESLint config enforces that. |
| `convex/simulator/`, `convex/voting/` | Function modules beside the models and access helpers they use. |
| `convex/schema.ts` | Every table. Validators shared with function arguments are imported from the `model.ts` files rather than repeated. |

A file that exports Convex functions cannot move without changing its API
path, so helpers move and function modules stay.

## `tests/`

| Path | Runner | Covers |
| --- | --- | --- |
| `tests/unit/` | Vitest, node | Pure modules under `src/` and `config/`. |
| `tests/convex/` | Vitest with `convex-test` | The backend, through the public API where possible. |
| `tests/worker/` | Vitest with Cloudflare types | `worker.ts` and the access-hours policy. |
| `tests/e2e/` | Playwright against the built Worker | Response policy on real routes. |
| `tests/helpers/` | — | The Convex harness and seeded fixtures every backend test starts from. |
| `tests/fixtures/` | — | Test-only data, such as the synthetic cartridge. |

`npm test` runs the simulator core check and every Vitest suite;
`npm run test:workers` runs Playwright against a built Worker.
