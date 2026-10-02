# Backend data maintenance

Convex is the database and job runner. The daily jobs in `convex/crons.ts` remove:

| Data | Retention |
| --- | --- |
| Timeout decisions and reasons | 7 days |
| Finished timeout status rows | 7 days after the last change |
| Chat reward receipts and normalized text | 1 day |
| Inactive current-page snapshots | 30 days |
| Expired chat presence and typing | Swept daily after 1 hour |
| Unsent chat images | Swept hourly after 1 hour |

The image sweep checks `publishedHtmlSimulators` before deleting a file. A file
referenced by a published simulator must remain even when it has no chat
attachment row.

Clerk's account-deletion webhook schedules `chat.sweep.purgeAuthor`,
`simulator.cleanup.purgeOwner`, `leaderboard.purgeAccount`, and
`accountCleanup.purge`. The last job drains personal views, playtime leases,
roles, timeouts, log rows, presence, typing, and other account references in
small batches. Shared published simulators remain available with the deleted
account's attribution removed.

## Friday inactivity removal

Every Friday at 2:55 p.m. Central Time, `inactivity.run` in
`convex/inactivity.ts` deletes the member account that did the least on the
site that week and tells Mason who it was, as a message from the bot in Mason's
private bot direct message. Convex crons keep UTC time, so `convex/crons.ts`
books the job at both 19:55 and 20:55 UTC; the job reads the Central clock
and only the booking that lands on 2:55 does anything. Run it by hand with
`npx convex run inactivity:run '{"force": true}'`.

The week is Monday through Friday in the leaderboard's UTC days. An account's
activity is the sum, in seconds, of:

| Signal | Source |
| --- | --- |
| Time with the site open on a weekday | `userActivity.weekSeconds`, added up by the visible-tab heartbeat from the gaps between its own beats, at most 45 seconds each |
| Playtime spent on games, emulators, TV and Browse apps | `leaderboardScores` rows `playtime:day:*` |
| Chat messages sent, at 90 seconds each | `leaderboardScores` rows `chat:day:*` |

The lowest total loses; ties go to the account seen least recently, then to
the older one. Staff (anybody above member, from `STAFF_ROLES` and the
`staffRoles` table), Mason's founder account, accounts still at the invite
gate, and accounts created since Monday are never candidates. With nobody
eligible the job only tells Mason that nobody was removed.

Removal is Clerk's `DELETE /v1/users/{id}` with the deployment's
`CLERK_SECRET_KEY`, after which the job runs `users.deleteFromClerk` itself,
the same cascade the deletion webhook runs, so the Convex rows go even on a
deployment without the webhook; the webhook's replay is a no-op. When Clerk
refuses, nothing is changed, Mason is told why, and the job fails loudly in
the Convex logs.

CEOs see the job under **Auto ban** in the admin console: a switch that turns
it off (`inactivity.setEnabled`; the single `inactivitySettings` row, absent
means on), the next Friday it fires, the last cycle's outcome, and the ten
members currently least active, in the order the job would take them. While
it is off the Friday booking records a skip and changes nothing; a forced run
by hand still runs.

The Admin directory shows each user's timeout log for the last seven days.
Only users who pass the existing admin (CEO, Co-Owner, or Head Moderator) check may read
it. Bulk allowance resets also run in batches once the first page is processed.

On September 23, 2026, both deployments were checked and migrated: development
had three obsolete agreement fields; production had four old-format playtime
leases; each deployment had one obsolete conversation greeting field. The
obsolete fields were removed from the schema after verifying both databases.

On September 28, 2026, the timeout screen's puzzles changed from geometry to
AP Calculus. `timeoutPuzzles.params` still accepts the old geometry shapes so
that rows written before the switch keep validating; `timeoutPuzzles.liveRow`
treats such a row as stale and the next `start` replaces it. Run
`dataMaintenance.pruneLegacyPuzzles` once on each deployment (it walks the
table in pages of 100 and deletes only geometry rows), then drop
`legacyPuzzleParams` from `convex/calculus.ts` and the schema.
