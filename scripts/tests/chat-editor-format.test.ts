import type { JSONContent } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { expect, test } from "vitest";
import {
  chatEditorExtensions,
  trimChatMarkdownForSend,
} from "../../src/lib/chat-editor-format";

const manager = new MarkdownManager({
  extensions: chatEditorExtensions(),
  markedOptions: { breaks: true, gfm: false },
});
const paragraph = (...content: JSONContent[]): JSONContent => ({
  type: "paragraph",
  content,
});
const text = (value: string): JSONContent => ({ type: "text", text: value });
const doc = (...content: JSONContent[]): JSONContent => ({
  type: "doc",
  content,
});

test.each([
  "1. literal",
  "12) literal",
  "- literal",
  "+ literal",
  "# literal",
  "### literal",
  "---",
  "===",
])("a paragraph beginning %s stays a paragraph", (literal) => {
  const document = doc(paragraph(text(literal)));
  const markdown = manager.serialize(document);
  expect(manager.parse(markdown)).toEqual(document);
  expect(manager.serialize(manager.parse(markdown))).toBe(markdown);
});

test.each([
  "a`b",
  "`edge",
  "edge`",
  "```",
  "``inside`value``",
  " code ",
  " ",
  "a&b<c>",
])("inline code %s survives its delimiters", (value) => {
  const document = doc(
    paragraph(
      text("Before "),
      { type: "text", text: value, marks: [{ type: "code" }] },
      text(" after"),
    ),
  );
  const markdown = manager.serialize(document);
  expect(manager.parse(markdown)).toEqual(document);
});

test("code fences are longer than embedded fence runs and preserve language", () => {
  const document = doc({
    type: "codeBlock",
    attrs: { language: "js" },
    content: [text("const sample = `value`;\n```\n````\nlast line")],
  });
  const markdown = manager.serialize(document);
  expect(markdown).toMatch(/^`````js\n/);
  expect(manager.parse(markdown)).toEqual(document);
});

test("the final hard break survives draft serialization", () => {
  const document = doc(paragraph(text("First line"), { type: "hardBreak" }));
  expect(manager.parse(manager.serialize(document))).toEqual(document);
});

test("hard breaks before block boundaries and literal backslashes remain distinct", () => {
  const document = doc(
    paragraph(text("First"), { type: "hardBreak" }),
    paragraph(text("Second\\")),
    paragraph(text("Third"), { type: "hardBreak" }, { type: "hardBreak" }),
  );
  const markdown = manager.serialize(document);
  expect(manager.parse(markdown)).toEqual(document);
});

test("literal list markers after hard breaks remain paragraph text", () => {
  const document = doc(
    paragraph(
      text("First"),
      { type: "hardBreak" },
      text("1. literal"),
      { type: "hardBreak" },
      text("- literal"),
    ),
  );
  expect(manager.parse(manager.serialize(document))).toEqual(document);
});

test("legacy soft line breaks become visible hard breaks in the editor", () => {
  expect(manager.parse("First\nSecond")).toEqual(
    doc(paragraph(text("First"), { type: "hardBreak" }, text("Second"))),
  );
});

test("real lists and mixed formatting keep their structure", () => {
  const document = doc({
    type: "bulletList",
    content: [
      {
        type: "listItem",
        content: [
          paragraph(
            { type: "text", text: "Bold", marks: [{ type: "bold" }] },
            text(" and "),
            { type: "text", text: "italic", marks: [{ type: "italic" }] },
          ),
        ],
      },
    ],
  });
  expect(manager.parse(manager.serialize(document))).toEqual(document);
});

test("sending trims a final blank line without exposing its escape or changing literal backslashes", () => {
  expect(
    trimChatMarkdownForSend(
      manager.serialize(doc(paragraph(text("Hello"), { type: "hardBreak" }))),
    ),
  ).toBe("Hello");
  const slash = manager.serialize(doc(paragraph(text("Hello\\"))));
  expect(trimChatMarkdownForSend(slash)).toBe(slash);
});
