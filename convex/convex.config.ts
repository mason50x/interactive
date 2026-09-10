import { defineApp } from "convex/server";
import agent from "@convex-dev/agent/convex.config.js";
import rateLimiter from "@convex-dev/rate-limiter/convex.config.js";

const app = defineApp();

app.use(agent);
app.use(rateLimiter);

export default app;
