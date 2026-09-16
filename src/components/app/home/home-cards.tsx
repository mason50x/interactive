"use client";

import Link from "next/link";
import { useConvexAuth, useQuery } from "convex/react";
import { CalendarDaysIcon } from "@heroicons/react/24/outline";
import { api } from "@convex/_generated/api";
import { useChat } from "@/components/app/chat/chat-provider";
import { Card } from "@/components/ui/card";
import { QuoteCard } from "./quote-card";
import styles from "./home.module.css";

export function HomeCards() {
  const { profile, loading, conversations } = useChat();
  const { isAuthenticated } = useConvexAuth();
  const room = conversations.find((row) => row.kind === "global");
  const messages = useQuery(
    api.chat.messages.list,
    isAuthenticated && room
      ? {
          conversationId: room._id,
          dayStart: 0,
          dayEnd: 8_640_000_000_000_000,
          paginationOpts: { numItems: 3, cursor: null },
        }
      : "skip",
  );
  const visible = messages?.page.filter(
    (message) => message.status === "visible",
  );
  return (
    <aside
      aria-label="Your day"
      className={`${styles.cards} flex flex-col gap-4`}
    >
      <QuoteCard />
      <Card radius="md" className="p-5">
        <h2 className="text-sm font-semibold">Recent chat messages</h2>
        {visible?.length ? (
          <ul className="mt-4 flex flex-col gap-4">
            {visible.map((message) => (
              <li key={message._id}>
                <Link
                  href={`/chat/${room!._id}`}
                  className="group flex gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span
                    aria-hidden
                    className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary"
                  >
                    {(message.authorName || message.authorHandle)
                      .slice(0, 1)
                      .toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-xs font-medium">
                        {message.authorName || message.authorHandle}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground group-hover:text-foreground">
                      {message.body || "Shared a picture"}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-xs text-muted-foreground">
            {loading || (room && !messages)
              ? "Loading the conversation…"
              : "It’s quiet here. Start a conversation."}
          </p>
        )}
      </Card>
      <Card radius="md" className="p-5">
        <h2 className="text-sm font-semibold">Joined</h2>
        <div className="mt-4 flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-foreground/5">
            <CalendarDaysIcon className="size-5 text-muted-foreground" />
          </span>
          <p className="text-sm">
            {profile ? (
              <time dateTime={new Date(profile.createdAt).toISOString()}>
                {new Date(profile.createdAt).toLocaleDateString([], {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </time>
            ) : loading ? (
              "Loading your account…"
            ) : (
              "Join the community in Chat"
            )}
          </p>
        </div>
      </Card>
    </aside>
  );
}
