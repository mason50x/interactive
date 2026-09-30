# Shared daily playtime

Every account, including staff, receives 1,800 seconds by default at 7:30 a.m.
Central Time (`America/Chicago`). Head Moderators, Co-Owners, and CEOs can set a user's
daily base limit to any whole number from 20 to 160 minutes, or restore the
default. A Head Moderator or Co-Owner cannot change a CEO's limit. Changing a limit during
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

## Background music

Spotify and Apple Music keep playing after you leave Browse (see
`src/lib/listen.ts`). Their frames belong to the app shell, and the mini player
and pop-out control them. While you are in the app, playing music is charged
like any player. While the tab is hidden and the music is still playing, it is
charged at half rate. That is what the pop-out window is for. A `background`
lease is bought at half rate only while every live session is a background
one. When anything visible joins, the rest of the half-rate lease is topped up
to full. Unused background time is refunded at half. Paused music is not
charged, and running out closes the music apps like every other player.

## Chat rewards

Only the normal, authenticated, accepted chat-send mutation can award time.
Each eligible send adds 30 seconds immediately, including while time remains;
rewards stack within the day. A chat before the first player session creates that
day's allowance record. Retries, edits, rejected messages, and bot replies cannot
independently award time.

Most normal text messages qualify, including one-word replies such as “hi,”
“ok,” and “thanks.” There are no minimum word-count, vocabulary-diversity, or
sentence-length requirements. At least one word with two letters is needed after normalizing
Unicode and removing links and mentions. Empty, numeric-only, emoji-only,
link-only, mention-only, repeated-character spam, repeated single-word filler,
and messages over 2,000 characters do not qualify. Text accompanying a link,
mention, or emoji can qualify; ordinary chat moderation still applies.

The first two consecutive matching messages can earn time. A third similar
message earns nothing until another qualifying message breaks the run. Case,
punctuation, numeric suffixes, links, and mentions do not make a new message.
An 80% word overlap also catches near-copies when both messages have at least
eight words. Short replies use exact normalized matching. There is no reward
cooldown or daily cap. Receipts survive chat deletion and daily resets; a daily
job removes them after a day, and account deletion removes them in bounded
batches. Checks and credit share one Convex transaction.

## Rollout

Deploy Convex before the frontend. `bonusSeconds` and `half` are optional for existing data.
Daily keys use the reset's epoch milliseconds, distinct from the legacy UTC day
numbers. The legacy lease rows were removed from development and production on
September 23, 2026. Existing scheduled cleanup cannot erase a new policy key.
The existing CEO Experience reset now resets the entire shared allowance,
including daily bonuses; it retains duplicate receipts.

This follows the app's existing player enforcement model. Public third-party
asset/proxy URLs are not made private by this feature; separately opened remote
sites are outside this app's timer. A signed-in production smoke test should
cover all player types, visibility changes, chat rewards, and the 7:30 reset.
