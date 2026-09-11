"use client";

import { useAuth } from "@clerk/nextjs";
import { PhotoIcon } from "@heroicons/react/24/outline";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type {
  ChatImage,
  ChatMention,
  ChatMessage,
} from "@convex/chat/messages";

export type { ComposerHandle };

/**
 * One conversation.
 *
 * ## Which way the list runs
 *
 * `messages.list` returns newest first, because that is the end pagination has
 * to start at, and the column renders a reversed copy so the oldest sits at the
 * top. A `flex-col-reverse` column would anchor to its own bottom for free, but
 * it also pins a half-empty conversation to the bottom of the pane — three
 * messages floating above the composer with the whole history's worth of blank
 * above them. A normal column starts them at the top, where a conversation
 * starts, and the scroll is done by hand below.
 *
 * ## Sticking to the bottom
 *
 * `pinned` is whether the reader is at the live end. Everything that arrives
 * while they are scrolls into view; nothing does while they are reading further
 * up, so an arriving message never moves what somebody is looking at. Loading
 * earlier messages does not trip it either — that changes the far end of the
 * array, not `newest`.
 *
 * ## The message you just sent
 *
 * Drawn from local state, at the bottom, until the mutation resolves — at
 * half weight, because it may still be refused. Convex does not resolve a
 * mutation's promise until the client's own subscriptions already reflect its
 * writes, so clearing the local copy at that moment is an exact handover
 * rather than a race: the real row is on screen before the placeholder leaves.
 *
 * It appears where it lands. It used to be flown from the composer to its
 * place in the thread over three hundred milliseconds, and the flight was the
 * one moment the app moved something you made — but a message sent quickly
 * after another arrived mid-flight, and a confirmation that landed before the
 * flight did cut it off, so what most sends actually showed was a stutter.
 * Instant is what every other chat does and what a keystroke deserves.
 *
 * Convex ships `insertAtTop` for this, which splices the row into the paginated
 * query's own store, and it would work here: `messages.list` joins nothing, so
 * the client can build exactly the row it is about to receive. It is not used
 * because it has to be handed a callback built during render, and that callback
 * needs a timestamp and an id — both impure, both correctly objected to by
 * React's lint rules. A held row is fewer moving parts and one less thing that
 * silently does nothing when the first page has not loaded.
 *
 * The pieces are in `thread/`: the header, the rows, the composer and its
 * hooks, the day pager for the room, and what is shown from outside a group.
 * This file is the conversation itself — the query, the scroll, and the send.
 */
export function Thread({
  conversationId,
}: {
  conversationId: Id<"conversations">;
}) {
  // Next may preserve a client component while only its dynamic route param
  // changes. The key makes a conversation's day page part of that
  // conversation, so opening another one always starts live rather than on the
  // archive page the previous room was left on.
  return (
    <ConversationThread key={conversationId} conversationId={conversationId} />
  );
}

function ConversationThread({
  conversationId,
}: {
  conversationId: Id<"conversations">;
}) {
  const { userId } = useAuth();
  const { profile, behind, setReading, images: pictures } = useChat();
  const detail = useQuery(api.chat.conversations.get, { conversationId });

  /**
   * Everyone is a sequence of local calendar days rather than one endless
   * room. Zero is the live day; positive numbers walk backwards through its
   * retained history. The day clock advances an open tab across midnight.
   */
  const now = useDayClock();
  const [daysAgo, setDaysAgo] = useState(0);
  const day = dayBounds(now, daysAgo);

  const { results, status, loadMore } = usePaginatedQuery(
    api.chat.messages.list,
    { conversationId, dayStart: day.start, dayEnd: day.end },
    { initialNumItems: 40 },
  );

  const markRead = useMutation(api.chat.conversations.markRead);
  const welcomeBot = useMutation(api.chat.bot.welcome);
  const send = useMutation(api.chat.messages.send);
  const newest = results[0]?._id;

  /** Who else is writing in here. See `typing.tsx`. */
  const typists = useTypists(conversationId);

  /** The message on screen that the server has not confirmed yet. */
  const [pending, setPending] = useState<ChatMessage | null>(null);

  /** The message named above the composer and attached to the next send. */
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);

  const scroller = useRef<HTMLDivElement>(null);

  /** Whether the reader is at the live end. See the note above. */
  const pinned = useRef(true);

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

  const archived = detail?.kind === "global" && daysAgo > 0;
  const { dragging, handlers: dropHandlers } = useDropFiles({
    enabled: pictures && !archived,
    onFiles: (files) => composer.current?.addFiles(files),
  });

  /**
   * Returns the refusal, or `null` when it went.
   *
   * `previews` are the composer's own object URLs for the pictures, and they
   * are what the placeholder message is drawn with — the real URLs do not
   * exist until the row does. The composer revokes them once this resolves.
   */
  async function submit(
    text: string,
    attachmentIds: Id<"attachments">[],
    previews: ChatImage[],
    replyTo: ChatMessage | null,
    mentions: ChatMention[],
    everyone: boolean,
  ): Promise<Refusal | null> {
    if (profile === null || userId === null || userId === undefined)
      return null;

    setPending({
      _id: crypto.randomUUID() as Id<"messages">,
      _creationTime: Date.now(),
      authorClerkId: userId,
      authorHandle: profile.handle,
      authorName: profile.displayName,
      authorAvatarUrl: profile.avatarUrl,
      authorAvatarHue: profile.avatarHue,
      authorAvatarEmoji: profile.avatarEmoji,
      authorAvatarInitials: profile.avatarInitials,
      body: text,
      replyTo: replyTo === null ? undefined : replyFromMessage(replyTo),
      // What the composer resolved from the people it offered. The server
      // resolves the body again for itself; this is only so the placeholder
      // draws the same chips the real row is about to.
      mentions,
      mentionsEveryone: everyone,
      status: "visible",
      reactions: [],
      images: previews,
    });

    const result = await send({
      conversationId,
      body: text,
      attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
      replyToId: replyTo?._id,
    });
    setPending(null);
    if (result.ok) {
      setReplyingTo((current) =>
        current?._id === replyTo?._id ? null : current,
      );
      return null;
    }
    if (result.refusal === "reply-unavailable") {
      setReplyingTo((current) =>
        current?._id === replyTo?._id ? null : current,
      );
    }
    return result.refusal;
  }

  function jumpToMessage(messageId: Id<"messages">) {
    document.getElementById(`message-${messageId}`)?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }

  /**
   * This is the conversation being read, for as long as it is open at its
   * live end — an archive day of the room is not reading the room. The
   * provider stops counting it as unread from here on, so neither its row nor
   * the rail's dot lights for the beat between a message arriving and
   * `markRead` below catching up with it. See `reading` in `chat-provider.tsx`.
   *
   * The cleanup only lets go of its own claim: two threads are never mounted
   * at once, but the next one's effect may run before this one's cleanup,
   * and clearing unconditionally would wipe the claim it had just made.
   */
  useEffect(() => {
    if (daysAgo > 0) return;
    setReading(conversationId);
    return () =>
      setReading((current) => (current === conversationId ? null : current));
  }, [conversationId, daysAgo, setReading]);

  /**
   * Whether there is a reading position to move — `behind`, from the provider.
   *
   * The list already knows — it is the same subscription the unread badge is
   * drawn from, and Convex hands both it and the page of messages below over at
   * one consistent instant, so a message that has arrived here has arrived
   * there. Without this the effect fired on every message including the ones
   * this account sent, and `markRead` writes the membership row: a write that
   * recomputes the conversation list of whoever made it, to set a number that
   * was already zero.
   *
   * It is read off the provider rather than off `conversations` because the
   * provider hands out this conversation as already read — see above — and
   * the unmasked answer is the one that says whether the server agrees. A
   * conversation the list has not answered about — the first paint of a
   * thread opened by its URL, or one past the fifty the list draws — counts as
   * behind, which is what this did unconditionally before.
   */
  const isBotDm = detail?.kind === "dm" && detail.peerClerkId === "bot";
  const emptyBotDm = isBotDm && status === "Exhausted" && results.length === 0;

  useEffect(() => {
    if (emptyBotDm) void welcomeBot({ conversationId });
  }, [conversationId, emptyBotDm, welcomeBot]);

  useEffect(() => {
    if (!behind || daysAgo > 0) return;
    void markRead({ conversationId });
  }, [conversationId, daysAgo, newest, behind, markRead]);

  // Opening a conversation always lands at its live end, whatever the last one
  // was left at.
  useEffect(() => {
    pinned.current = true;
  }, [conversationId]);

  // A different day is a different page. Land at that day's most recent
  // message, which is the point from which the reader paged backwards.
  useEffect(() => {
    pinned.current = true;
  }, [daysAgo]);

  // Before the paint rather than after it. A thread opens at its live end, and
  // an effect that runs after the browser has drawn shows one frame of the top
  // of the conversation before it jumps.
  useLayoutEffect(() => {
    const element = scroller.current;
    if (element === null || !pinned.current) return;
    element.scrollTop = element.scrollHeight;
  }, [conversationId, daysAgo, newest, pending, results.length]);

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
    pinned.current =
      element.scrollHeight - element.scrollTop - element.clientHeight < 64;
  }

  // Not a member — which is sometimes a door rather than a wall. See `Outside`.
  if (detail === null) return <Outside conversationId={conversationId} />;

  const global = detail?.kind === "global";
  const live = !global || daysAgo === 0;

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
        {global ? (
          <DayPager now={now} daysAgo={daysAgo} onChange={setDaysAgo} />
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
            next={ordered[index + 1]}
            mine={message.authorClerkId === userId}
            me={userId}
            canAct={profile !== null}
            onReply={() => {
              setReplyingTo(message);
              composer.current?.focus();
            }}
            onJumpToMessage={jumpToMessage}
          />
        ))}

        {/* Last in document order, so it sits under the newest confirmed
            message. Held at reduced opacity so it reads as not yet sent —
            it may still be refused. */}
        {!live || pending === null ? null : (
          <div className="opacity-50">
            <MessageRow
              message={pending}
              previous={ordered[ordered.length - 1]}
              mine
              me={userId}
              canAct={false}
              onReply={() => {}}
              onJumpToMessage={jumpToMessage}
            />
          </div>
        )}

        {/* Under everything, where their message is about to be. */}
        {live ? <Typing typists={typists} /> : null}
      </div>

      {/* Under the thread, in the flow. It floated over the messages on a
          blur for a while, and what that bought — no rule across the column
          — cost the last message of every conversation, which sat half
          behind it until you scrolled. A footer is a footer. */}
      <div className="shrink-0">
        {live ? (
          <Composer
            ref={composer}
            onSubmit={submit}
            pictures={pictures}
            replyingTo={replyingTo}
            onCancelReply={() => setReplyingTo(null)}
            conversationId={conversationId}
            kind={detail === undefined ? null : detail.kind}
            peer={peer}
            authors={authors}
            me={userId}
          />
        ) : null}
      </div>
    </div>
  );
}
