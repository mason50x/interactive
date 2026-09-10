"use client";

import { Tooltip } from "@base-ui/react/tooltip";
import { useQuery } from "convex/react";
import { useState } from "react";
import { popupVariants } from "@/components/ui/popup";
import { CenteredSpinner } from "@/components/ui/spinner";
import { personName } from "@/lib/chat";
import { cn } from "@/lib/utils";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import type { ChatReaction } from "../../../../../convex/chat/messages";

/**
 * One reaction under a message: the emoji, how many, and — on hover — who.
 *
 * The names are asked for only while the tooltip is open. A thread of forty
 * messages with a reaction each is forty of these, and forty subscriptions to
 * reactor lists nobody has hovered is the kind of cost the thread was built
 * not to carry. The provider that sets the hover delay is the row's, so the
 * pills on one message share it.
 */
export function ReactionPill({
  messageId,
  reaction,
  canAct,
  onReact,
}: {
  messageId: Id<"messages">;
  reaction: ChatReaction;
  canAct: boolean;
  onReact: () => void;
}) {
  const [open, setOpen] = useState(false);
  const people = useQuery(
    api.chat.messages.reactors,
    open ? { messageId, emoji: reaction.emoji } : "skip",
  );
  const hidden =
    people === undefined ? 0 : Math.max(0, reaction.count - people.length);

  return (
    <Tooltip.Root open={open} onOpenChange={setOpen}>
      <Tooltip.Trigger
        delay={250}
        render={
          <button
            type="button"
            aria-disabled={!canAct}
            onClick={() => {
              if (canAct) onReact();
            }}
            className={cn(
              "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.75rem] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
              reaction.mine
                ? "border-primary/50 bg-primary/10"
                : "border-border hover:bg-foreground/[0.05]",
            )}
            aria-label={`${reaction.emoji} reaction from ${reaction.count} ${reaction.count === 1 ? "person" : "people"}. Hover to see who reacted.`}
          />
        }
      >
        <span>{reaction.emoji}</span>
        <span className="text-muted-foreground">{reaction.count}</span>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner
          side="top"
          align="center"
          sideOffset={8}
          className="z-50"
        >
          <Tooltip.Popup
            className={cn(
              popupVariants({ motion: "slide", padding: "md" }),
              "max-h-64 w-max max-w-64 overflow-y-auto",
            )}
          >
            <p className="mb-1.5 text-[0.6875rem] font-semibold text-faint">
              Reacted with {reaction.emoji}
            </p>
            {people === undefined ? (
              <CenteredSpinner className="h-12 min-h-0" />
            ) : people.length === 0 ? (
              <p className="text-[0.8125rem] text-muted-foreground">
                No names available
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {people.map((person) => (
                  <div
                    key={person.clerkId}
                    className="min-w-0 text-[0.8125rem]"
                  >
                    <span className="block truncate font-semibold">
                      {personName(person)}
                    </span>
                    {person.displayName === undefined ? null : (
                      <span className="block truncate text-[0.75rem] text-faint">
                        @{person.handle}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
            {hidden > 0 ? (
              <p className="mt-1.5 text-[0.75rem] text-faint">
                {hidden} hidden or unavailable
              </p>
            ) : null}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
