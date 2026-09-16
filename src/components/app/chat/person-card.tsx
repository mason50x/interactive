"use client";

import { Popover } from "@base-ui/react/popover";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Monogram } from "@/components/app/chat/monogram";
import { isBot, openDmError, personName } from "@/lib/chat";
import { CHAT_HREF } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { api } from "@convex/_generated/api";
import { FieldError } from "@/components/ui/alert";
import { popupVariants } from "@/components/ui/popup";

/** Clerk account details, with a direct message action. */
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
    avatarUrl?: string;
  };
  /** What is pressed to open it. */
  children: ReactNode;
  className?: string;
  side?: "top" | "bottom";
  align?: "start" | "center" | "end";
}) {
  const [open, setOpen] = useState(false);

  if (isBot(person.clerkId))
    return <div className={cn(className, "cursor-default")}>{children}</div>;

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
              popupVariants({
                motion: side === "bottom" ? "drop" : "slide",
                padding: "lg",
              }),
              "w-[17rem]",
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
    avatarUrl?: string;
  };
  onClose: () => void;
}) {
  const router = useRouter();
  const card = useQuery(api.chat.accounts.card, { clerkId });

  const openDm = useMutation(api.chat.conversations.openDm);
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

  return (
    <div>
      <div className="flex items-center gap-3">
        <Monogram
          handle={shown.handle}
          imageUrl={shown.avatarUrl}
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
              disabled={busy}
              onClick={() => void message()}
            >
              Message
            </Button>
          </div>

          {notice !== null ? (
            <FieldError role="status">{notice}</FieldError>
          ) : null}
        </>
      )}
    </div>
  );
}
