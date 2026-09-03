"use client";

import { Popover } from "@base-ui/react/popover";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Monogram } from "@/components/app/chat/monogram";
import { RowMenu } from "@/components/app/chat/people-rows";
import { openDmError, personName } from "@/lib/chat";
import { CHAT_HREF } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { api } from "../../../../convex/_generated/api";

/**
 * A person, when their name is pressed.
 *
 * This is the one door to another person, and it opens from everywhere a
 * person is named: a message in the room, the header of a direct message, a
 * search result, a friend in the list. Before it, seeing somebody talk in the
 * room and wanting to write to them meant remembering their handle, opening a
 * panel, typing it into a search and pressing Add — four places for one
 * intention. Now it is their name.
 *
 * Message first, because it is what the card is for. It is a navigation when
 * the thread already exists and a call to `openDm` when it does not, and the
 * one refusal that matters — they only take messages from friends — is said as
 * the next thing to do rather than as a wall. Adding is the second button and
 * it is optional: a friendship is what opens a door somebody has kept shut,
 * not a toll on talking to somebody who has not.
 *
 * Blocking and unfriending are behind the ellipsis, for the same reason they
 * are behind it on a row: both are rare, both are irreversible in the sense
 * that matters, and neither should sit under a pointer that came to press
 * Message.
 *
 * The card's data is asked for only while it is open. A thread of forty
 * messages is forty of these, and forty subscriptions to profiles nobody has
 * pressed is what the old panel's cost was made of.
 */
export function PersonCard({
  person,
  children,
  className,
  side = "bottom",
  align = "start",
}: {
  person: {
    clerkId: string;
    handle: string;
    displayName?: string;
    avatarHue?: number;
    avatarEmoji?: string;
    avatarInitials?: string;
  };
  /** What is pressed to open it. */
  children: ReactNode;
  className?: string;
  side?: "top" | "bottom";
  align?: "start" | "center" | "end";
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label={`About ${personName(person)}`}
        className={className}
      >
        {children}
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Positioner
          side={side}
          align={align}
          sideOffset={8}
          collisionPadding={12}
          className="z-[60] outline-none"
        >
          <Popover.Popup
            className={cn(
              side === "bottom" ? "popup-drop" : "popup-slide",
              "w-[17rem] rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-lg shadow-black/[0.08] outline-none",
            )}
          >
            {open ? (
              <Body
                clerkId={person.clerkId}
                fallback={person}
                onClose={() => setOpen(false)}
              />
            ) : null}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function Body({
  clerkId,
  fallback,
  onClose,
}: {
  clerkId: string;
  /** What the trigger already knew, drawn while the card is on its way. */
  fallback: {
    handle: string;
    displayName?: string;
    avatarHue?: number;
    avatarEmoji?: string;
    avatarInitials?: string;
  };
  onClose: () => void;
}) {
  const router = useRouter();
  const card = useQuery(api.chat.profiles.card, { clerkId });

  const openDm = useMutation(api.chat.conversations.openDm);
  const request = useMutation(api.chat.friends.request);
  const accept = useMutation(api.chat.friends.accept);
  const remove = useMutation(api.chat.friends.remove);
  const block = useMutation(api.chat.blocks.block);
  const unblock = useMutation(api.chat.blocks.unblock);

  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const shown = card ?? fallback;
  const name = personName(shown);

  function go(conversationId: string) {
    onClose();
    router.push(`${CHAT_HREF}/${conversationId}`);
  }

  async function message() {
    if (card === undefined || card === null || busy) return;
    if (card.conversationId !== null) {
      go(card.conversationId);
      return;
    }
    setBusy(true);
    const result = await openDm({ peerClerkId: clerkId });
    setBusy(false);
    if (result.ok) go(result.conversationId);
    else setNotice(openDmError(result.reason));
  }

  async function add() {
    if (busy) return;
    setBusy(true);
    const result = await request({ peerClerkId: clerkId });
    setBusy(false);
    if (result.ok) return;
    setNotice(
      result.reason === "blocked"
        ? "You cannot add this person."
        : result.reason === "unknown" || result.reason === "no-profile"
          ? "That account is gone."
          : result.reason === "already"
            ? "You have already asked them."
            : "That did not work.",
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <Monogram
          handle={shown.handle}
          hue={shown.avatarHue}
          emoji={shown.avatarEmoji}
          initials={shown.avatarInitials}
          className="size-12 text-[1.125rem]"
        />
        <div className="min-w-0 flex-1">
          <Popover.Title
            render={<p />}
            className="truncate text-[0.9375rem] font-semibold"
          >
            {name}
          </Popover.Title>
          <p className="truncate text-[0.8125rem] text-muted-foreground">
            <span className="text-faint">@</span>
            {shown.handle}
          </p>
          {card === null || card === undefined ? null : (
            <p className="mt-0.5 text-[0.75rem] text-faint">
              {card.blocked
                ? "Blocked"
                : card.standing === "friends"
                  ? "Friends"
                  : card.standing === "sent"
                    ? "Request sent"
                    : card.standing === "waiting"
                      ? "Wants to be friends"
                      : null}
            </p>
          )}
        </div>
      </div>

      {card === undefined ? (
        <div className="flex justify-center py-4">
          <Spinner className="size-4 text-faint" />
        </div>
      ) : card === null ? (
        <p className="mt-3 text-[0.8125rem] leading-relaxed text-muted-foreground">
          This account is not available.
        </p>
      ) : (
        <>
          <div className="mt-3 flex items-center gap-1.5">
            <Button
              size="lg"
              className="flex-1 shadow-none hover:shadow-none"
              disabled={busy || card.blocked}
              onClick={() => void message()}
            >
              Message
            </Button>

            {card.standing === "none" && !card.blocked ? (
              <Button
                variant="outline"
                size="lg"
                className="flex-1"
                disabled={busy}
                onClick={() => void add()}
              >
                Add friend
              </Button>
            ) : card.standing === "waiting" ? (
              <Button
                variant="outline"
                size="lg"
                className="flex-1"
                disabled={busy}
                onClick={() => void accept({ peerClerkId: clerkId })}
              >
                Accept
              </Button>
            ) : null}

            <RowMenu
              label={`More for ${name}`}
              items={[
                ...(card.standing === "friends"
                  ? [
                      {
                        label: "Remove friend",
                        onClick: () => void remove({ peerClerkId: clerkId }),
                      },
                    ]
                  : card.standing === "sent"
                    ? [
                        {
                          label: "Cancel request",
                          onClick: () => void remove({ peerClerkId: clerkId }),
                        },
                      ]
                    : []),
                card.blocked
                  ? {
                      label: "Unblock",
                      onClick: () => void unblock({ peerClerkId: clerkId }),
                    }
                  : {
                      label: `Block ${shown.handle}`,
                      onClick: () => {
                        void block({ peerClerkId: clerkId });
                        onClose();
                      },
                      danger: true,
                    },
              ]}
            />
          </div>

          {/* Said before it is met, where it can be: somebody who only takes
              messages from friends is told so next to the Add button rather
              than after pressing Message. */}
          {notice !== null ? (
            <p role="status" className="mt-2 text-[0.8125rem] text-destructive">
              {notice}
            </p>
          ) : !card.canMessage &&
            !card.blocked &&
            card.conversationId === null ? (
            <p className="mt-2 text-[0.8125rem] leading-snug text-muted-foreground">
              {card.standing === "friends"
                ? "They are not taking messages right now."
                : "They only take messages from friends."}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
