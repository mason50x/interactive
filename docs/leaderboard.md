# Leaderboard

The signed-in `/leaderboard` page shows time played (today and all time), chat messages (UTC day, week, and month), and visits to the main app sections (today). Rankings start when this feature is deployed; historical messages, leases, and page visits are not backfilled.

`leaderboardScores` stores one row per account and score bucket. Its index on `(key, score)` serves the top 50 candidates directly, and the query joins at most 50 user profiles before showing 25. This avoids scanning messages, leases, or users on a page load. `leaderboardPages` stores one row per UTC day and known app section. Page counts are recorded by the existing visible-tab activity heartbeat only on a section change or after a gap of at least one minute, with at most one count per account per minute. No visit events are stored. Admin pages are excluded from public standings.

The chat send mutation increments three calendar buckets only after accepting a message; retries with the same nonce do not count again. The playtime lease mutation adds reserved seconds to today's and all-time buckets only after the rate limiter accepts the reservation. Release subtracts unused reserved seconds. These writes are in the original transactions, so a failed send or lease does not leave a score behind. Each write touches only the caller's rows, except page views, which update one of six small section rows.

Daily score buckets are retained 35 days, weekly buckets 84 days, and monthly buckets 400 days. A daily cron removes expired rows and page buckets in batches of 100, scheduling another batch if needed. All-time playtime rows remain until the account is deleted. Clerk deletion schedules bounded cleanup of that account's score rows. The client advances a UTC day key each minute so subscriptions refresh at midnight even if no new writes arrive.

The leaderboard uses local React components and the existing design system. The available leaderboard packages were designed around third-party gamification or analytics services; neither fits these Convex aggregates or the app's visual language.
