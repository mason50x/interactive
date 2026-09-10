# Production performance audit — September 4, 2026

## Evidence and coverage

- Convex production: `cognify:50x:production`, `posh-chicken-69`.
- Vercel: `cognify/interactive-learning`, production commit `9569355` at audit start.
- Retrieved all 1,000 retained Convex completion events, September 4 19:06:07 through September 5 01:24:52 UTC. Asking for 100,000 returned the same retained 1,000. Zero execution errors. These logs span multiple code deployments, not a controlled benchmark of one revision.
- Examined Vercel production runtime counts, seven-day error aggregates, deployment history and latest successful build logs. The error aggregate recorded 45 missing-Clerk-middleware errors and one expired-session token error. Older detailed runtime logs were unavailable. The aggregate includes project history; it is not proof every error persists in the latest deployment.
- Reproduced HTTP 500 on production `/dashboard/activities/missing.png` using a signed-out request.
- No complete billing ledger, Gemini token-usage history, R2 request logs, or Clerk provider logs were available through the inspected sources. This is an audit of available application logs, not a claim to have reviewed every provider's historical logs.
- Raw logs remain outside the repository in `/tmp/50x-prod-audit/`; they are temporary evidence, not a durable log archive.

## Resource hotspots

| Function | Calls | Database bytes read | Documents read |
| --- | ---: | ---: | ---: |
| chat/messages:list | 70 | 581,000 approximately | 1,641 |
| chat/conversations:list | 75 | 198,000 approximately | 677 |
| chat/typing:who | 117 | 97,000 approximately | 297 |
| views:heartbeat | 52 | 64,000 approximately | 312 |

Total recorded database reads: 1,525,038 bytes; message-page reads account for 38.1%. One bot action took 15.67 seconds and issued five typing beats. No token usage appeared in that retained action record, so no model-price or output-budget changes were justified.

## Implemented changes

1. **Reuse reply originals within the message query.** Seed a request-local map with the fetched page; fetch an off-page original at most once. A read-only production sample of the latest 50 global messages contained nine replies, all with originals already on the page: nine redundant `db.get` calls are avoided for that sample. Hidden, blocked, deleted and cross-conversation originals still cannot expose previews. This saves database read bandwidth; it does not remove the message-page query invocation.
2. **Cancel the bot's sleeping typing timer on completion.** Avoid up to 2.5 seconds of idle action lifetime after success, failure or quota response. Await an in-flight beat before deleting typing state. Model, moderation, quota and timeout behavior are preserved. Savings concern action duration, not model tokens.
3. **Deduplicate the server agreement read with React `cache`.** Dashboard layout and gated page share one promise per server render. This removes the duplicate helper/token request/Convex fetch where both execute. React's request-local cache does not retain authorization across requests or users.
4. **Always match application namespaces in Clerk proxy.** Filename-looking dynamic segments under `/dashboard`, `/learn` and `/auth` receive middleware context. Public static assets keep their existing bypass. This fixes the reproduced error path without adding authentication work to normal public images.

## Validation

- 36 Vitest tests passed, including 12 route matcher cases and two Convex query regressions with real `convex-test` storage.
- Query regressions: zero original lookups when the original is in the page; one lookup for nine replies sharing an off-page original. Verify hidden, blocked, deleted and cross-conversation originals, plus anonymous/nonmember access.
- Seven bot success/failure/timeout/refund/quota scenarios passed; each completes below one second with the real 2.5-second heartbeat timer present and then canceled (provider calls mocked).
- TypeScript, targeted ESLint, `git diff --check`, and optimized Next.js build passed.
- Convex development deployment `cheerful-guanaco-637` accepted the functions.
- Local optimized server HTTP checks: protected `.png`, `.js` and `.html` paths return 307 sign-in redirects; a real public image returns 200; a missing public image returns 404.
- Authenticated production end-to-end behavior and actual invoice savings have not been measured.

## Deployment state

Another process committed the first version as `6de46d7` during this audit. Its automatic Vercel deployment failed on two test TypeScript/API issues; both are corrected in the working tree. The agent conducting this audit did not commit or deploy production. The last successful Vercel production deployment remains `dpl_F59UsqccqdKjfLj5CfGR38h2BZ8z` at final verification. Final test corrections and this report require inclusion in the next deployment.

## Cost interpretation

These changes reduce unnecessary reads, duplicate server work and idle action time. Dollar savings depend on actual volume, provider plans and included allowances; the available evidence does not support an honest monthly savings figure. Retain current model quality and safety checks. If longer historical analysis is needed, collect retained logs before they expire; paid logging or plan changes were not introduced.

References: [Clerk middleware error guidance](https://clerk.com/docs/reference/nextjs/errors/auth-was-called), [Convex log streams](https://docs.convex.dev/production/integrations/log-streams). React request-cache behavior was checked against this installation's Next.js documentation under `node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md`.
