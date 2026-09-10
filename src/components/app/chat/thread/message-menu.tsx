"use client";

import {
  ArrowUturnLeftIcon,
  EllipsisHorizontalIcon,
  FaceSmileIcon,
} from "@heroicons/react/24/outline";
import { useMutation } from "convex/react";
import { useState } from "react";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSubmenu,
  MenuSubmenuTrigger,
  MenuTrigger,
} from "@/components/ui/menu";
import { REACTIONS } from "@/lib/chat";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import type { ChatMessage } from "../../../../../convex/chat/messages";

/**
 * The two menus on a message: a row of reactions, and everything else.
 *
 * Both are controlled by the row rather than by themselves, because the bar
 * they sit in has to stay visible while either is open — Base UI keeps
 * measuring the trigger to place the popup, and a bar that fades the moment
 * the pointer leaves the message takes the anchor with it. See `MessageRow`
 * for the state; this is what is drawn from it.
 */

/** The small round well both triggers sit in. */
const TRIGGER =
  "flex size-5 items-center justify-center rounded-md text-faint hover:bg-foreground/[0.06] hover:text-foreground";

export function ReactionPicker({
  messageId,
  open,
  onOpenChange,
}: {
  messageId: Id<"messages">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const react = useMutation(api.chat.messages.react);

  return (
    <Menu open={open} onOpenChange={onOpenChange}>
      <MenuTrigger aria-label="React" className={TRIGGER}>
        <FaceSmileIcon className="size-4" />
      </MenuTrigger>
      <MenuContent align="end" padding="xs" className="flex gap-0.5">
        {REACTIONS.map((emoji) => (
          <MenuItem
            key={emoji}
            onClick={() => void react({ messageId, emoji })}
            className="size-8 justify-center px-0 py-0 text-[1rem]"
          >
            {emoji}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}

export function MessageMenu({
  message,
  mine,
  gone,
  bot,
  deletable,
  isAdmin,
  open,
  onOpenChange,
  onReply,
  onAdminError,
}: {
  message: ChatMessage;
  mine: boolean;
  /** Removed after reports; only an admin has anything left to do to it. */
  gone: boolean;
  bot: boolean;
  /** Still inside the window in which your own message may be unsent. */
  deletable: boolean;
  isAdmin: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReply: () => void;
  /** Said in the row's own bar, beside the time, rather than in the menu. */
  onAdminError: (message: string | null) => void;
}) {
  const remove = useMutation(api.chat.messages.remove);
  const adminRemove = useMutation(api.chat.admin.remove);
  const block = useMutation(api.chat.blocks.block);
  const [adminDeleting, setAdminDeleting] = useState(false);

  return (
    <Menu open={open} onOpenChange={onOpenChange}>
      <MenuTrigger aria-label="More" className={TRIGGER}>
        <EllipsisHorizontalIcon className="size-4" />
      </MenuTrigger>
      <MenuContent
        align="end"
        padding="xs"
        className="flex w-44 flex-col gap-0.5"
      >
        {mine || gone ? null : (
          <MenuItem onClick={onReply} className="gap-2">
            <ArrowUturnLeftIcon className="size-4 text-faint" />
            Reply
          </MenuItem>
        )}

        {isAdmin ? (
          <MenuItem
            tone="destructive"
            disabled={adminDeleting}
            onClick={async () => {
              onAdminError(null);
              setAdminDeleting(true);
              try {
                await adminRemove({ messageId: message._id });
              } catch {
                onAdminError(
                  "Could not delete this message. Please try again.",
                );
              } finally {
                setAdminDeleting(false);
              }
            }}
          >
            Admin delete
          </MenuItem>
        ) : null}

        {mine ? (
          deletable ? (
            <MenuItem
              tone="destructive"
              onClick={() => void remove({ messageId: message._id })}
            >
              Delete
            </MenuItem>
          ) : null
        ) : bot ? null : (
          <>
            <ReportSubmenu message={message} />

            <MenuItem
              tone="destructive"
              onClick={() => void block({ peerClerkId: message.authorClerkId })}
            >
              Block {message.authorHandle}
            </MenuItem>
          </>
        )}
      </MenuContent>
    </Menu>
  );
}

/** The reasons, in the order somebody scanning them would find theirs. */
const REPORT_REASONS = [
  ["harassment", "Aimed at someone"],
  ["abuse", "Hateful"],
  ["sexual", "Sexual"],
  ["self-harm", "About self-harm"],
  ["contact", "Asking for contact"],
  ["spam", "Spam"],
  ["other", "Something else"],
] as const;

/**
 * Reporting is not a message to anybody. It is weighted by the reporter's
 * own record and counted against a threshold — see `convex/chat/reports.ts`.
 * Saying so here would be a paragraph nobody reads; what the copy does
 * instead is avoid promising a review that is never going to happen.
 */
function ReportSubmenu({ message }: { message: ChatMessage }) {
  const report = useMutation(api.chat.reports.report);

  return (
    <MenuSubmenu>
      <MenuSubmenuTrigger>Report this</MenuSubmenuTrigger>
      <MenuContent
        side="right"
        align="start"
        sideOffset={4}
        padding="xs"
        className="flex w-40 flex-col gap-0.5"
      >
        {REPORT_REASONS.map(([reason, label]) => (
          <MenuItem
            key={reason}
            onClick={() =>
              void report({
                messageId: message._id,
                targetClerkId: message.authorClerkId,
                reason,
              })
            }
          >
            {label}
          </MenuItem>
        ))}
      </MenuContent>
    </MenuSubmenu>
  );
}
