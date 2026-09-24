"use client";

import { useAuth } from "@clerk/nextjs";
import { PhotoIcon } from "@heroicons/react/24/outline";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { type MentionPerson } from "@/components/app/chat/mentions";
import {
  Composer,
  type ComposerHandle,
} from "@/components/app/chat/thread/composer";
import {
  DayPager,
  dayBounds,
  useDayClock,
} from "@/components/app/chat/thread/day-pager";
import { MessageRow } from "@/components/app/chat/thread/message-row";
import { Outside } from "@/components/app/chat/thread/outside";
import { Quiet } from "@/components/app/chat/thread/quiet";
import { replyFromMessage } from "@/components/app/chat/thread/reply-preview";
import { ThreadHeader } from "@/components/app/chat/thread/thread-header";
import { useDropFiles } from "@/components/app/chat/thread/use-drop-files";
import { Typing, useTypists } from "@/components/app/chat/typing";
import { useChat } from "@/components/app/chat/chat-provider";
import type { Refusal } from "@/lib/chat";
import { CHAT_HREF } from "@/lib/nav";
import { useOutbox } from "@/components/app/chat/thread/use-outbox";
import type { ChatPollDraft } from "@/lib/chat-drafts";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type {
  ChatImage,
  ChatMention,
  ChatMessage,
} from "@convex/chat/messages";

export type { ComposerHandle };

const subscribeVisibility = (notify: () => void) => {
  document.addEventListener("visibilitychange", notify);
  window.addEventListener("focus", notify);
  window.addEventListener("blur", notify);
  return () => {
    document.removeEventListener("visibilitychange", notify);
    window.removeEventListener("focus", notify);
    window.removeEventListener("blur", notify);
  };
};
const isVisible = () =>
  document.visibilityState === "visible" && document.hasFocus();

/** One timeline per day, with message anchors and this account's durable outbox. */
export function Thread({
  conversationId,
}: {
  conversationId: Id<"conversations">;
}) {
  const { userId } = useAuth();
  // Next may preserve a client component while only its dynamic route param
  // changes. The key makes a conversation's day page part of that
  // conversation, so opening another one always starts live rather than on the
  // archive page the previous room was left on.
  return (
    <ConversationThread
      key={`${userId ?? "loading"}:${conversationId}`}
      conversationId={conversationId}
    />
  );
}

function ConversationThread({
  conversationId,
}: {
  conversationId: Id<"conversations">;
}) {
  const { userId } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const explicitTarget = params.get("message");
  const visible = useSyncExternalStore(
    subscribeVisibility,
    isVisible,
    () => true,
  );
  const [resumeUnread, setResumeUnread] = useState(true);
  const [initialRead, setInitialRead] = useState<
    FunctionReturnType<typeof api.chat.conversations.readPosition> | undefined
  >(undefined);
  const readPosition = useQuery(
    api.chat.conversations.readPosition,
    initialRead === undefined ? { conversationId } : "skip",
  );
  if (initialRead === undefined && readPosition !== undefined)
    setInitialRead(readPosition);
  const outbox = useOutbox(userId, conversationId);
  const {
    profile,
    isAdmin,
    staffRoles,
    serverConversations,
    setReading,
    isReadSuppressed,
    images: pictures,
  } = useChat();
  const detail = useQuery(api.chat.conversations.get, { conversationId });
  const daily = detail?.kind === "global" || detail?.kind === "announcements";

  /**
   * Everyone is a sequence of local calendar days rather than one endless
   * room. Zero is the live day; positive numbers walk backwards through its
   * retained history. The day clock advances an open tab across midnight.
   */
  const now = useDayClock();
  const [selectedDaysAgo, setDaysAgo] = useState(0);

  const requestedTarget =
    explicitTarget ??
    (resumeUnread &&
    initialRead?.firstUnreadAt != null &&
    (!daily || initialRead.firstUnreadAt >= dayBounds(now, 0).start)
      ? initialRead.firstUnreadId
      : null);
  const location = useQuery(
    api.chat.messages.location,
    requestedTarget ? { messageId: requestedTarget, conversationId } : "skip",
  );
  const target = location === null ? null : requestedTarget;

  const calendarDay = (timestamp: number) => {
    const date = new Date(timestamp);
    return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  };
  const daysAgo =
    explicitTarget && location && daily
      ? Math.max(
          0,
          Math.round(
            (calendarDay(now) - calendarDay(location.createdAt)) / 86_400_000,
          ),
        )
      : selectedDaysAgo;
  const day = dayBounds(now, daysAgo);
  const { results, status, loadMore } = usePaginatedQuery(
    api.chat.messages.list,
    { conversationId, dayStart: day.start, dayEnd: day.end },
    { initialNumItems: 40 },
  );

  useEffect(() => {
    if (!target || results.some((message) => message._id === target)) return;
    const at = location?.createdAt ?? initialRead?.firstUnreadAt;
    if (at == null || (daily && (at < day.start || at >= day.end))) return;
    if (status === "CanLoadMore") loadMore(40);
  }, [
    target,
    results,
    location,
    initialRead,
    daily,
    day.start,
    day.end,
    status,
    loadMore,
  ]);

  const markRead = useMutation(
    api.chat.conversations.markRead,
  ).withOptimisticUpdate((store, { conversationId: id, throughMessageId }) => {
    const rows = store.getQuery(api.chat.conversations.list, {});
    if (!rows) return;
    store.setQuery(
      api.chat.conversations.list,
      {},
      rows.map((row) =>
        row._id === id &&
        (!throughMessageId || row.latestMessage?._id === throughMessageId)
          ? {
              ...row,
              unread: 0,
              mentioned: false,
              firstUnreadMessageId: undefined,
              lastReadAt: Math.max(
                row.lastReadAt,
                row.latestMessage?._creationTime ?? 0,
              ),
            }
          : row,
      ),
    );
  });
  const [readRetry, setReadRetry] = useState(0);
  const welcomeBot = useMutation(api.chat.bot.welcome);
  const edit = useMutation(api.chat.messages.edit);
  const newest = results.find((message) => message.status === "visible")?._id;

  /** Who else is writing in here. See `typing.tsx`. */
  const typists = useTypists(conversationId);

  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const pendingMessages: ChatMessage[] = outbox.entries.map((entry) => ({
    _id: entry.nonce as Id<"messages">,
    _creationTime: entry.createdAt,
    authorClerkId: userId ?? "",
    authorHandle: profile?.handle ?? "",
    authorName: profile?.displayName,
    authorAvatarUrl: profile?.avatarUrl,
    body: entry.body,
    replyTo: entry.replyTo ? replyFromMessage(entry.replyTo) : undefined,
    mentions: entry.mentions,
    mentionsEveryone: entry.everyone,
    status: "visible",
    reactions: [],
    images: entry.images,
    poll: entry.poll
      ? {
          options: entry.poll.options.map((text) => ({ text, votes: 0 })),
          myVote: null,
          totalVotes: 0,
        }
      : undefined,
  }));

  /** The message named above the composer and attached to the next send. */
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);

  const scroller = useRef<HTMLDivElement>(null);

  /** Whether the reader is at the live end. See the note above. */
  const pinned = useRef(true);
  const focusedMessage = useRef<string | null>(null);

  /**
   * The composer, reached for by the drop handlers below.
   *
   * A picture can be dropped anywhere on the thread, not only on the box at
   * the bottom of it — the thread is the thing you are adding to — but the
   * box is where the picture has to end up, and its tray is state the box
   * owns. An imperative handle is the smallest way across that gap: the
   * thread hands over files, the composer does what it does with a paste.
   */
  const composer = useRef<ComposerHandle>(null);

  const canPostAnnouncements = isAdmin || staffRoles.some(
    ({ clerkId, role }) => clerkId === profile?.clerkId && role === "builder",
  );
  const readOnly = detail?.kind === "announcements" && !canPostAnnouncements;
  const archived = daily && daysAgo > 0;
  const { dragging, handlers: dropHandlers } = useDropFiles({
    enabled: pictures && !archived && !readOnly,
    onFiles: (files) => composer.current?.addFiles(files),
  });

  function returnLatest() {
    setResumeUnread(false);
    setDaysAgo(0);
    pinned.current = true;
    if (explicitTarget)
      router.replace(`${CHAT_HREF}/${conversationId}`, { scroll: false });
  }

  async function submit(
    text: string,
    attachmentIds: Id<"attachments">[],
    previews: ChatImage[],
    replyTo: ChatMessage | null,
    mentions: ChatMention[],
    everyone: boolean,
    poll?: ChatPollDraft,
  ): Promise<Refusal | null> {
    if (!profile || !userId) throw new Error("Your account is still loading.");
    outbox.enqueue({
      body: text,
      attachmentIds,
      images: previews,
      replyTo,
      mentions,
      everyone,
      poll,
    });
    setReplyingTo(null);
    returnLatest();
    return null;
  }

  function jumpToMessage(messageId: Id<"messages">) {
    setResumeUnread(false);
    pinned.current = false;
    router.replace(
      `${CHAT_HREF}/${conversationId}?message=${encodeURIComponent(messageId)}`,
      { scroll: false },
    );
  }

  /** An open, visible conversation is being read, regardless of scroll position. */
  useEffect(() => {
    if (!visible || !detail) return;
    setReading(conversationId);
    return () =>
      setReading((current) => (current === conversationId ? null : current));
  }, [conversationId, detail, setReading, visible]);

  /** Only write when the server still has unread messages. */
  const isBotDm = detail?.kind === "dm" && detail.peerClerkId === "bot";

  useEffect(() => {
    if (isBotDm) void welcomeBot({ conversationId });
  }, [conversationId, isBotDm, welcomeBot]);

  const openConversation = serverConversations.find(
    (conversation) => conversation._id === conversationId,
  );
  const unread = (openConversation?.unread ?? 0) > 0;
  const latestMessageId = openConversation?.latestMessage?._id;

  useEffect(() => {
    // Save the initial unread anchor before advancing the cursor. Reading is
    // conversation-wide: jumping to that anchor or an older day must not
    // require scrolling to the bottom or sending a reply to clear the badge.
    if (!visible || !detail || initialRead === undefined) return;
    if (!unread || !latestMessageId) return;
    const acknowledge = () => {
      // A manual reminder suspends reading until navigation leaves this thread.
      if (!isVisible() || isReadSuppressed(conversationId)) return;
      void markRead({
        conversationId,
        throughMessageId: latestMessageId,
      }).catch(() => setReadRetry((attempt) => attempt + 1));
    };
    if (!readRetry) {
      acknowledge();
      return;
    }
    const timer = setTimeout(acknowledge, 1500);
    return () => clearTimeout(timer);
  }, [
    conversationId,
    detail,
    initialRead,
    visible,
    unread,
    latestMessageId,
    readRetry,
    markRead,
    isReadSuppressed,
  ]);

  useLayoutEffect(() => {
    if (target) {
      if (focusedMessage.current === target) return;
      pinned.current = false;
      const message = document.getElementById(`message-${target}`);
      if (message) {
        message.scrollIntoView({ block: "center" });
        focusedMessage.current = target;
        const box = scroller.current;
        const atEnd =
          !!box && box.scrollHeight - box.scrollTop - box.clientHeight < 64;
        pinned.current = atEnd;
      }
    } else {
      if (focusedMessage.current !== null) pinned.current = true;
      focusedMessage.current = null;
      if (scroller.current && pinned.current) {
        scroller.current.scrollTop = scroller.current.scrollHeight;
      }
    }
  }, [target, conversationId, daysAgo, results]);

  useLayoutEffect(() => {
    const element = scroller.current;
    if (
      element &&
      pinned.current &&
      (!target || focusedMessage.current === target)
    )
      element.scrollTop = element.scrollHeight;
  }, [conversationId, daysAgo, newest, outbox.entries, results.length, target]);

  /**
   * The thread, watched for changing size after the effect above has run.
   *
   * That effect runs once per new message, before the first paint — and a
   * long thread keeps moving after that paint. The web font swaps in and
   * every line of text reflows a little taller. The header and the composer
   * mount once the conversation's detail arrives, and the pane between them
   * shrinks by their height. The typing row grows in over a few hundred
   * milliseconds. Each of those left a pinned reader a little short of the
   * end, and in a long enough thread the shortfall was an inch of screen
   * they had to scroll by hand.
   *
   * So the pane and everything in it are observed, and every frame any of
   * them changes size a pinned reader is moved back to the end. Unpinned
   * readers are left where they are, exactly as they are for a new message.
   * Children come and go as messages arrive, so the list of what is watched
   * is refreshed whenever the pane's children change.
   */
  const outside = detail === null;

  useEffect(() => {
    const box = scroller.current;
    if (box === null) return;
    const settle = () => {
      if (pinned.current) box.scrollTop = box.scrollHeight;
    };
    const sizes = new ResizeObserver(settle);
    sizes.observe(box);
    const watch = () => {
      for (const child of box.children) sizes.observe(child);
    };
    watch();
    const children = new MutationObserver(watch);
    children.observe(box, { childList: true });
    return () => {
      sizes.disconnect();
      children.disconnect();
    };
  }, [outside]);

  /**
   * Oldest first, for reading. A copy, because `results` is Convex's own array
   * and reversing it in place would reorder the store the query reads from.
   */
  const ordered = [...results].reverse();

  /**
   * Whoever has spoken in what is loaded, newest first, for the composer to
   * offer when `@` is pressed. Built from the page rather than asked for:
   * the people who just said something are already here, with the handle
   * and name they said it under, and they are who a mention is nearly
   * always of. See `useMentionPeople` for the rest of the list.
   */
  const authors = useMemo(() => {
    const seen = new Set<string>();
    const list: MentionPerson[] = [];
    for (const message of results) {
      if (seen.has(message.authorClerkId)) continue;
      seen.add(message.authorClerkId);
      list.push({
        clerkId: message.authorClerkId,
        handle: message.authorHandle,
        displayName: message.authorName,
        avatarUrl: message.authorAvatarUrl,
        avatarHue: message.authorAvatarHue,
        avatarEmoji: message.authorAvatarEmoji,
        avatarInitials: message.authorAvatarInitials,
      });
    }
    return list;
  }, [results]);

  /** A direct message's other person, who is the whole of its list. */
  const peer: MentionPerson | null =
    detail !== undefined &&
    detail !== null &&
    detail.kind === "dm" &&
    detail.peerClerkId !== undefined &&
    detail.peerHandle !== undefined
      ? {
          clerkId: detail.peerClerkId,
          handle: detail.peerHandle,
          displayName: detail.peerName,
          avatarUrl: detail.peerAvatarUrl,
          avatarHue: detail.peerAvatarHue,
          avatarEmoji: detail.peerAvatarEmoji,
          avatarInitials: detail.peerAvatarInitials,
        }
      : null;

  function onScroll() {
    const element = scroller.current;
    if (element === null) return;
    // A little slack, so a reader a line or two off the end still counts as at
    // it — and so sub-pixel scroll heights never leave the thread unpinned.
    const atEnd =
      element.scrollHeight - element.scrollTop - element.clientHeight < 64;
    pinned.current = atEnd;
  }

  // Not a member — which is sometimes a door rather than a wall. See `Outside`.
  if (detail === null) return <Outside conversationId={conversationId} />;

  const live = !daily || daysAgo === 0;

  // A direct message is two people. `@words` in one are the plain text they
  // were typed as — no chips, no "mentioned you" rim — however old the row.
  const plainMentions = detail?.kind === "dm";

  return (
    <div
      // `min-w-0`: this is a flex item, and without it the pane is as wide as
      // the widest line anywhere inside it — a quoted reply that cannot wrap
      // was enough to push the whole thread past its column and put a
      // sideways scroll on the page. The width comes from the frame, never
      // from the words.
      className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col"
      {...dropHandlers}
    >
      {/* Over everything, under the pointer's events — `pointer-events-none`
          is what keeps the overlay from being the child that `dragleave`
          fires for. */}
      {dragging ? (
        <div className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary bg-background/85 backdrop-blur-sm">
          <p className="flex items-center gap-2 text-[0.9375rem] font-semibold text-foreground">
            <PhotoIcon className="size-5 text-primary" />
            Drop to add a picture
          </p>
        </div>
      ) : null}

      <ThreadHeader
        conversationId={conversationId}
        detail={detail}
        typists={typists}
      />

      <div
        ref={scroller}
        onScroll={onScroll}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 pt-3 pb-3 sm:px-8 lg:px-14 xl:px-20"
      >
        {daily ? (
          <DayPager
            maxDays={detail?.kind === "announcements" ? Infinity : undefined}
            label={
              detail?.kind === "announcements" ? "Announcements" : "Everyone"
            }
            now={now}
            daysAgo={daysAgo}
            onChange={(day) => {
              setResumeUnread(false);
              setDaysAgo(day);
              pinned.current = true;
              if (explicitTarget)
                router.replace(`${CHAT_HREF}/${conversationId}`, {
                  scroll: false,
                });
            }}
          />
        ) : null}

        {outbox.storageWarning ? (
          <p role="status" className="mb-2 text-xs text-destructive">
            Browser storage is unavailable. Keep this tab open until your
            messages send.
          </p>
        ) : null}
        {requestedTarget && location === null ? (
          <p
            role="status"
            className="py-8 text-center text-sm text-muted-foreground"
          >
            This message is no longer available in this conversation.
          </p>
        ) : null}
        {status === "LoadingFirstPage" ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : null}

        {status === "CanLoadMore" ? (
          <div className="flex justify-center py-3">
            <Button variant="ghost" size="sm" onClick={() => loadMore(40)}>
              Earlier messages
            </Button>
          </div>
        ) : null}

        {status === "Exhausted" &&
        results.length === 0 &&
        !isBotDm &&
        typists.length === 0 ? (
          <Quiet archived={!live} />
        ) : null}

        {ordered.map((message, index) => (
          <MessageRow
            key={message._id}
            message={message}
            previous={ordered[index - 1]}
            next={
              ordered[index + 1] ??
              (live && outbox.entries[0]?.status !== "failed"
                ? pendingMessages[0]
                : undefined)
            }
            mine={message.authorClerkId === userId}
            me={userId}
            canAct={profile !== null && !readOnly}
            plainMentions={plainMentions}
            onEdit={
              message.poll
                ? undefined
                : () => {
                    setEditing(message);
                    composer.current?.focus();
                  }
            }
            onReply={() => {
              setEditing(null);
              setReplyingTo(message);
              composer.current?.focus();
            }}
            onJumpToMessage={jumpToMessage}
          />
        ))}
        {!live
          ? null
          : outbox.entries.map((entry, index) => (
              <div
                key={entry.nonce}
                className={entry.status === "failed" ? "" : "opacity-60"}
              >
                <MessageRow
                  message={pendingMessages[index]}
                  previous={
                    index === 0 && entry.status !== "failed"
                      ? ordered[ordered.length - 1]
                      : undefined
                  }
                  mine
                  me={userId}
                  canAct={false}
                  plainMentions={plainMentions}
                  onReply={() => {}}
                  onJumpToMessage={jumpToMessage}
                />
                <div
                  className="mt-1 ml-auto max-w-sm pr-14 text-right text-xs text-muted-foreground"
                  role="status"
                >
                  {entry.images.length === 0 &&
                  entry.attachmentIds.length > 0 ? (
                    <p>{entry.attachmentIds.length} pictures attached</p>
                  ) : null}
                  {entry.status === "failed" ? (
                    <>
                      <p className="text-destructive">
                        {entry.error ?? "Message not sent."}
                      </p>
                      <div className="mt-1 flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => outbox.retry(entry.nonce)}
                        >
                          Retry
                        </Button>
                        {!entry.uncertain &&
                        entry.attachmentIds.every((id) =>
                          entry.images.some(
                            (image) => image.attachmentId === id,
                          ),
                        ) ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (
                                composer.current?.restoreDraft(
                                  entry.body,
                                  entry.replyTo,
                                  entry.poll,
                                  entry.images,
                                )
                              )
                                outbox.discard(entry.nonce, true);
                            }}
                          >
                            Edit
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => outbox.discard(entry.nonce)}
                        >
                          Discard
                        </Button>
                      </div>
                    </>
                  ) : entry.status === "sending" ? (
                    "Sending…"
                  ) : outbox.online ? (
                    "Waiting to send…"
                  ) : (
                    "Offline · saved, waiting for connection"
                  )}
                </div>
              </div>
            ))}

        {/* Under everything, where their message is about to be. */}
        {live ? <Typing typists={typists} /> : null}
      </div>

      {/* Under the thread, in the flow. It floated over the messages on a
          blur for a while, and what that bought — no rule across the column
          — cost the last message of every conversation, which sat half
          behind it until you scrolled. A footer is a footer. */}
      <div className="shrink-0">
        {readOnly ? (
          <p className="px-4 py-4 text-center text-sm text-muted-foreground">
            Only staff can post in Announcements.
          </p>
        ) : live && detail !== undefined ? (
          <Composer
            ref={composer}
            onSubmit={submit}
            pictures={pictures}
            replyingTo={replyingTo}
            onCancelReply={() => setReplyingTo(null)}
            onRestoreReply={setReplyingTo}
            editing={editing}
            onCancelEdit={() => setEditing(null)}
            onEdit={async (messageId, body) => {
              const result = await edit({ messageId, body });
              if (result.ok) {
                setEditing(null);
                return null;
              }
              if (result.refusal === "read-only")
                throw new Error("This message can no longer be edited.");
              return result.refusal;
            }}
            conversationId={conversationId}
            kind={detail === undefined ? null : detail.kind}
            peer={peer}
            authors={authors}
            me={userId}
            canMentionEveryone={isAdmin}
          />
        ) : null}
      </div>
    </div>
  );
}
