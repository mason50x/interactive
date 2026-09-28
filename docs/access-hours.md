# Site availability

Production answers Monday–Friday, 7:30 a.m. to 2:55 p.m. Central time.
Outside those hours every request the proxy handles gets a 403 "Outside
working hours" page. Daylight saving is followed automatically.

The gate lives in `src/lib/access-hours.ts` and runs first in `src/proxy.ts`,
before Clerk. It covers every page, RSC payload, Server Action and route
handler the proxy matches. Static files — `/_next/static/` and `public/` —
are served by Vercel's CDN before the proxy and stay reachable; they carry no
session.

Only Vercel production (`VERCEL_ENV=production`) is gated. Local `next dev`
and `next start`, CI and preview deployments stay up around the clock. One
bypass IP, read from Vercel's `x-real-ip` header (which visitors cannot set),
is always let through; `x-forwarded-for` is ignored because it can carry
client-supplied hops.

Response caching is set in `next.config.ts`: dashboard, auth and learning
routes are `private, no-store`, artwork under `public/` is public for a day,
and hashed build output is immutable.

Tests in `scripts/tests/access-hours.test.ts` cover the open window, early
morning, evenings, weekends, non-production environments and the bypass.
