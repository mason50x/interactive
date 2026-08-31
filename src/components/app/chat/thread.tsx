"use client";

import { useAuth } from "@clerk/nextjs";
import { Menu } from "@base-ui/react/menu";
import {
  ArrowUpIcon,
  ChevronLeftIcon,
  EllipsisHorizontalIcon,
  FaceSmileIcon,
} from "@heroicons/react/24/outline";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  GlobalUnlock,
  useRemaining,
} from "@/components/app/chat/global-unlock";
import { GroupPanel } from "@/components/app/chat/group-panel";
import { Monogram } from "@/components/app/chat/monogram";
import { StandingBanner } from "@/components/app/chat/standing-banner";
import { useChat } from "@/components/app/chat/chat-provider";
import {
  DELETE_WINDOW_MS,
  REACTIONS,
  conversationName,
  refusalMessage,
} from "@/lib/chat";
import { CHAT_HREF } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { ChatMessage } from "../../../../convex/chat/messages";

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
 * Drawn from local state, above the page, until the mutation resolves. Convex
 * does not resolve a mutation's promise until the client's own subscriptions
 * already reflect its writes, so clearing the local copy at that moment is an
 * exact handover rather than a race — the real row is on screen before the
 * placeholder leaves.
 *
 * Convex ships `insertAtTop` for this, which splices the row into the paginated
 * query's own store, and it would work here: `messages.list` joins nothing, so
 * the client can build exactly the row it is about to receive. It is not used
 * because it has to be handed a callback built during render, and that callback
 * needs a timestamp and an id — both impure, both correctly objected to by
 * React's lint rules. A held row is fewer moving parts and one less thing that
 * silently does nothing when the first page has not loaded.
 */
export function Thread({
  conversationId,
}: {
  conversationId: Id<"conversations">;
}) {
  const { userId } = useAuth();
  const { profile } = useChat();
  const detail = useQuery(api.chat.conversations.get, { conversationId });

  const { results, status, loadMore } = usePaginatedQuery(
    api.chat.messages.list,
    { conversationId },
    { initialNumItems: 40 },
  );

  const markRead = useMutation(api.chat.conversations.markRead);
  const send = useMutation(api.chat.messages.send);
  const newest = results[0]?._id;

  // The wait a new account serves before the global room will take anything —
  // shown as a ring rather than sprung as a refusal. See `global-unlock.tsx`.
  // Not shown to somebody muted or banned, who has a banner above already
  // saying something more important about the same composer.
  const unlockAt =
    detail !== undefined &&
    detail !== null &&
    detail.kind === "global" &&
    profile !== null &&
    profile.bannedAt === undefined &&
    profile.mutedUntil === undefined
      ? profile.globalUnlockAt
      : null;

  const left = useRemaining(unlockAt);
  const cooling = left !== null && left > 0 ? left : null;
  const cooldown =
    profile === null ? 0 : profile.globalUnlockAt - profile.createdAt;

  /** The message on screen that the server has not confirmed yet. */
  const [pending, setPending] = useState<ChatMessage | null>(null);

  const scroller = useRef<HTMLDivElement>(null);

  /** Whether the reader is at the live end. See the note above. */
  const pinned = useRef(true);

  /** Returns the refusal to show, or `null` when it went. */
  async function submit(text: string): Promise<string | null> {
    if (profile === null || userId === null || userId === undefined)
      return null;

    setPending({
      _id: crypto.randomUUID() as Id<"messages">,
      _creationTime: Date.now(),
      authorClerkId: userId,
      authorHandle: profile.handle,
      body: text,
      status: "visible",
      reactions: [],
    });

    const result = await send({ conversationId, body: text });
    setPending(null);
    return result.ok ? null : refusalMessage(result.refusal);
  }

  useEffect(() => {
    void markRead({ conversationId });
  }, [conversationId, newest, markRead]);

  // Opening a conversation always lands at its live end, whatever the last one
  // was left at.
  useEffect(() => {
    pinned.current = true;
  }, [conversationId]);

  useEffect(() => {
    const element = scroller.current;
    if (element === null || !pinned.current) return;
    element.scrollTop = element.scrollHeight;
  }, [conversationId, newest, pending, results.length]);

  // The thread shares its column with things that change height on their own —
  // the standing banner opening, the composer growing a second line. Each of
  // those shortens the pane, and a pane that gets shorter from the bottom takes
  // the newest message off screen. Watching the box rather than the causes
  // keeps the live end live through the whole of an animated one.
  useEffect(() => {
    const element = scroller.current;
    if (element === null) return;

    const observer = new ResizeObserver(() => {
      if (pinned.current) element.scrollTop = element.scrollHeight;
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  /**
   * Oldest first, for reading. A copy, because `results` is Convex's own array
   * and reversing it in place would reorder the store the query reads from.
   */
  const ordered = [...results].reverse();

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

  const name = detail === undefined ? "" : conversationName(detail);

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
        {/* Below `md` the conversation list is not on screen, so this is the
            only way back to it. Above `md` it is already there in the left
            pane and a second one would be clutter. */}
        <Link
          href={CHAT_HREF}
          aria-label="All conversations"
          className="-ml-1.5 flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground md:hidden"
        >
          <ChevronLeftIcon className="size-5" />
        </Link>

        {detail === undefined ? null : (
          <>
            <Monogram
              handle={name}
              emoji={detail.emoji}
              hue={detail.hue}
              className="size-7 text-[0.75rem]"
            />
            <h1 className="min-w-0 flex-1 truncate text-[0.9375rem] font-semibold">
              {detail.kind === "dm" ? `@${name}` : name}
            </h1>
            {detail.kind === "group" ? (
              <>
                <span className="hidden text-[0.8125rem] text-faint sm:inline">
                  {detail.members.filter((m) => m.status === "active").length}{" "}
                  in here
                </span>
                <GroupPanel conversationId={conversationId} detail={detail} />
              </>
            ) : null}
          </>
        )}
      </header>

      <StandingBanner />

      <div
        ref={scroller}
        onScroll={onScroll}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 pt-3 pb-20"
      >
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

        {status === "Exhausted" && results.length === 0 ? (
          <p className="py-8 text-center text-[0.875rem] text-muted-foreground">
            Nothing has been said here yet.
          </p>
        ) : null}

        {ordered.map((message, index) => (
          <MessageRow
            key={message._id}
            message={message}
            previous={ordered[index - 1]}
            mine={message.authorClerkId === userId}
            canAct={profile !== null && profile.bannedAt === undefined}
          />
        ))}

        {/* Last in document order, so it sits under the newest confirmed
            message. Held at reduced opacity so it reads as in flight rather
            than as sent — and it may still be refused. */}
        {pending === null ? null : (
          <div className="opacity-50">
            <MessageRow
              message={pending}
              previous={ordered[ordered.length - 1]}
              mine
              canAct={false}
            />
          </div>
        )}
      </div>

      {/* Over the thread rather than under it: the messages run to the bottom
          of the pane and the composer floats above them on its own blur, so
          nothing is cut off by a bar and no rule is drawn across the column. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 [&>*]:pointer-events-auto">
        {cooling === null ? null : (
          <GlobalUnlock remaining={cooling} total={cooldown} />
        )}

        <Composer
          onSubmit={submit}
          lock={
            profile !== null &&
            (profile.bannedAt !== undefined || profile.mutedUntil !== undefined)
              ? "muted"
              : cooling !== null
                ? "new"
                : null
          }
        />
      </div>
    </div>
  );
}

/**
 * What a group looks like from outside it.
 *
 * The whole of group discovery, and it is a page rather than a directory on
 * purpose — there is no list of groups anywhere on this site. You are here
 * because somebody sent you this link, which means a person let you in rather
 * than a search box, and on a site whose users are thirteen that is the
 * difference worth keeping.
 *
 * An invitation-only group returns nothing at all from `preview`, so its link
 * lands on the same refusal as a made-up id. That is deliberate: a page that
 * says "this group exists but you may not see it" has told somebody something.
 */
function Outside({ conversationId }: { conversationId: Id<"conversations"> }) {
  const preview = useQuery(api.chat.conversations.preview, { conversationId });
  const requestJoin = useMutation(api.chat.groups.requestJoin);
  const [notice, setNotice] = useState<string | null>(null);

  if (preview === undefined) {
    return (
      <div className="flex size-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (preview === null) {
    return (
      <div className="flex size-full items-center justify-center p-6 text-[0.9375rem] text-muted-foreground">
        This conversation is not open to you.
      </div>
    );
  }

  const open = preview.joinPolicy === "open";

  return (
    <div className="flex size-full items-center justify-center p-6">
      <div className="w-full max-w-sm text-center">
        <Monogram
          handle={preview.title}
          className="mx-auto size-12 text-[1.125rem]"
        />

        <h1 className="mt-4 text-display text-[1.5rem]">{preview.title}</h1>
        <p className="mt-1 text-[0.875rem] text-muted-foreground">
          {preview.members} {preview.members === 1 ? "person" : "people"} in
          here
        </p>

        {preview.requested ? (
          <p className="mt-5 text-[0.9375rem] text-muted-foreground">
            You have asked to join. Somebody in there has to say yes.
          </p>
        ) : (
          <Button
            className="mt-5 w-full"
            onClick={async () => {
              const result = await requestJoin({ conversationId });
              if (!result.ok) {
                setNotice(
                  result.reason === "full"
                    ? "This group is full."
                    : result.reason === "not-allowed"
                      ? "This group is invitation only."
                      : "That did not work.",
                );
              }
            }}
          >
            {open ? "Join" : "Ask to join"}
          </Button>
        )}

        {notice === null ? null : (
          <p className="mt-2 text-[0.8125rem] text-destructive">{notice}</p>
        )}
      </div>
    </div>
  );
}

/** The same surface the account popup uses, so a menu here is recognisably the
 *  same object. `.popup-slide` carries the open and close motion — see the rule
 *  in `globals.css` for why it is not expressible as utilities. */
const popupClass =
  "popup-slide flex gap-0.5 rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg shadow-black/[0.08] outline-none";

/** Messages this close together from the same person are one block. */
const GROUP_WINDOW_MS = 5 * 60_000;

function MessageRow({
  message,
  previous,
  mine,
  canAct,
}: {
  message: ChatMessage;
  previous: ChatMessage | undefined;
  mine: boolean;
  canAct: boolean;
}) {
  const react = useMutation(api.chat.messages.react);
  const report = useMutation(api.chat.reports.report);
  const block = useMutation(api.chat.blocks.block);
  const remove = useMutation(api.chat.messages.remove);

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

  const gone = message.status !== "visible";

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

  // Your own message past the window has nothing in its menu: reporting and
  // blocking are for other people, and deleting has run out. So there is no
  // menu.
  const choosable = mine ? deletable : true;

  const time = new Date(message._creationTime).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div
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
      ) : (
        <Monogram handle={message.authorHandle} />
      )}

      <div
        className={cn(
          "flex min-w-0 max-w-[min(32rem,78%)] flex-col",
          mine && "items-end",
        )}
      >
        {gone ? (
          <p className="rounded-3xl border border-border px-3.5 py-2 text-[0.9375rem] text-faint italic">
            Message removed after reports
          </p>
        ) : (
          <p
            className={cn(
              "rounded-3xl px-3.5 py-2 text-[0.9375rem] leading-relaxed break-words whitespace-pre-wrap",
              mine
                ? "bg-primary font-semibold text-primary-foreground"
                : "bg-surface-muted text-foreground",
            )}
          >
            {message.body}
          </p>
        )}

        {message.reactions.length > 0 ? (
          <div
            className={cn("mt-1 flex flex-wrap gap-1", mine && "justify-end")}
          >
            {message.reactions.map((reaction) => (
              <button
                key={reaction.emoji}
                type="button"
                disabled={!canAct}
                onClick={() =>
                  void react({ messageId: message._id, emoji: reaction.emoji })
                }
                className={cn(
                  "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.75rem] transition-colors",
                  reaction.mine
                    ? "border-primary/50 bg-primary/10"
                    : "border-border hover:bg-foreground/[0.05]",
                )}
              >
                <span>{reaction.emoji}</span>
                <span className="text-muted-foreground">{reaction.count}</span>
              </button>
            ))}
          </div>
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
          {mine || grouped ? null : (
            <span className="text-[0.875rem] font-semibold">
              {message.authorHandle}
            </span>
          )}

          {/* Every message, not just the grouped ones. A column of times down
              the edge of the thread is a lot of ink for something nobody reads
              until they want to know when — so it waits to be asked, and comes
              up with the controls it shares the row with. It stays up while
              either menu is open for the same reason they do: the pointer has
              left the message to go to the popup. */}
          <span
            className={cn(
              "text-[0.6875rem] text-faint transition-opacity duration-150",
              menuOpen
                ? "opacity-100"
                : "opacity-0 group-hover/message:opacity-100 group-focus-within/message:opacity-100",
            )}
          >
            {time}
          </span>

          {gone || !canAct ? null : (
            <div
              className={cn(
                // `opacity` and not `display`: a `display: none` element has no
                // box, and no box means no anchor for the popup that is measuring
                // it. This one is always laid out and merely invisible.
                "flex items-center gap-0.5 transition-opacity duration-150",
                menuOpen
                  ? "opacity-100"
                  : "opacity-0 group-hover/message:pointer-events-auto group-hover/message:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100",
                !menuOpen && "pointer-events-none",
              )}
            >
              <Menu.Root open={reacting} onOpenChange={setReacting}>
                <Menu.Trigger
                  aria-label="React"
                  className="flex size-5 items-center justify-center rounded-md text-faint hover:bg-foreground/[0.06] hover:text-foreground"
                >
                  <FaceSmileIcon className="size-4" />
                </Menu.Trigger>
                <Menu.Portal>
                  <Menu.Positioner
                    side="bottom"
                    align="end"
                    sideOffset={6}
                    className="z-50 outline-none"
                  >
                    <Menu.Popup className={popupClass}>
                      {REACTIONS.map((emoji) => (
                        <Menu.Item
                          key={emoji}
                          onClick={() =>
                            void react({ messageId: message._id, emoji })
                          }
                          className="flex size-8 items-center justify-center rounded-lg text-[1rem] outline-none select-none hover:bg-foreground/[0.06] data-highlighted:bg-foreground/[0.06]"
                        >
                          {emoji}
                        </Menu.Item>
                      ))}
                    </Menu.Popup>
                  </Menu.Positioner>
                </Menu.Portal>
              </Menu.Root>

              {!choosable ? null : (
                <Menu.Root open={choosing} onOpenChange={setChoosing}>
                  <Menu.Trigger
                    aria-label="More"
                    className="flex size-5 items-center justify-center rounded-md text-faint hover:bg-foreground/[0.06] hover:text-foreground"
                  >
                    <EllipsisHorizontalIcon className="size-4" />
                  </Menu.Trigger>
                  <Menu.Portal>
                    <Menu.Positioner
                      side="bottom"
                      align="end"
                      sideOffset={6}
                      className="z-50 outline-none"
                    >
                      <Menu.Popup className={cn(popupClass, "w-44 flex-col")}>
                        {mine ? (
                          <Menu.Item
                            onClick={() =>
                              void remove({ messageId: message._id })
                            }
                            className="rounded-lg px-2.5 py-1.5 text-left text-[0.875rem] text-destructive outline-none select-none hover:bg-foreground/[0.06] data-highlighted:bg-foreground/[0.06]"
                          >
                            Delete
                          </Menu.Item>
                        ) : (
                          <>
                            {/* Reporting is not a message to anybody. It is weighted
                                by the reporter's own record and counted against a
                                threshold — see `convex/chat/reports.ts`. Saying so
                                here would be a paragraph nobody reads; what the copy
                                does instead is avoid promising a review that is never
                                going to happen. */}
                            <Menu.SubmenuRoot>
                              <Menu.SubmenuTrigger className="rounded-lg px-2.5 py-1.5 text-left text-[0.875rem] outline-none select-none hover:bg-foreground/[0.06] data-highlighted:bg-foreground/[0.06]">
                                Report this
                              </Menu.SubmenuTrigger>
                              <Menu.Portal>
                                <Menu.Positioner
                                  side="right"
                                  align="start"
                                  sideOffset={4}
                                  className="z-50 outline-none"
                                >
                                  <Menu.Popup
                                    className={cn(popupClass, "w-40 flex-col")}
                                  >
                                    {REPORT_REASONS.map(([reason, label]) => (
                                      <Menu.Item
                                        key={reason}
                                        onClick={() =>
                                          void report({
                                            messageId: message._id,
                                            targetClerkId:
                                              message.authorClerkId,
                                            reason,
                                          })
                                        }
                                        className="rounded-lg px-2.5 py-1.5 text-left text-[0.875rem] outline-none select-none hover:bg-foreground/[0.06] data-highlighted:bg-foreground/[0.06]"
                                      >
                                        {label}
                                      </Menu.Item>
                                    ))}
                                  </Menu.Popup>
                                </Menu.Positioner>
                              </Menu.Portal>
                            </Menu.SubmenuRoot>

                            <Menu.Item
                              onClick={() =>
                                void block({
                                  peerClerkId: message.authorClerkId,
                                })
                              }
                              className="rounded-lg px-2.5 py-1.5 text-left text-[0.875rem] text-destructive outline-none select-none hover:bg-foreground/[0.06] data-highlighted:bg-foreground/[0.06]"
                            >
                              Block {message.authorHandle}
                            </Menu.Item>
                          </>
                        )}
                      </Menu.Popup>
                    </Menu.Positioner>
                  </Menu.Portal>
                </Menu.Root>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
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
 * Why the composer is shut, when it is.
 *
 * `muted` is a rule somebody broke and `new` is a wait everybody serves, and
 * the two want different words in the same box — which is the whole reason
 * this is a reason rather than a boolean.
 */
type Lock = "muted" | "new" | null;

const PLACEHOLDER: Record<"muted" | "new", string> = {
  muted: "You cannot send messages right now",
  new: "You can post here when the ring fills",
};

function Composer({
  onSubmit,
  lock,
}: {
  onSubmit: (text: string) => Promise<string | null>;
  lock: Lock;
}) {
  const shut = lock !== null;
  const [body, setBody] = useState("");
  const [refused, setRefused] = useState<string | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  async function submit() {
    const text = body.trim();
    if (text === "" || shut) return;

    setBody("");
    setRefused(null);
    const refusal = await onSubmit(text);

    if (refusal !== null) {
      setRefused(refusal);
      // Handed back rather than dropped. Somebody who wrote three sentences and
      // hit a rule on one word should not have to write them again.
      setBody(text);
      field.current?.focus();
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    void submit();
  }
  return (
    <div className="px-3 pb-3">
      {/* The category and never the rule. See `refusalMessage` in
          `src/lib/chat.ts` — telling somebody exactly which word tripped is
          telling them how to spell it next time.

          Over the composer rather than under it, on the same blur, so it reads
          as the message coming back rather than as a line of small print. */}
      {refused === null ? null : (
        <div className="flex justify-center pb-2">
          <p
            role="alert"
            className="animate-notice-in max-w-full rounded-full border border-destructive/30 bg-surface/70 px-3.5 py-1.5 text-center text-[0.8125rem] text-destructive shadow-[0_6px_24px_rgba(15,15,15,0.10)] backdrop-blur-xl"
          >
            {refused}
          </p>
        </div>
      )}

      <div className="flex items-end gap-2 rounded-full border border-border bg-surface/70 py-1.5 pr-1.5 pl-4 shadow-[0_6px_24px_rgba(15,15,15,0.10)] backdrop-blur-xl focus-within:border-primary">
        <textarea
          ref={field}
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
            setRefused(null);
          }}
          onKeyDown={onKeyDown}
          rows={1}
          disabled={shut}
          maxLength={2000}
          aria-label="Message"
          placeholder={lock === null ? "Say something" : PLACEHOLDER[lock]}
          className="max-h-32 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-[0.9375rem] leading-relaxed outline-none placeholder:text-faint disabled:cursor-not-allowed"
        />
        <Button
          size="icon-lg"
          className="rounded-full"
          aria-label="Send"
          onClick={() => void submit()}
          disabled={shut || body.trim() === ""}
        >
          <ArrowUpIcon className="size-[1.125rem]" />
        </Button>
      </div>
    </div>
  );
}
