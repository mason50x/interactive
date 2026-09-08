# Chat account identity

Clerk owns the chat handle (`username`), display name (formatted `first_name`, with the shortest available surname prefix when needed), and account picture URL. Chat cannot rename either name or upload a profile picture. The avatar picker can select the account picture, emoji, or up to two alphanumeric characters.

`users.upsertFromClerk` mirrors Clerk identity and updates the existing chat profile in place. Clerk webhooks keep it current. `StoreUser` also refreshes it on sign-in and after Clerk profile updates, using the authenticated `syncChatAccount` server action. Production reads Clerk and uses the existing server-only `CONVEX_DEPLOY_KEY`; local development falls back to an authenticated Convex action and needs its development `CLERK_SECRET_KEY` on the development Convex deployment.

Account pictures use the URL in `users.imageUrl` directly; no file is downloaded or stored in chat. Avatar choices survive later identity syncs. Opening chat automatically refreshes the profile and joins Everyone; the missing-profile view is a loading state with a retry only on error. First names use an uppercase first letter and lowercase remaining letters. A duplicate adds one surname letter at a time, with the handle as the final fallback for identical names. Display-name allocation uses an indexed key and runs in the same transaction as account sync.

Older messages and reply previews resolve the current author identity on read; message contents and resolved historical mentions remain unchanged.

## Existing-profile cutover

The September 8, 2026 cutover migrated two development profiles and eight production profiles. The older development account without a username was assigned its existing `dr_smart` handle in Clerk with user approval. All production accounts already had usernames. Profile IDs, creation times, moderation state, privacy settings, conversations, and memberships were retained. Existing emoji/text choices were reset to the account picture once at cutover. There were no uploaded profile images in either environment.

A full production Convex snapshot was exported before migration. The production backfill ran within the Vercel build environment so credentials did not have to be exported. `scripts/backfill-chat-accounts.mjs` preflights every existing profile against Clerk before writing and stops if any account has no username. Run it only with the corresponding environment's `NEXT_PUBLIC_CONVEX_URL`, `CONVEX_DEPLOY_KEY`, and `CLERK_SECRET_KEY`. `--dry-run` performs only the preflight.

The new Convex functions must already be deployed before invoking the backfill script. For this one-time release the build sequence was `npx convex deploy --yes && node scripts/backfill-chat-accounts.mjs && npm run build`. Subsequent deployments can use the existing normal build command. Repeat backfills preserve explicitly selected avatar styles.

## Verification

`scripts/tests/chat-account.test.ts` covers migration in place, repeat sync, stale webhook delivery, exact username lookup, avatar switching, upload rejection, account creation, and sending/reading messages after an identity change. `scripts/tests/chat-performance.test.ts` checks reply visibility and lookup reuse.

Browser verification covered account → emoji → text → reload → account, plus changing the first name in Clerk and observing chat update. The development first name and account-avatar selection were restored after testing. Production verification confirmed eight matching profiles, loaded direct Clerk images, existing conversations/messages, the new picker, and no browser console errors.
