# Site availability

The site is available at all hours, every day. The Worker does not restrict
requests by time or day of the week.

`worker.ts` applies response headers to app responses and static assets.
`assets.run_worker_first` in `wrangler.jsonc` ensures both receive this policy.
Successful static assets use fixed private browser cache lifetimes: one hour
for `/_next/static/` and five minutes for other assets. Dashboard, auth, and
learning routes retain `private, no-store` caching.

Tests in `scripts/tests/worker.test.ts` cover production requests in the early
morning, evenings, and weekends, asset serving, and response caching. The
Workers browser tests run regardless of the current time.
