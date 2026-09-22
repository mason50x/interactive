import { MarkdownManager } from "@tiptap/markdown";
import { expect, test } from "vitest";
import { chatEditorExtensions } from "../../src/lib/chat-editor-format";
import { findMentionTokens as clientTokens } from "../../src/lib/mentions";
import {
  findMentionTokens as serverTokens,
  maskMentions,
} from "../../convex/moderation/mentions";

const manager = new MarkdownManager({ extensions: chatEditorExtensions() });

test.each(["my_name", "__name__", "name_", "a_b_c"])(
  "Markdown escaping preserves mention identity and raw offsets for %s",
  (handle) => {
    const document = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: `Hello @${handle} today` }],
        },
      ],
    };
    const markdown = manager.serialize(document);
    const tokens = serverTokens(markdown);
    expect(tokens).toHaveLength(1);
    expect(tokens[0].handle).toBe(handle);
    expect(clientTokens(markdown)).toEqual(tokens);
    expect(
      markdown.slice(tokens[0].start, tokens[0].end).replace(/\\_/g, "_"),
    ).toBe(`@${handle}`);
    expect(maskMentions(markdown, new Set([handle]))).toBe("Hello   today");
    expect(manager.parse(markdown)).toEqual(document);
  },
);

test("email addresses and longer-than-allowed escaped handles are not mentions", () => {
  for (const text of ["me@example_name.com", `@${"a".repeat(64)}\\_`]) {
    expect(serverTokens(text)).toEqual([]);
    expect(clientTokens(text)).toEqual([]);
  }
});
