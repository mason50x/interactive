import { expect, test } from "vitest";
import { segmentMentions } from "../../src/lib/mentions";

test("typed and sent bot aliases render as bot chips with their original text", () => {
  const segments = segmentMentions("@Verity and @bot", handle => handle === "bot" ? "bot" : undefined);
  expect(segments.filter(segment => segment.kind === "mention")).toEqual([
    { kind: "mention", text: "@Verity", handle: "verity", clerkId: "bot" },
    { kind: "mention", text: "@bot", handle: "bot", clerkId: "bot" },
  ]);
});

test("aliases remain plain text when the bot is not a resolved participant", () => {
  expect(segmentMentions("@Verity", () => undefined)).toEqual([
    { kind: "text", text: "@Verity" },
  ]);
});
