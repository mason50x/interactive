/// <reference types="vite/client" />
import { expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.ts");

/**
 * Deploy-time schema validation rejects documents carrying a field the
 * validator no longer names — which is exactly what blocked a deploy once
 * when a dead feature's optional field was dropped while prod rows still
 * carried it. Legacy optional fields stay until their data is gone.
 */
test("legacy morning-greeting field still validates on conversation rows", async () => {
  const t = convexTest(schema, modules);
  const conversationId = await t.run((ctx) =>
    ctx.db.insert("conversations", {
      kind: "global",
      createdBy: "user_test",
      createdAt: 1,
      lastMorningGreetingDay: "2026-09-20",
    }),
  );
  const row = await t.run((ctx) => ctx.db.get(conversationId));
  expect(row?.lastMorningGreetingDay).toBe("2026-09-20");
});
