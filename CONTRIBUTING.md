# Contributing

Thanks for helping improve Interactive Learning. Use your own development
services and follow the setup in the README. Never use production data in tests.

## Changes

1. Fork the repository and create a focused branch.
2. Make the change and add regression coverage when behavior changes.
3. Run `npm run lint`, `npm run typecheck`, and `npm test`. For Worker changes,
   also run `npm --prefix experience ci` and `npm --prefix experience run build`.
4. Open a PR explaining the problem, resulting behavior, and verification.
   Include screenshots for visible changes and note environment/schema changes.

Keep generated lockfiles in sync. Do not commit env files, tokens, private keys,
customer data, build output, or third-party games. Follow `AGENTS.md` when using
coding agents; this version of Next.js includes local API documentation.

## Review and ownership

Contributor changes go through a PR and required CI. CODEOWNERS routes review
to the maintainer, including README, license, workflows, and CODEOWNERS changes.
Repository administrators may push or merge directly into `main` using the
documented bypass; CI still runs after those pushes.
Outside-contributor Actions runs need maintainer approval. A PR template is a
review aid, not a substitute for enforced branch rules.

## Licensing and assets

By contributing original code or documentation, you agree to provide it under
the repository's MIT license. Identify copied code and retain its license and
copyright notices. Only add media with documented permission and record its
source/license in `THIRD_PARTY_NOTICES.md`. Do not label third-party art or games
as MIT without a license from their rightsholders. No separate CLA is required.

## Issues and conduct

Use the issue templates for reproducible bugs and focused feature requests.
Follow `CODE_OF_CONDUCT.md`. Security issues belong in the private reporting
channel described in `SECURITY.md`, never in a public issue or PR.
