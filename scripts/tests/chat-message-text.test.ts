import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { MessageText } from "../../src/components/app/chat/thread/message-text";
import type { ChatMessage } from "../../convex/chat/messages";
import type { Id } from "../../convex/_generated/dataModel";

function render(body: string, plainMentions = false) {
  const message: ChatMessage = {
    _id: "message" as Id<"messages">,
    _creationTime: 1,
    authorClerkId: "sender",
    authorHandle: "sender",
    body,
    mentions: [{ handle: "alice", clerkId: "alice-id" }],
    mentionsEveryone: true,
    status: "visible",
    reactions: [],
    images: [],
  };
  return renderToStaticMarkup(
    createElement(MessageText, {
      message,
      me: "alice-id",
      mine: false,
      plainMentions,
    }),
  );
}

describe("chat Markdown rendering", () => {
  test("renders nested strong and emphasis, including combined Tiptap marks", () => {
    const html = render("***both*** and **bold with *italic* inside**");
    expect(html).toContain("<em><strong>both</strong></em>");
    expect(html).toContain("<strong>bold with <em>italic</em> inside</strong>");
  });

  test("preserves escaped formatting and ordinary underscores", () => {
    const html = render(
      String.raw`\*\*literal\*\* and snake_case and \*plain\*`,
    );
    expect(html).toContain("**literal** and snake_case and *plain*");
    expect(html).not.toMatch(/<(?:strong|em)>/);
  });

  test("keeps inline and fenced code literal without mention chips", () => {
    const html = render(
      "`@alice **literal**`\n\n```js\n@alice <script>example</script>\n```",
    );
    expect(html).toContain("@alice **literal**</code>");
    expect(html).toMatch(
      /<pre\b[^>]*><code\b[^>]*>@alice &lt;script&gt;example&lt;\/script&gt;\n<\/code><\/pre>/,
    );
    expect(html).not.toContain("mention-chip");
    expect(html).not.toContain("<script>");
  });

  test("renders ordered and nested bullet lists with the original start number", () => {
    const html = render("3. first\n4. second\n   - nested **item**");
    expect(html).toMatch(/<ol start="3"/);
    expect(html).toMatch(/<ul\b[^>]*>/);
    expect(html).toContain("nested <strong>item</strong>");
    expect(html.match(/<li\b/g)).toHaveLength(3);
  });

  test("preserves paragraphs, soft line breaks, and explicit hard breaks", () => {
    const html = render("first\nsecond\n\nthird  \nfourth");
    expect(html).toMatch(/<p[^>]*whitespace-pre-wrap[^>]*>first\nsecond<\/p>/);
    expect(html).toMatch(/third<br\/>\nfourth/);
    expect(html.match(/<p\b/g)).toHaveLength(2);
  });

  test("keeps resolved mentions inside nested formatting and list items", () => {
    const html = render("***@alice***\n\n- @everyone\n- @unknown");
    expect(html).toMatch(
      /<em><strong><span[^>]*mention-chip[^>]*>@alice<\/span><\/strong><\/em>/,
    );
    expect(html).toMatch(/<span[^>]*mention-chip[^>]*>@everyone<\/span>/);
    expect(html.match(/class="mention-chip/g)).toHaveLength(2);
    expect(html).toContain("@unknown</li>");
    expect(render("**@alice**", true)).not.toContain("mention-chip");
  });

  test("displays link and image labels without navigation or remote embeds", () => {
    const html = render(
      "[a **label**](https://example.com) ![portrait](https://example.com/image.png) [unsafe](javascript:alert%281%29)",
    );
    expect(html).toContain("a <strong>label</strong>");
    expect(html).toContain("portrait");
    expect(html).toContain("unsafe");
    expect(html).not.toMatch(/<(?:a|img)\b|\b(?:href|src)=|https:|javascript:/);
  });

  test("never interprets raw HTML as elements or event handlers", () => {
    const html = render(
      '<script>alert("x")</script>\n\n<img src="x" onerror="alert(1)">\n\nHello <b>friend</b>',
    );
    expect(html).toContain("Hello friend");
    expect(html).not.toMatch(/<(?:script|img|b)\b|onerror|alert/);
  });
});
