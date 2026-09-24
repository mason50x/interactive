import { expect, test } from "vitest";
import { adminPageLabel } from "../../src/lib/admin-page-label";

const activities = new Map([["space-race", "Space Race"]]);

test("admin current pages use readable route and activity names", () => {
  expect(adminPageLabel("/activities", activities)).toBe("Activities");
  expect(adminPageLabel("/activities/space-race", activities)).toBe(
    "Activities · Space Race",
  );
  expect(adminPageLabel("/learn/space-race", activities)).toBe(
    "Activities · Space Race",
  );
  expect(adminPageLabel("/chat/conversation-id", activities)).toBe(
    "Chat · Conversation",
  );
  expect(adminPageLabel("/browse/youtube", activities)).toBe(
    "Browse · YouTube",
  );
  expect(adminPageLabel("/emulate/html/hash", activities)).toBe(
    "Emulate · HTML simulator",
  );
});
