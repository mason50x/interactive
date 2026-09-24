"use client";

import {
  ArrowUturnLeftIcon,
  EllipsisHorizontalIcon,
  TrashIcon as OutlineTrashIcon,
} from "@heroicons/react/24/outline";
import {
  FaceSmileIcon,
  TrashIcon as SolidTrashIcon,
} from "@heroicons/react/24/solid";
import { useMutation } from "convex/react";
import { useState } from "react";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { REACTIONS } from "@/lib/chat";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { ChatMessage } from "@convex/chat/messages";

/**
 * The two menus on a message: a row of reactions, and everything else.
 *
 * Both are controlled by the row so context-click can open the same menu.
 */

/** The small round well both triggers sit in. */
const TRIGGER =
  "flex size-6 items-center justify-center rounded-md text-faint hover:bg-foreground/[0.06] hover:text-foreground";

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
      <MenuContent
        align="end"
        motion="none"
        padding="xs"
        className="reaction-picker grid grid-cols-6 gap-0.5"
      >
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
  deletable,
  editable = false,
  onEdit,
  isAdmin,
  open,
  onOpenChange,
  onReply,
  onAdminError,
}: {
  message: ChatMessage;
  mine: boolean;
  /** Legacy hidden message; only an admin has anything left to do to it. */
  gone: boolean;
  /** Still inside the window in which your own message may be unsent. */
  deletable: boolean;
  editable?: boolean;
  onEdit?: () => void;
  isAdmin: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReply: () => void;
  /** Said below the message, rather than in the menu. */
  onAdminError: (message: string | null) => void;
}) {
  const remove = useMutation(api.chat.messages.remove);
  const adminRemove = useMutation(api.chat.admin.remove);
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
        {editable ? <MenuItem onClick={onEdit}>Edit message</MenuItem> : null}
        {mine || gone ? null : (
          <MenuItem onClick={onReply} className="gap-2">
            <ArrowUturnLeftIcon className="size-4" />
            Reply
          </MenuItem>
        )}

        {isAdmin ? (
          <MenuItem
            tone="destructive"
            className="gap-2"
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
            <OutlineTrashIcon className="size-4" />
            Mod Delete
          </MenuItem>
        ) : null}

        {mine ? (
          deletable ? (
            <MenuItem
              tone="destructive"
              className="gap-2"
              onClick={() => void remove({ messageId: message._id })}
            >
              <SolidTrashIcon className="size-4" />
              Delete
            </MenuItem>
          ) : null
        ) : null}
      </MenuContent>
    </Menu>
  );
}
