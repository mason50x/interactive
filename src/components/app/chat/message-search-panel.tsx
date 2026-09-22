"use client";

import { ArrowLeftIcon, PhotoIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { useState } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { Searching } from "@/components/app/chat/searching";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { conversationName } from "@/lib/chat";
import { CHAT_HREF } from "@/lib/nav";
import { useDebounced } from "@/lib/use-debounced";
import { api } from "@convex/_generated/api";

export function MessageSearchPanel({ onBack }: { onBack: () => void }) {
  const { isAuthenticated } = useConvexAuth();
  const [text, setText] = useState("");
  const query = text.trim();
  const debouncedText = useDebounced(query, 200);
  const found = useQuery(
    api.chat.messages.search,
    isAuthenticated && debouncedText
      ? { text: debouncedText, limit: 30 }
      : "skip",
  );
  const waiting =
    query !== "" && (found === undefined || debouncedText !== query);

  return (
    <section
      className="flex min-h-0 flex-1 flex-col"
      aria-label="Message search"
    >
      <div className="flex shrink-0 items-center gap-2 px-3 pt-4 pb-3">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onBack}
          aria-label="Back to conversations"
        >
          <ArrowLeftIcon />
        </Button>
        <h2 className="text-base font-semibold">Search messages</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <Input
          autoFocus
          type="search"
          aria-label="Search messages"
          placeholder="Find a message"
          value={text}
          maxLength={200}
          onChange={(event) => setText(event.target.value)}
        />
        <div
          className="mt-4 border-t border-border pt-3"
          aria-live="polite"
          aria-busy={waiting}
        >
          {query === "" ? (
            <p className="text-sm leading-relaxed text-muted-foreground">
              Type to search your messages.
            </p>
          ) : waiting ? (
            <Searching />
          ) : found?.length === 0 ? (
            <p className="text-sm leading-relaxed text-muted-foreground">
              No messages match. Try another word.
            </p>
          ) : (
            <>
              <p className="mb-2 text-xs text-faint">
                {found?.length} matching{" "}
                {found?.length === 1 ? "message" : "messages"}
              </p>
              <ul className="space-y-1">
                {found?.map((message) => (
                  <li key={message._id}>
                    <Link
                      href={`${CHAT_HREF}/${message.conversationId}?message=${message._id}`}
                      className="block rounded-lg px-2 py-2.5 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`Open message by ${message.authorHandle} in ${conversationName(message)}`}
                    >
                      <span className="mb-1 block truncate text-xs text-muted-foreground">
                        @{message.authorHandle} · {conversationName(message)}
                      </span>
                      <span className="line-clamp-3 block text-sm break-words whitespace-pre-wrap">
                        {message.body || "Picture"}
                      </span>
                      <span className="mt-1 flex items-center gap-1 text-xs text-faint">
                        {message.hasImages ? (
                          <PhotoIcon
                            className="size-3"
                            aria-label="Has a picture"
                          />
                        ) : null}
                        <time
                          dateTime={new Date(
                            message._creationTime,
                          ).toISOString()}
                        >
                          {new Date(message._creationTime).toLocaleString(
                            undefined,
                            {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            },
                          )}
                        </time>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {(found?.length ?? 0) >= 30 ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  Showing the first 30 matches. Try a more specific search to
                  find your message.
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
