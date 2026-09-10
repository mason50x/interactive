"use client";

import { Tooltip } from "@base-ui/react/tooltip";
import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { isChatAdmin } from "@config/chat-admin";
import {
  Tooltip as AdminTooltip,
  TooltipProvider,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { MentionText, resolverFor } from "@/components/app/chat/mentions";
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
import { DELETE_WINDOW_MS, isBot, personName } from "@/lib/chat";
import { cn } from "@/lib/utils";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { ChatMessage } from "@convex/chat/messages";

/**
 * One message in the thread.
 *
 * Yours on the right and everybody else's on the left, with the face and the
 * name only on theirs — the side is the whole of who said it. Messages close
 * together from the same person are one block: the face is drawn once, the
 * name once at the end, and the rows between sit tight. Everything that can
 * be done to a message hangs off the bar under it, which is always laid out
 * and only sometimes visible, so nothing moves under the pointer that
 * summoned it.
 */

/** Messages this close together from the same person are one block. */
const GROUP_WINDOW_MS = 5 * 60_000;

export function MessageRow({
  message,
  previous,
  next,
  mine,
  me,
  canAct,
  onReply,
  onJumpToMessage,
}: {
  message: ChatMessage;
  previous: ChatMessage | undefined;
  next?: ChatMessage;
  mine: boolean;
  /** The reader, for drawing a message that names them. */
  me: string | null | undefined;
  canAct: boolean;
  onReply: () => void;
  onJumpToMessage: (messageId: Id<"messages">) => void;
}) {
  const react = useMutation(api.chat.messages.react);
  const { isAdmin } = useChat();
  const [adminError, setAdminError] = useState<string | null>(null);

  // Held rather than left to `:hover`, because the bar below is the menu's
  // anchor. Base UI measures the trigger to place the popup and keeps
  // measuring it while it is open — so a bar that vanishes the moment the
  // pointer leaves the message takes the anchor with it, and the popup falls
  // back to the top-left corner of the viewport and sits there. Keeping the
  // bar mounted and visible for as long as either menu is open is the fix.
  const [reacting, setReacting] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const menuOpen = reacting || choosing;

  const grouped =
    previous !== undefined &&
    previous.authorClerkId === message.authorClerkId &&
    message._creationTime - previous._creationTime < GROUP_WINDOW_MS;
  const endsGroup =
    next === undefined ||
    next.authorClerkId !== message.authorClerkId ||
    next._creationTime - message._creationTime >= GROUP_WINDOW_MS;

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

  // Replying to yourself adds no conversational context. Once the delete
  // window closes, an own message therefore has nothing left in its menu.
  const choosable = isAdmin || !mine || deletable;

  const time = new Date(message._creationTime).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

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

  /** Somebody else said the reader's name in this one. */
  const named =
    !mine &&
    (message.mentionsEveryone ||
      message.mentions.some((mention) => mention.clerkId === me));

  return (
    <div
      id={`message-${message._id}`}
      data-message-id={message._id}
      onContextMenu={(event) => {
        if (!canAct || !choosable || (gone && !isAdmin)) return;
        event.preventDefault();
        setChoosing(true);
      }}
      className={cn(
        "group/message flex gap-2.5",
        // Yours on the right, everybody else's on the left — the side is the
        // whole of who said it, which is why yours carries no name or face.
        mine && "flex-row-reverse",
        grouped ? "mt-0.5" : "mt-3",
      )}
    >
      {mine ? null : grouped ? (
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
          "flex max-w-[min(32rem,78%)] min-w-0 flex-col",
          mine && "items-end",
        )}
      >
        {gone || message.replyTo === undefined ? null : (
          <ReplyPreview
            reply={message.replyTo}
            mine={mine}
            onJumpToMessage={onJumpToMessage}
          />
        )}

        {gone ? (
          <p className="rounded-3xl border border-border px-3.5 py-2 text-[0.9375rem] text-faint italic">
            Message removed after reports
          </p>
        ) : null}

        {/* Pictures above the words, the way a caption sits under a photo.
            A message may be pictures alone, in which case there is no bubble
            at all — a bubble with nothing in it would be a pause drawn as a
            box. */}
        {gone || message.images.length === 0 ? null : (
          <Pictures images={message.images} />
        )}

        {gone || message.body === "" ? null : (
          <p
            className={cn(
              "relative rounded-3xl px-3.5 py-2 text-[0.9375rem] leading-relaxed break-words whitespace-pre-wrap",
              message.images.length > 0 && "mt-1",
              mine
                ? "font-semibold text-primary-foreground"
                : "text-foreground",
            )}
          >
            {/* The bubble itself, behind the words rather than around them:
                an inset layer is the same rectangle the padding already
                described, and it is what carries the gradient and the rim —
                see `.bubble-mine` in `globals.css`. */}
            <span
              aria-hidden
              className={cn(
                "absolute inset-0 rounded-3xl border",
                mine
                  ? "bubble-mine bg-primary"
                  : "bubble-theirs bg-surface-muted",
                // The rim goes to the accent when it is about you. See
                // `.bubble-named` in `globals.css`.
                named && "bubble-named",
              )}
            />
            <span className="relative">
              <MentionText
                body={message.body}
                resolve={resolverFor(
                  message.mentions,
                  message.mentionsEveryone,
                )}
                me={me}
                mine={mine}
              />
            </span>
          </p>
        )}

        {message.reactions.length > 0 ? (
          <Tooltip.Provider delay={250} closeDelay={100}>
            <div
              className={cn("mt-1 flex flex-wrap gap-1", mine && "justify-end")}
            >
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
            </div>
          </Tooltip.Provider>
        ) : null}

        {/* Under the message, not over it — the bubble is the thing being
            read and it should start at the top of its own row. Always drawn,
            whether or not it has anything to say, because it is what the hover
            controls sit in: a line that appeared on hover would move the
            message out from under the pointer that summoned it. The row keeps
            its height for the same reason, so what is inside it can come and
            go without anything moving. */}
        <div
          className={cn(
            "mt-1 flex h-5 items-center gap-2 px-1",
            mine && "flex-row-reverse",
          )}
        >
          {mine || !endsGroup ? null : bot ? (
            <span className="truncate text-[0.75rem] font-normal text-muted-foreground">
              {personName(author)}
            </span>
          ) : (
            <PersonCard
              person={author}
              className="cursor-pointer truncate rounded text-[0.75rem] font-normal text-muted-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              {personName(author)}
            </PersonCard>
          )}

          {!mine && endsGroup && isChatAdmin(message.authorClerkId) ? (
            <TooltipProvider delay={250}>
              <AdminTooltip>
                <TooltipTrigger
                  aria-label="Admin with elevated privileges"
                  className="-ml-1 inline-flex shrink-0 items-center rounded-sm text-yellow-500 outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                >
                  <svg
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="size-3.5"
                    aria-hidden="true"
                  >
                    <path d="M3.5 14 2 5.5 6.5 9 10 3l3.5 6L18 5.5 16.5 14h-13Zm0 1.5h13V17h-13v-1.5Z" />
                  </svg>
                </TooltipTrigger>
                <TooltipContent>Admin with elevated privileges</TooltipContent>
              </AdminTooltip>
            </TooltipProvider>
          ) : null}

          {/* Every message, not just the grouped ones. A column of times down
              the edge of the thread is a lot of ink for something nobody reads
              until they want to know when — so on a screen with a pointer it
              waits to be asked, and comes up with the controls it shares the
              row with. On a touch screen there is no hover to ask with, so it
              is simply there. It stays up while either menu is open for the
              same reason they do: the pointer has left the message to go to
              the popup. */}
          <span
            className={cn(
              "text-[0.6875rem] text-faint transition-opacity duration-150",
              menuOpen
                ? "opacity-100"
                : "opacity-0 group-focus-within/message:opacity-100 group-hover/message:opacity-100 pointer-coarse:opacity-100",
            )}
          >
            {time}
          </span>

          {adminError ? (
            <span role="alert" className="text-xs text-destructive">
              {adminError}
            </span>
          ) : null}
          {(gone && !isAdmin) || !canAct ? null : (
            <div
              className={cn(
                // `opacity` and not `display`: a `display: none` element has no
                // box, and no box means no anchor for the popup that is measuring
                // it. This one is always laid out and merely invisible.
                "flex items-center gap-0.5 transition-opacity duration-150",
                menuOpen
                  ? "opacity-100"
                  : "opacity-0 group-hover/message:pointer-events-auto group-hover/message:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100 pointer-coarse:pointer-events-auto pointer-coarse:opacity-100",
                !menuOpen && "pointer-events-none",
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
                  bot={bot}
                  deletable={deletable}
                  isAdmin={isAdmin}
                  open={choosing}
                  onOpenChange={setChoosing}
                  onReply={onReply}
                  onAdminError={setAdminError}
                />
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
