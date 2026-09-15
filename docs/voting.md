# Voting for access

Voting is development-only, using the `.dev.tsx` route and
`nav-extras.dev.ts` navigation convention. Production and preview builds exclude
the route, UI, invitation action, sidebar subscription, and icon animation.

The Convex `VOTING_ENABLED` flag must be exactly `1` to allow voting queries,
mutations, admin delivery, and scheduled expiry. It is enabled on the development
deployment; leave it unset or `0` in production. Cleanup remains available so
account deletion can still remove existing data. The invitation server action
also refuses to run outside `NODE_ENV=development`.

In development, Voting lives at `/dashboard/voting`, linked from the sidebar with a filled thumb,
a short hover animation, and a dot for new nominations. The animation follows
the existing rail's hover and reduced-motion rules.

## Rules

- All signed-in members with a synced account can nominate and vote.
- A nomination requires a name and email. Only admins receive the email in query
  responses. Everyone can see voter display names and yes/no choices.
- Submission records the author's yes vote in the same transaction.
- Each account gets one final vote. Five yes votes immediately accept the
  nomination; a single no immediately rejects it.
- An open nomination expires after three days. Server-side scheduled expiry
  rejects it even when nobody visits the page. Late votes cannot accept it.
- Accepted nominations await an admin's **Approve and send** action. This sends
  through the existing Clerk invitation helper and does not enable ordinary
  member invitation allowances.
- Completed votes appear under **Accepted or Rejected**.
- Authors can delete their own suggestions; existing message admins can delete
  any suggestion. Suggestions cannot be edited. Deletion also removes the
  suggestion from history and cleans up ballots, but never revokes an invite.
- A rejected person can be nominated again three days after rejection. A small
  separate cooldown record prevents deletion from bypassing the wait.

## Identity and privacy

Email comparisons trim whitespace and ignore casing. Name comparisons use a
Unicode regex to remove accents, separators, punctuation, symbols, and control
characters after normalization. This catches obvious self-nominations against
the author's account name/username; own-email nominations are also blocked.
Name matching is a heuristic, not proof of identity: aliases can evade it and
two people can share a name. Admins review the nominee before an invite is sent.

Member-facing nomination responses explicitly return `null` for email. Voter
labels come from chat profiles, not account email or full legal name fields.
Admin authorization uses the server's `CHAT_ADMIN_CLERK_IDS` configuration,
never the public cosmetic badge configuration.

## Backend and delivery

`convex/voting.ts` implements the queries and mutations. `convex/voting/model.ts`
defines validators and identity normalization. Nominations and individual
ballots use separate tables. Indexed transactional lookups enforce unique votes
and duplicate-nomination checks. Lists and ballot queries are paginated;
deletion cleanup uses bounded batches.

`src/lib/voting-actions.ts` authenticates the admin and reserves delivery in
Convex before calling `src/lib/invitations.ts`. Delivery has its own pending,
sending, and sent states. A one-minute reservation prevents double-click sends.
Retries first look for a matching non-revoked invitation at Clerk, covering an
email sent successfully when the response or Convex confirmation was lost.
Definitive Clerk refusals release the reservation; uncertain failures retain it
for reconciliation. An existing invitation is reused, never force-created with
`ignoreExisting`.

Account deletion schedules removal of authored nominations and individual
ballots. Removing an account reduces open counts, but does not rewrite a closed
result. No delivered invitation is revoked by cleanup.

## Verification

- `scripts/tests/voting.test.ts`: ballot threshold, rejection, expiry, deletion,
  cooldown, authorization, privacy, name checks, unread state, account cleanup.
- `scripts/tests/voting-actions.test.ts`: sending through the existing helper,
  reconciliation, permission failures, definitive refusals, and uncertain
  delivery/confirmation failures. Clerk is mocked; tests send no email.
- Existing `scripts/tests/chat-admin.test.ts` remains passing.
- TypeScript, targeted ESLint, and the production build passed during development.
- Convex functions were pushed to the development deployment and smoke checked.
- Signed-in visual verification remains outstanding: the available browser
  session redirects to sign-in. No real invitation was sent during verification.
