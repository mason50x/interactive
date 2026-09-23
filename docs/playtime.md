# Shared daily playtime

Every account, including staff, receives 1,800 seconds by default at 7:35 a.m.
Central Time (`America/Chicago`). Head Moderators and CEOs can set a user's
daily base limit to any whole number from 20 to 160 minutes, or restore the
default. A Head Moderator cannot change a CEO's limit. Changing a limit during
the day preserves time already spent; lowering it below spent time leaves no
time until a reward or the next reset. There is no rollover; daily chat bonuses
expire at that boundary. `config/playtime.ts` owns the timezone, default
allowance, and reward rules.

The existing `experience.status/acquire/release` APIs now serve games, proxy
apps, entertainment players, and all three simulator player types. Catalogues,
chat, and the sidebar only read status. A visible player reserves at most 15
seconds, renewing before expiry. Multiple tabs share one prepaid lease; the last
session to leave returns unused seconds. A crashed/offline client can consume at
most the last reservation, and cannot keep its player mounted after it expires.
The outer game player and direct `/learn` document both gate their content and
share the same lease, so they do not charge twice. Hidden documents stop and
release, matching the existing proxy behavior.

The sidebar shows a live countdown with expandable details above the version card.
Exhaustion unmounts players, grays out the four playtime tabs, and redirects active
playtime routes to Chat. Chat stays fully usable. Direct links and browser Back
receive the same route guard. The standalone `/learn` document retains a local
exhaustion notice with a chat link. Existing moderation timeouts are separate.

## Chat rewards

Only the normal, authenticated, accepted chat-send mutation can award time.
Each eligible send adds 120 seconds immediately, including while time remains;
rewards stack within the day. A chat before the first player session creates that
day's allowance record. Retries, edits, rejected messages, and bot replies cannot
independently award time.

Most normal text messages qualify, including one-word replies such as “hi,”
“ok,” and “thanks.” There are no minimum word-count, vocabulary-diversity, or
sentence-length requirements. At least two letters are needed after normalizing
Unicode and removing links and mentions. Empty, numeric-only, emoji-only,
link-only, mention-only, repeated-character spam, repeated single-word filler,
and messages over 2,000 characters do not qualify. Text accompanying a link,
mention, or emoji can qualify; ordinary chat moderation still applies.

SHA-256 receipts prevent an account from reusing any previously rewarded message,
ignoring case, formatting characters, punctuation, and numeric suffixes. An 80%
word overlap check against its last 50 rewards also rejects near-copies when
both messages have at least eight words. Short replies only use exact normalized
duplicate checks, so ordinary overlapping phrases are not mistaken for spam. Receipts
survive chat deletion and daily resets, but account deletion removes them in
bounded batches. Checks and credit share one Convex transaction, so concurrent
sends cannot award twice for the same message.

## Rollout

Deploy Convex before the frontend. `bonusSeconds` is optional for existing data.
Daily keys use the reset's epoch milliseconds, distinct from the legacy UTC day
numbers: the new policy starts users at 30 minutes when deployed. Existing
scheduled legacy cleanup remains compatible and cannot erase a new policy key.
The existing CEO Experience reset now resets the entire shared allowance,
including daily bonuses; it retains duplicate receipts.

This follows the app's existing player enforcement model. Public third-party
asset/proxy URLs are not made private by this feature; separately opened remote
sites are outside this app's timer. A signed-in production smoke test should
cover all player types, visibility changes, chat rewards, and the 7:35 reset.
