# Site availability

The site is available at all hours, every day. The Worker does not restrict
requests by time or day of the week.

`worker.ts` applies response headers to app responses and to the static
assets that still pass through it. Hashed build output and the public artwork
directories are served by the asset layer without the Worker, with the same
crawler and framing headers from `public/_headers`; see "What runs through
the Worker" in `deployment.md`. Hashed files under `/_next/static/` are
cached publicly for a year as immutable, artwork publicly for a day, and
anything else the Worker serves privately for five minutes. Dashboard, auth,
and learning routes retain `private, no-store` caching.

Tests in `scripts/tests/worker.test.ts` cover production requests in the early
morning, evenings, and weekends, asset serving, and response caching. The
Workers browser tests run regardless of the current time.
