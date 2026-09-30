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
