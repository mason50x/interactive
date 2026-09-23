/// <reference types="vite/client" />
import { expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.ts");

/** The old fields were removed only after both deployments were migrated. */
test("migrated legacy fields are rejected by the schema", async () => {
  const t = convexTest(schema, modules);
  await expect(t.run((ctx) =>
    ctx.db.insert("conversations", Object.assign({
      kind: "global" as const,
      createdBy: "user_test",
      createdAt: 1,
    }, {
      lastMorningGreetingDay: "2026-09-20",
    })),
  )).rejects.toThrow("Unexpected field");
  await expect(t.run(ctx => ctx.db.insert("users", Object.assign(
    { clerkId: "user_test" }, { agreementVersion: 1 },
  )))).rejects.toThrow("Unexpected field");
});
