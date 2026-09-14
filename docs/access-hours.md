# Site access hours

The Cloudflare Worker permits requests Monday–Friday from 7:30 a.m. inclusive
until 2:55 p.m. exclusive in `America/Chicago`. This follows Central daylight
and standard time. All other times return HTTP 403 with a non-cacheable closure
page. There are no IP, account, path, or geographic exceptions.

`src/lib/access-hours.ts` defines the schedule. `worker.ts` checks it before
calling the app. `assets.run_worker_first` in `wrangler.jsonc` ensures static
assets also pass through the gate. No scheduler, external lookup, or database
is needed. The same policy applies when running the built Worker locally.

Tests in `scripts/tests/access-hours.test.ts` cover boundaries, weekdays,
weekends, daylight saving, and Worker enforcement with a controlled clock.
The Workers browser tests check the appropriate behavior for the current time.

This controls new requests to the app's Cloudflare domains. It does not unload
already-open pages, erase downloaded content, or disconnect existing connections
to the separately hosted Convex backend or content origin.

To change the schedule, edit the helper, update the tests, build with production
public environment variables, and deploy the generated Worker configuration.
