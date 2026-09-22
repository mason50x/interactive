import { Children, memo, type ReactNode } from "react";
import Markdown, { type Components } from "react-markdown";
import { MentionText, resolverFor } from "@/components/app/chat/mentions";
import type { ChatMessage } from "@convex/chat/messages";

// Keep Markdown's parser and escaping, but give chat only the formatting the
// composer supports. Links and images are reduced to their readable labels.
const ALLOWED_ELEMENTS = [
  "p",
  "strong",
  "em",
  "code",
  "pre",
  "ul",
  "ol",
  "li",
  "br",
  "a",
  "img",
];

export const MessageText = memo(function MessageText({
  message,
  me,
  mine,
  plainMentions,
}: {
  message: ChatMessage;
  me: string | null | undefined;
  mine: boolean;
  plainMentions: boolean;
}) {
  const resolve = plainMentions
    ? () => undefined
    : resolverFor(message.mentions, message.mentionsEveryone);

  function renderMentions(children: ReactNode) {
    return Children.map(children, (child) =>
      typeof child === "string" ? (
        <MentionText body={child} resolve={resolve} me={me} mine={mine} />
      ) : (
        child
      ),
    );
  }

  const components: Components = {
    p: ({ children }) => (
      <p className="my-1 whitespace-pre-wrap first:mt-0 last:mb-0">
        {renderMentions(children)}
      </p>
    ),
    strong: ({ children }) => <strong>{renderMentions(children)}</strong>,
    em: ({ children }) => <em>{renderMentions(children)}</em>,
    ul: ({ children }) => (
      <ul className="my-1 list-disc space-y-0.5 pl-5">{children}</ul>
    ),
    ol: ({ children, start }) => (
      <ol start={start} className="my-1 list-decimal space-y-0.5 pl-5">
        {children}
      </ol>
    ),
    li: ({ children }) => (
      <li className="whitespace-pre-wrap">{renderMentions(children)}</li>
    ),
    code: ({ children }) => (
      <code className="rounded bg-foreground/10 px-1 py-0.5 font-mono text-[0.85em]">
        {children}
      </code>
    ),
    pre: ({ children }) => (
      <pre className="my-1 max-w-full overflow-x-auto rounded-lg bg-foreground/10 p-2 font-mono text-[0.8125rem] font-normal whitespace-pre [&>code]:rounded-none [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-inherit">
        {children}
      </pre>
    ),
    a: ({ children }) => <>{renderMentions(children)}</>,
    img: ({ alt }) => <>{alt ?? ""}</>,
  };

  return (
    <Markdown
      allowedElements={ALLOWED_ELEMENTS}
      unwrapDisallowed
      skipHtml
      urlTransform={() => ""}
      components={components}
    >
      {message.body}
    </Markdown>
  );
});
