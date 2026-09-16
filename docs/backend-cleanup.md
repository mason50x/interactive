# Homepage and reporting removal — completed 2026-09-15

The signed-in Home page is intentionally empty. Activity tracking, streaks,
recent/favourite/popular activity queries, weather, and message reporting have
been removed. Hidden messages from the former reporting system remain hidden;
send-time moderation and admin deletion continue to work.

The production frontend and Convex backend were deployed. The batched retirement
migration cleared `views`, `activityDays`, `userDays`, and `reports` in development
and production. All four tables were verified empty. Every user was checked:
3 development users and 10 production users had no remaining streak fields.
Accounts, preferences, messages, and simulator saves were preserved.

The retired schema declarations, indexes, user fields, and temporary migration
function were subsequently removed. There is no recurring cleanup job or tracking
endpoint left for these features.

Account/conversation deletion now uses bounded batches and removes presence rows
with deleted conversations. Unchanged Clerk user syncs skip database writes.
These reduce known work; production latency has not been benchmarked.

Production browser verification was blocked by Cloudflare security before reaching
the application. Deployment, build, typecheck, and automated backend tests were
verified independently.

Chat now reads identity directly from the Clerk-synced `users` table. The feed
loads all accounts in bounded pages and supports opening DMs without friendship.
Only participants can read a DM. Chat profile settings, friend requests, blocking,
and their backend APIs have been removed. The batched cutover cleared all
`chatProfiles`, `friendships`, and `blocks` in development and production, preserved
moderation counters, and removed custom profile uploads. Retired tables and the
temporary migration were removed after verifying the data was cleared.
