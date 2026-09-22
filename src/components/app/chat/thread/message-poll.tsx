"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { ChatPoll } from "@convex/chat/messages";
import { cn } from "@/lib/utils";

export function MessagePoll({
  messageId,
  poll,
  canAct,
  mine,
}: {
  messageId: Id<"messages">;
  poll: ChatPoll;
  canAct: boolean;
  mine: boolean;
}) {
  const vote = useMutation(api.chat.messages.vote);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mt-3 w-64 max-w-full space-y-1.5" aria-label="Poll">
      {poll.options.map((option, index) => {
        const percent =
          poll.totalVotes === 0
            ? 0
            : Math.round((option.votes / poll.totalVotes) * 100);
        const selected = poll.myVote === index;
        return (
          <button
            key={index}
            type="button"
            disabled={!canAct || busy}
            aria-pressed={selected}
            aria-label={`${option.text}, ${option.votes} votes${selected ? ", your vote" : ""}`}
            className={cn(
              "relative flex w-full overflow-hidden rounded-lg border px-3 py-2 text-left text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-current disabled:cursor-default",
              mine ? "border-primary-foreground/25" : "border-border",
              selected && "ring-1 ring-current",
            )}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                const result = await vote({ messageId, option: index });
                if (!result.ok) setError("That vote could not be saved.");
              } catch {
                setError("Could not save your vote. Try again.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 bg-current opacity-10 transition-[width]"
              style={{ width: `${percent}%` }}
            />
            <span className="relative min-w-0 flex-1 break-words">
              {selected ? "✓ " : ""}
              {option.text}
            </span>
            <span className="relative ml-3 shrink-0 text-xs tabular-nums">
              {percent}%
            </span>
          </button>
        );
      })}
      <p className="text-xs font-normal opacity-75">
        {poll.totalVotes} {poll.totalVotes === 1 ? "vote" : "votes"} · Choose
        one{poll.myVote !== null ? " · Vote again to change" : ""}
      </p>
      {error ? (
        <p role="alert" className="text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}
