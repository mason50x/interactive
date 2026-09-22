import { MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "../_generated/api";
export const limits = new RateLimiter(components.rateLimiter, {
  publishedHtml: { kind: "token bucket", rate: 4, period: MINUTE, capacity: 6 },
  simulatorSave: {
    kind: "token bucket",
    rate: 6,
    period: MINUTE,
    capacity: 10,
  },
  simulatorLibrary: {
    kind: "token bucket",
    rate: 10,
    period: MINUTE,
    capacity: 20,
  },
});
