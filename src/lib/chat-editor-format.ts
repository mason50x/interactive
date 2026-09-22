import type {
  AnyExtension,
  JSONContent,
  MarkdownRendererHelpers,
} from "@tiptap/core";
import CodeBlock from "@tiptap/extension-code-block";
import HardBreak from "@tiptap/extension-hard-break";
import Paragraph from "@tiptap/extension-paragraph";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";

function longestBackticks(text: string): number {
  return Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
}

/** CommonMark requires a delimiter longer than every run inside the code. */
function inlineCode(text: string): string {
  const delimiter = "`".repeat(longestBackticks(text) + 1);
  const padding =
    text.startsWith("`") ||
    text.endsWith("`") ||
    (/^ .* $/.test(text) && /[^ ]/.test(text))
      ? " "
      : "";
  return `${delimiter}${padding}${text}${padding}${delimiter}`;
}

function renderInline(
  content: JSONContent[],
  helpers: MarkdownRendererHelpers,
): string {
  const result: string[] = [];
  let ordinary: JSONContent[] = [];
  let code = "";
  const flushOrdinary = () => {
    if (ordinary.length) result.push(helpers.renderChildren(ordinary));
    ordinary = [];
  };
  const flushCode = () => {
    if (code) result.push(inlineCode(code));
    code = "";
  };
  for (const node of content) {
    if (
      node.type === "text" &&
      node.marks?.some((mark) => mark.type === "code")
    ) {
      flushOrdinary();
      code += node.text ?? "";
    } else {
      flushCode();
      ordinary.push(node);
    }
  }
  flushCode();
  flushOrdinary();
  return result.join("");
}

/** Escape block syntax only after marks and inline escapes have been rendered. */
function escapeParagraphStarts(markdown: string): string {
  return markdown
    .replace(/^( {0,3})(\d{1,9})([.)])(?=\s|$)/gm, "$1$2\\$3")
    .replace(/^( {0,3})([-+])(?=\s|$)/gm, "$1\\$2")
    .replace(/^( {0,3})(#{1,6})(?=\s|$)/gm, "$1\\$2")
    .replace(/^( {0,3})([-=])(?=[-=]*\s*$)/gm, "$1\\$2");
}

const ChatParagraph = Paragraph.extend({
  renderMarkdown(node: JSONContent, helpers, context) {
    if (!node.content?.length)
      return (
        Paragraph.config.renderMarkdown?.call(this, node, helpers, context) ??
        ""
      );
    return escapeParagraphStarts(renderInline(node.content, helpers));
  },
  parseMarkdown(token, helpers) {
    // Marked drops a final hard break at a paragraph boundary. A terminal odd
    // backslash run records that break; literal backslashes serialize doubled.
    const source = token.text ?? "";
    const slashRun = source.match(/\\+$/)?.[0].length ?? 0;
    let trailingBreaks = slashRun % 2;
    let text = trailingBreaks ? source.slice(0, -1) : source;
    while (
      trailingBreaks &&
      (text.match(/(\\+)\n$/)?.[1].length ?? 0) % 2 === 1
    ) {
      text = text.slice(0, -2);
      trailingBreaks += 1;
    }
    const tokens =
      trailingBreaks && helpers.tokenizeInline
        ? helpers.tokenizeInline(text)
        : (token.tokens ?? []);
    const parsed = Paragraph.config.parseMarkdown?.call(
      this,
      { ...token, text, tokens },
      helpers,
    );
    if (!parsed || Array.isArray(parsed) || "mark" in parsed)
      return parsed ?? [];
    const content = (parsed.content ?? []).flatMap((node: JSONContent) => {
      if (node.type !== "text" || !node.text?.includes("\n")) return [node];
      return node.text
        .split("\n")
        .flatMap((part, index) => [
          ...(index ? [{ type: "hardBreak" }] : []),
          ...(part ? [{ ...node, text: part }] : []),
        ]);
    });
    for (let index = 0; index < trailingBreaks; index++)
      content.push({ type: "hardBreak" });
    return { ...parsed, content };
  },
});

const ChatCodeBlock = CodeBlock.extend({
  renderMarkdown(node: JSONContent, helpers) {
    const text = helpers.renderChildren(node.content ?? []);
    const fence = "`".repeat(Math.max(3, longestBackticks(text) + 1));
    const language = String(node.attrs?.language ?? "").replace(/[\r\n`]/g, "");
    return `${fence}${language}\n${text}\n${fence}`;
  },
});

const ChatHardBreak = HardBreak.extend({
  renderMarkdown: () => "\\\n",
});

/** Trim unsent blank lines without leaving their hard-break escape visible. */
export function trimChatMarkdownForSend(markdown: string): string {
  let text = markdown;
  while (true) {
    const trailing = text.match(/(\\+)\n\s*$/);
    if (!trailing || trailing[1].length % 2 === 0) break;
    text = text.slice(0, trailing.index! + trailing[1].length - 1);
  }
  return text.trim();
}

/** Shared by the live editor and round-trip tests; no DOM is needed to serialize. */
export function chatEditorExtensions(): AnyExtension[] {
  return [
    StarterKit.configure({
      heading: false,
      blockquote: false,
      horizontalRule: false,
      strike: false,
      underline: false,
      link: false,
      trailingNode: false,
      paragraph: false,
      codeBlock: false,
      hardBreak: false,
    }),
    ChatParagraph,
    ChatCodeBlock,
    ChatHardBreak,
    Markdown.configure({ markedOptions: { breaks: true, gfm: false } }),
  ];
}
