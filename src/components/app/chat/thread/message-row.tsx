"use client";

import { StaffBadge } from "@/components/ui/staff-badge";

import { Tooltip } from "@base-ui/react/tooltip";
import { useMutation } from "convex/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Tooltip as AdminTooltip,
  TooltipProvider,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { MessageText } from "@/components/app/chat/thread/message-text";
import { MessagePoll } from "@/components/app/chat/thread/message-poll";
import { messagesConnect } from "@/lib/chat-grouping";
import { Monogram } from "@/components/app/chat/monogram";
import { PersonCard } from "@/components/app/chat/person-card";
import {
  MessageMenu,
  ReactionPicker,
} from "@/components/app/chat/thread/message-menu";
import { Pictures } from "@/components/app/chat/thread/pictures";
import { ReactionPill } from "@/components/app/chat/thread/reaction-pill";
import { ReplyPreview } from "@/components/app/chat/thread/reply-preview";
import { useChat } from "@/components/app/chat/chat-provider";
import {
  DELETE_WINDOW_MS,
  EDIT_WINDOW_MS,
  isBot,
  personName,
} from "@/lib/chat";
import { cn } from "@/lib/utils";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { ChatMessage } from "@convex/chat/messages";

/** Consecutive text messages share their near-side corners and a 2px gap. */
export function MessageRow({
  message,
  previous,
  next,
  mine,
  me,
  canAct,
  plainMentions = false,
  onReply,
  onEdit,
  highlighted = false,
  seen = false,
  onJumpToMessage,
}: {
  message: ChatMessage;
  previous: ChatMessage | undefined;
  next?: ChatMessage;
  mine: boolean;
  /** The reader, for drawing a message that names them. */
  me: string | null | undefined;
  canAct: boolean;
  /** A DM: `@words` are plain text, drawn with no chips and no highlight. */
  plainMentions?: boolean;
  onReply: () => void;
  onEdit?: () => void;
  highlighted?: boolean;
  /** The other participant has read this newest outgoing DM message. */
  seen?: boolean;
  onJumpToMessage: (messageId: Id<"messages">) => void;
}) {
  const react = useMutation(api.chat.messages.react);
  const { isAdmin, staffRoles } = useChat();
  const staffRole = staffRoles.find(
    (entry) => entry.clerkId === message.authorClerkId && !entry.hideBadge,
  )?.role;
  const [adminError, setAdminError] = useState<string | null>(null);

  const [reacting, setReacting] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const menuOpen = reacting || choosing;
  const hasReactions = message.reactions.length > 0;
  const reactionContent = useRef<HTMLDivElement>(null);
  const [reactionHeight, setReactionHeight] = useState<number>();

  useLayoutEffect(() => {
    const content = reactionContent.current;
    if (content) setReactionHeight(content.getBoundingClientRect().height);
  }, [message.reactions]);

  useEffect(() => {
    const content = reactionContent.current;
    if (!content || !hasReactions) return;
    const observer = new ResizeObserver(() => {
      setReactionHeight(content.getBoundingClientRect().height);
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [hasReactions]);

  const grouped = messagesConnect(previous, message);
  const showAuthor =
    previous?.authorClerkId !== message.authorClerkId ||
    new Date(previous._creationTime).toDateString() !==
      new Date(message._creationTime).toDateString();
  const joinsNext = messagesConnect(message, next);
  const showTail = !joinsNext && (mine || message.replyTo !== undefined);
  const corners = cn(
    "rounded-3xl",
    grouped && (mine ? "rounded-tr-md" : "rounded-tl-md"),
    joinsNext && (mine ? "rounded-br-md" : "rounded-bl-md"),
    showTail && (mine ? "rounded-br-lg" : "rounded-bl-lg"),
  );
  const gone = message.status !== "visible";
  const bot = isBot(message.authorClerkId);

  /**
   * Whether this is still yours to unsend.
   *
   * Held in state rather than read from the clock at render, because nothing
   * else would re-render this row at the moment the window shuts — the message
   * has not changed and Convex has nothing to push. The timer is the render.
   */
  const [deletable, setDeletable] = useState(
    () => mine && Date.now() - message._creationTime < DELETE_WINDOW_MS,
  );

  useEffect(() => {
    if (!deletable) return;
    const left = message._creationTime + DELETE_WINDOW_MS - Date.now();
    const timer = setTimeout(() => setDeletable(false), Math.max(0, left));
    return () => clearTimeout(timer);
  }, [deletable, message._creationTime]);

  const [withinEditWindow, setWithinEditWindow] = useState(
    () => Date.now() - message._creationTime < EDIT_WINDOW_MS,
  );
  useEffect(() => {
    if (!withinEditWindow) return;
    const timer = setTimeout(
      () => setWithinEditWindow(false),
      Math.max(0, message._creationTime + EDIT_WINDOW_MS - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [withinEditWindow, message._creationTime]);
  const editable =
    mine && !gone && !message.poll && withinEditWindow && onEdit !== undefined;
  const choosable = isAdmin || !mine || deletable || editable;

  /** Who said it, as the card that opens when they are pressed. */
  const author = {
    clerkId: message.authorClerkId,
    handle: message.authorHandle,
    displayName: message.authorName,
    avatarUrl: message.authorAvatarUrl,
    avatarHue: message.authorAvatarHue,
    avatarEmoji: message.authorAvatarEmoji,
    avatarInitials: message.authorAvatarInitials,
  };

  /** Somebody else said the reader's name in this one. Never in a DM, where `@words` are plain text. */
  const named =
    !mine &&
    !plainMentions &&
    (message.mentionsEveryone ||
      message.mentions.some((mention) => mention.clerkId === me));

  const actions =
    (gone && !isAdmin) || !canAct ? null : (
      <div
        className={cn(
          "flex shrink-0 items-center gap-0.5 transition-opacity duration-150",
          !menuOpen &&
            "pointer-events-none opacity-0 group-focus-within/message:pointer-events-auto group-focus-within/message:opacity-100 group-hover/message:pointer-events-auto group-hover/message:opacity-100 pointer-coarse:pointer-events-auto pointer-coarse:opacity-100",
        )}
      >
        <ReactionPicker
          messageId={message._id}
          open={reacting}
          onOpenChange={setReacting}
        />
        {choosable ? (
          <MessageMenu
            message={message}
            mine={mine}
            gone={gone}
            deletable={deletable}
            editable={editable}
            onEdit={onEdit}
            isAdmin={isAdmin}
            open={choosing}
            onOpenChange={setChoosing}
            onReply={onReply}
            onAdminError={setAdminError}
          />
        ) : null}
      </div>
    );

  return (
    <div
      id={`message-${message._id}`}
      data-message-id={message._id}
      data-highlighted={highlighted || undefined}
      className={cn(
        "group/message flex items-start gap-2",
        mine && "flex-row-reverse",
        grouped ? "mt-0.5" : "mt-4",
      )}
      onContextMenu={(event) => {
        if (!canAct || !choosable || (gone && !isAdmin)) return;
        event.preventDefault();
        setChoosing(true);
      }}
    >
      {mine ? null : !showAuthor ? (
        <span className="w-8 shrink-0" />
      ) : bot ? (
        <span className="shrink-0 self-start">
          <Monogram
            handle={message.authorHandle}
            imageUrl={message.authorAvatarUrl}
            hue={message.authorAvatarHue}
            emoji={message.authorAvatarEmoji}
            initials={message.authorAvatarInitials}
          />
        </span>
      ) : (
        <PersonCard
          person={author}
          className="shrink-0 cursor-pointer self-start rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Monogram
            handle={message.authorHandle}
            imageUrl={message.authorAvatarUrl}
            hue={message.authorAvatarHue}
            emoji={message.authorAvatarEmoji}
            initials={message.authorAvatarInitials}
          />
        </PersonCard>
      )}

      <div
        className={cn(
          "flex max-w-[min(32rem,calc(100%-6rem))] min-w-0 flex-col",
          mine && "max-w-[min(32rem,calc(100%-3.5rem))] items-end",
          highlighted &&
            !message.body &&
            "rounded-3xl ring-2 ring-primary ring-offset-2 ring-offset-background",
        )}
      >
        {!mine && showAuthor ? (
          <div className="mb-1 flex min-h-6 max-w-full items-center gap-1 px-1">
            {staffRole ? (
              <TooltipProvider delay={250}>
                <AdminTooltip>
                  <TooltipTrigger
                    aria-label={
                      staffRole === "ceo"
                        ? "CEO"
                        : staffRole === "head_moderator"
                          ? "Head Moderator"
                          : staffRole === "builder"
                            ? "Builder"
                            : "Moderator"
                    }
                    className="-mr-1 inline-flex shrink-0 items-center rounded-sm text-orange-600 outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                  >
                    <StaffBadge role={staffRole} />
                  </TooltipTrigger>
                  <TooltipContent>
                    {staffRole === "ceo"
                      ? "CEO"
                      : staffRole === "head_moderator"
                        ? "Head Moderator"
                        : staffRole === "builder"
                          ? "Builder"
                          : "Moderator"}
                  </TooltipContent>
                </AdminTooltip>
              </TooltipProvider>
            ) : null}

            {bot ? (
              <span className="min-w-0 truncate text-[0.75rem] font-normal text-muted-foreground">
                {personName(author)}
              </span>
            ) : (
              <PersonCard
                person={author}
                className="min-w-0 cursor-pointer truncate rounded text-[0.75rem] font-normal text-muted-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                {personName(author)}
              </PersonCard>
            )}
          </div>
        ) : null}

        {gone || message.replyTo === undefined ? null : (
          <ReplyPreview
            reply={message.replyTo}
            mine={mine}
            onJumpToMessage={onJumpToMessage}
          />
        )}

        {gone ? (
          <p className="rounded-3xl border border-border px-3.5 py-2 text-[0.9375rem] text-faint italic">
            Message removed
          </p>
        ) : null}

        {/* Pictures above the words, the way a caption sits under a photo.
            A message may be pictures alone, in which case there is no bubble
            at all — a bubble with nothing in it would be a pause drawn as a
            box. */}
        {gone || message.images.length === 0 ? null : (
          <Pictures images={message.images} />
        )}

        {gone || (message.body === "" && !message.poll) ? null : (
          <div
            className={cn(
              "relative max-w-full px-3.5 py-2 text-[0.9375rem] leading-relaxed break-words",
              corners,
              highlighted &&
                "ring-2 ring-primary ring-offset-2 ring-offset-background",
              message.images.length > 0 && "mt-1",
              mine
                ? "font-semibold text-primary-foreground"
                : "text-foreground",
            )}
          >
            {/* The bubble's solid fill and final-message tail sit behind the text. */}
            <span
              aria-hidden
              className={cn(
                "absolute inset-0 rounded-[inherit]",
                mine ? "bubble-mine" : "bubble-theirs",
                // The fill gets a subtle accent when it is about you. See
                // `.bubble-named` in `globals.css`.
                named && "bubble-named",
              )}
            >
              {showTail && (
                <svg
                  viewBox="0 0 24 14"
                  className={cn(
                    "bubble-tail pointer-events-none absolute -bottom-[2px] h-[7px] w-3",
                    mine ? "-right-1.5" : "-left-1.5 -scale-x-100",
                  )}
                >
                  <path
                    d="M0 0h10c0 5.5 4 10 11 11.2 2.2.4 3 1.1 2.3 2-.7.9-2.3 1-3.8.7C10 13 3 9.5 0 4Z"
                    stroke="var(--bubble-fill)"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </span>
            <div className="relative">
              <MessageText
                message={message}
                me={me}
                mine={mine}
                plainMentions={plainMentions}
              />
              {message.poll ? (
                <MessagePoll
                  messageId={message._id}
                  poll={message.poll}
                  canAct={canAct}
                  mine={mine}
                />
              ) : null}
              {message.editedAt ? (
                <span
                  title={`Edited ${new Date(message.editedAt).toLocaleString()}`}
                  className="mt-0.5 block text-[0.625rem] font-normal opacity-60"
                >
                  edited
                </span>
              ) : null}
            </div>
          </div>
        )}
        <div
          data-slot="message-reactions"
          className="overflow-hidden transition-[height,opacity] duration-300 ease-out motion-reduce:transition-none"
          style={{
            height: reactionHeight,
            opacity: hasReactions ? 1 : 0,
          }}
        >
          <div
            ref={reactionContent}
            className={cn(
              "flex flex-wrap gap-1",
              mine && "justify-end",
              hasReactions && "pt-1",
            )}
          >
            {hasReactions ? (
              <Tooltip.Provider delay={250} closeDelay={100}>
                {message.reactions.map((reaction) => (
                  <ReactionPill
                    key={reaction.emoji}
                    messageId={message._id}
                    reaction={reaction}
                    canAct={canAct}
                    onReact={() =>
                      void react({
                        messageId: message._id,
                        emoji: reaction.emoji,
                      })
                    }
                  />
                ))}
              </Tooltip.Provider>
            ) : null}
          </div>
        </div>

        {seen ? (
          <span className="mt-1 px-1 text-[0.6875rem] leading-none text-muted-foreground">
            Seen
          </span>
        ) : null}

        {adminError ? (
          <p role="alert" className="mt-1 text-xs text-destructive">
            {adminError}
          </p>
        ) : null}
      </div>
      {!mine && actions ? (
        <div className="flex shrink-0 items-center self-start">{actions}</div>
      ) : null}
      {mine && actions ? (
        <div className="flex w-[3.25rem] shrink-0 items-center self-center">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
