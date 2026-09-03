"use client";

import { useAuth } from "@clerk/nextjs";
import { Menu } from "@base-ui/react/menu";
import {
  ArrowUpIcon,
  ChevronLeftIcon,
  EllipsisHorizontalIcon,
  FaceSmileIcon,
  PhotoIcon,
  PlusIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { MicrophoneIcon } from "@heroicons/react/24/solid";
import {
  useAction,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "convex/react";
import Link from "next/link";
import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  GlobalUnlock,
  useRemaining,
} from "@/components/app/chat/global-unlock";
import { GroupPanel } from "@/components/app/chat/group-panel";
import { menuItemClass, popupClass } from "@/components/app/chat/menu";
import { Monogram } from "@/components/app/chat/monogram";
import { PersonCard } from "@/components/app/chat/person-card";
import { Photo } from "@/components/app/chat/photo";
import { Present } from "@/components/app/chat/presence";
import { StandingBanner } from "@/components/app/chat/standing-banner";
import { Waveform } from "@/components/app/chat/waveform";
import { useChat } from "@/components/app/chat/chat-provider";
import {
  DELETE_WINDOW_MS,
  REACTIONS,
  conversationName,
  personName,
  refusalMessage,
  type Refusal,
} from "@/lib/chat";
import {
  MAX_IMAGES_PER_MESSAGE,
  isImageFile,
  prepareImage,
  previewFor,
  rememberPreview,
} from "@/lib/images";
import { CHAT_HREF } from "@/lib/nav";
import { useDictation } from "@/lib/use-dictation";
import { cn } from "@/lib/utils";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { ChatImage, ChatMessage } from "../../../../convex/chat/messages";

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
 */
export function Thread({
  conversationId,
}: {
  conversationId: Id<"conversations">;
}) {
  const { userId } = useAuth();
  const { profile, conversations, images: pictures } = useChat();
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

  /**
   * Whether something is being dragged over the thread.
   *
   * Counted rather than toggled, because `dragleave` fires every time the
   * pointer crosses into a child — the overlay would flicker off over every
   * message. Depth goes up on enter and down on leave, and the overlay shows
   * while it is above zero.
   */
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

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
  ): Promise<Refusal | null> {
    if (profile === null || userId === null || userId === undefined)
      return null;

    setPending({
      _id: crypto.randomUUID() as Id<"messages">,
      _creationTime: Date.now(),
      authorClerkId: userId,
      authorHandle: profile.handle,
      authorName: profile.displayName,
      body: text,
      status: "visible",
      reactions: [],
      images: previews,
    });

    const result = await send({
      conversationId,
      body: text,
      attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
    });
    setPending(null);
    return result.ok ? null : result.refusal;
  }

  const shut =
    profile !== null &&
    (profile.bannedAt !== undefined || profile.mutedUntil !== undefined);

  /** Whether a drag is something this thread would take. */
  function droppable(event: DragEvent) {
    return pictures && !shut && event.dataTransfer.types.includes("Files");
  }

  function onDragEnter(event: DragEvent) {
    if (!droppable(event)) return;
    event.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  }

  function onDragOver(event: DragEvent) {
    if (!droppable(event)) return;
    // Without this the browser's default is to refuse the drop.
    event.preventDefault();
  }

  function onDragLeave(event: DragEvent) {
    if (!droppable(event)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }

  function onDrop(event: DragEvent) {
    dragDepth.current = 0;
    setDragging(false);
    if (!droppable(event)) return;
    event.preventDefault();
    composer.current?.addFiles([...event.dataTransfer.files]);
  }

  /**
   * Whether there is a reading position to move.
   *
   * The list already knows — it is the same subscription the unread badge is
   * drawn from, and Convex hands both it and the page of messages below over at
   * one consistent instant, so a message that has arrived here has arrived
   * there. Without this the effect fired on every message including the ones
   * this account sent, and `markRead` writes the membership row: a write that
   * recomputes the conversation list of whoever made it, to set a number that
   * was already zero.
   *
   * `undefined` is a conversation the list has not answered about — the first
   * paint of a thread opened by its URL, or one past the fifty the list draws.
   * Both mean ask, which is what this did unconditionally before.
   */
  const summary = conversations.find((row) => row._id === conversationId);
  const unread = summary === undefined || summary.unread > 0;

  useEffect(() => {
    if (!unread) return;
    void markRead({ conversationId });
  }, [conversationId, newest, unread, markRead]);

  // Opening a conversation always lands at its live end, whatever the last one
  // was left at.
  useEffect(() => {
    pinned.current = true;
  }, [conversationId]);

  // Before the paint rather than after it. A thread opens at its live end, and
  // an effect that runs after the browser has drawn shows one frame of the top
  // of the conversation before it jumps.
  useLayoutEffect(() => {
    const element = scroller.current;
    if (element === null || !pinned.current) return;
    element.scrollTop = element.scrollHeight;
  }, [conversationId, newest, pending, results.length]);

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
    <div
      className="relative flex h-full min-h-0 flex-1 flex-col"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
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
            {/* In a direct message the header is the other person, so it is
                their card's trigger — the same door their name is everywhere
                else. */}
            {detail.kind === "dm" && detail.peerClerkId !== undefined ? (
              <PersonCard
                person={{
                  clerkId: detail.peerClerkId,
                  handle: detail.peerHandle ?? name,
                  displayName: detail.peerName,
                }}
                className="-ml-1.5 flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg px-1.5 py-1 text-left outline-none hover:bg-foreground/[0.04] focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                <Monogram
                  handle={detail.peerHandle ?? name}
                  className="size-7 text-[0.75rem]"
                />
                <span className="min-w-0 flex-1">
                  <h1 className="truncate text-[0.9375rem] font-semibold">
                    {name}
                  </h1>
                  {detail.peerName === undefined ? null : (
                    <span className="block truncate text-[0.75rem] text-faint">
                      @{detail.peerHandle}
                    </span>
                  )}
                </span>
              </PersonCard>
            ) : (
              <>
                <Monogram
                  handle={name}
                  emoji={detail.emoji}
                  hue={detail.hue}
                  brand={detail.kind === "global"}
                  className="size-7 text-[0.75rem]"
                />
                <h1 className="min-w-0 flex-1 truncate text-[0.9375rem] font-semibold">
                  {name}
                </h1>
              </>
            )}
            {/* Who is in here now, not who belongs here — and asked for in the
                room as well as in a group, which is where a live number is
                worth the most and where a count of members was never going to
                be possible. A direct message has nobody to count. */}
            {detail.kind === "dm" ? null : (
              <Present conversationId={conversationId} />
            )}

            {detail.kind === "group" ? (
              <GroupPanel conversationId={conversationId} />
            ) : null}
          </>
        )}
      </header>

      <StandingBanner />

      <div
        ref={scroller}
        onScroll={onScroll}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 pt-3 pb-3 sm:px-8 lg:px-14 xl:px-20"
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

        {status === "Exhausted" && results.length === 0 ? <Quiet /> : null}

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
            message. Held at reduced opacity so it reads as not yet sent —
            it may still be refused. */}
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

      {/* Under the thread, in the flow. It floated over the messages on a
          blur for a while, and what that bought — no rule across the column
          — cost the last message of every conversation, which sat half
          behind it until you scrolled. A footer is a footer. */}
      <div className="shrink-0">
        {cooling === null ? null : (
          <GlobalUnlock remaining={cooling} total={cooldown} />
        )}

        <Composer
          ref={composer}
          onSubmit={submit}
          pictures={pictures}
          lock={shut ? "muted" : cooling !== null ? "new" : null}
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

/**
 * The speech bubble, drawn once as characters.
 *
 * A `#` is a dot on a 4px grid: eight rows of a rounded rectangle and two more
 * for the tail hanging off its bottom-left corner. Written this way because the
 * shape is the only thing about it worth reading, and a list of coordinates
 * hides that behind arithmetic — here you can see the bubble in the source.
 */
const BUBBLE_ART = [
  "..#########..",
  ".#.........#.",
  "#...........#",
  "#...........#",
  "#...........#",
  "#...........#",
  ".#.........#.",
  "..#########..",
  "..##.........",
  "..#..........",
] as const;

/**
 * The five planes the outline is repeated across, near to far, and the cycle
 * each one's brightness runs over a revolution.
 *
 * 4px apart, which is the grid's own pitch — the bubble is then one cube size
 * in all three directions, and the wall reads as stacked pixels rather than as
 * a shape smeared backwards. Five of them and not three because the quarter of
 * the turn where the bubble is edge-on is all wall, and a wall wants some
 * thickness to be one.
 *
 * `near` is what a plane is worth facing the camera and `far` what it is worth
 * hidden behind the others; `phase` is the half-revolution offset that puts the
 * back planes on the far end of the cycle while the front ones are on the near
 * end. The amplitude narrows toward the middle because a plane nearer the axis
 * swings less in depth, and the one *on* the axis does not move at all — so its
 * two ends are the same number and its cycle is a flat line.
 *
 * `rest` is where that cycle sits at the angle the bubble rests at, written
 * onto the dot as its plain opacity so a bubble with its animations collapsed
 * is still a *shaded* bubble. See `.dot-bubble-pixel` in `globals.css`.
 */
const BUBBLE_PLANES = [
  { z: 8, near: 1, far: 0.2, phase: 0 },
  { z: 4, near: 0.82, far: 0.34, phase: 0 },
  { z: 0, near: 0.55, far: 0.55, phase: 0 },
  { z: -4, near: 0.82, far: 0.34, phase: 0.5 },
  { z: -8, near: 1, far: 0.2, phase: 0.5 },
] as const;

/**
 * Every pixel of the wall, placed once at module load.
 *
 * The art's centre is the origin: the grid is thirteen wide and ten tall, so
 * halving those puts (0, 0) in the middle of the whole drawing, tail included.
 * That means the bubble body sits a little high in the box, which is where a
 * bubble with a tail belongs.
 */
const BUBBLE_PIXELS = BUBBLE_PLANES.flatMap((plane) =>
  BUBBLE_ART.flatMap((row, y) =>
    [...row].flatMap((cell, x) =>
      cell === "#"
        ? [
            {
              key: `${plane.z}:${x}:${y}`,
              x: (x - 6) * 4,
              y: (y - 4.5) * 4,
              z: plane.z,
              near: plane.near,
              far: plane.far,
              phase: plane.phase,
              // The resting angle is a shallow turn away from face-on, so the
              // front of the bubble is still the front of it: each plane rests
              // at whichever end of its own cycle it is nearest.
              rest: plane.phase === 0 ? plane.near : plane.far,
            },
          ]
        : [],
    ),
  ),
);

/**
 * The three dots inside it. Centred across the body and on its middle line,
 * two grid cells apart. Their depth is the near plane's and is written in the
 * stylesheet instead of here, because it is the same 8px in four keyframes.
 */
const BUBBLE_SAYING = [-8, 0, 8];

/**
 * An empty thread.
 *
 * A conversation with nothing in it is not an error and should not be reported
 * like one, so the line is set at the weight of something being told to you
 * rather than the grey of a caption apologising. Above it, the thing that would
 * be there if somebody were typing: an empty bubble, turning, with the three
 * dots already going. It is not a status — nobody is typing, and it says so by
 * being the only thing on the screen — it is the shape of what this pane is
 * for, held up for a second before anybody has used it.
 *
 * `flex-1` inside the scroller, so this centres in the pane rather than sitting
 * at the top of an empty column. Everything about how it is built is in
 * `.dot-bubble` in `globals.css`.
 */
function Quiet() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 py-10">
      {/* The accent, like the search orb — the two pieces of decoration in the
          app are painted in whatever colour the account picked. */}
      <div aria-hidden className="dot-bubble text-primary">
        <div className="dot-bubble-shell">
          {BUBBLE_PIXELS.map((pixel) => (
            <span
              key={pixel.key}
              className="dot-bubble-pixel"
              style={
                {
                  "--x": pixel.x,
                  "--y": pixel.y,
                  "--z": pixel.z,
                  "--near": pixel.near,
                  "--far": pixel.far,
                  "--phase": pixel.phase,
                  "--rest": pixel.rest,
                } as React.CSSProperties
              }
            />
          ))}

          {BUBBLE_SAYING.map((x, index) => (
            <span
              key={x}
              className="dot-bubble-say"
              // The stagger is an index rather than a delay, so the three of
              // them stay in step with each other if the timing changes.
              style={
                { "--x": x, "--y": -4, "--i": index } as React.CSSProperties
              }
            />
          ))}
        </div>
      </div>

      <p className="text-center text-[0.9375rem] font-semibold text-foreground">
        Nothing has been said here yet.
      </p>
    </div>
  );
}

/** The same surface the account popup uses, so a menu here is recognisably the
 *  same object. `.popup-slide` carries the open and close motion — see the rule
 *  in `globals.css` for why it is not expressible as utilities. */
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

  /** Who said it, as the card that opens when they are pressed. */
  const author = {
    clerkId: message.authorClerkId,
    handle: message.authorHandle,
    displayName: message.authorName,
  };

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
        <PersonCard
          person={author}
          className="shrink-0 cursor-pointer self-start rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Monogram handle={message.authorHandle} />
        </PersonCard>
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
              )}
            />
            <span className="relative">{message.body}</span>
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
            <PersonCard
              person={author}
              className="cursor-pointer truncate rounded text-[0.875rem] font-semibold outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              {personName(author)}
            </PersonCard>
          )}

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
                : "opacity-0 group-hover/message:opacity-100 group-focus-within/message:opacity-100 pointer-coarse:opacity-100",
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
                  : "opacity-0 group-hover/message:pointer-events-auto group-hover/message:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100 pointer-coarse:pointer-events-auto pointer-coarse:opacity-100",
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
                            className={cn(menuItemClass, "text-destructive")}
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
                              <Menu.SubmenuTrigger className={menuItemClass}>
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
                                        className={menuItemClass}
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
                              className={cn(menuItemClass, "text-destructive")}
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

/** The textarea's own cap, which the server enforces again. */
const MAX_BODY = 2000;

/**
 * How tall the box may be, in pixels: one line with its padding, and the
 * same eight lines `max-h-32` used to allow before the height was measured.
 * Past the ceiling the box scrolls, as it always did.
 */
const FIELD_MIN = 36;
const FIELD_MAX = 128;

/**
 * A spoken segment after whatever is already in the box. A space between
 * unless the box is empty or already ends in one, so dictating after typing
 * does not weld the two words together.
 */
function joinSpoken(prev: string, next: string) {
  return prev === "" || /\s$/.test(prev) ? prev + next : `${prev} ${next}`;
}

/** What the thread may ask of the composer. See `composer` in `Thread`. */
export type ComposerHandle = { addFiles: (files: File[]) => void };

/**
 * A picture in the tray, from the moment it is chosen until it is sent.
 *
 * `preview` is an object URL for the shrunk blob. It is drawn in the tray,
 * then in the placeholder message while the send is out, and revoked once
 * the picture has left both. The three states are the three waits — the
 * bytes going up, the classifier looking, done — and only `ready` carries an
 * `attachmentId`, because only `ready` has one the server will accept.
 *
 * A refused picture has no state. It leaves the tray with a sentence over
 * the box, exactly as a refused message does, and nothing of it is kept.
 */
type Attached = {
  key: string;
  preview: string;
  width: number;
  height: number;
  state: "uploading" | "checking" | "ready";
  attachmentId?: Id<"attachments">;
};

/** The one composer notice that is not a refusal from the server. */
const TOO_MANY = "Up to four pictures on one message.";

function Composer({
  ref,
  onSubmit,
  pictures,
  lock,
}: {
  ref: Ref<ComposerHandle>;
  onSubmit: (
    text: string,
    attachmentIds: Id<"attachments">[],
    previews: ChatImage[],
  ) => Promise<Refusal | null>;
  /**
   * Whether pictures are on for this deployment. Off, there is no plus, no
   * paste and no drop — `addFiles` is the one door and it is shut — and the
   * box is the box it was before pictures existed.
   */
  pictures: boolean;
  lock: Lock;
}) {
  const shut = lock !== null;
  const [body, setBody] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  // Finals append to whatever is there, through an updater, so a keystroke
  // and a spoken segment both land in arrival order and neither overwrites
  // the other. The interim guess is shown after the text and never stored.
  const dictation = useDictation({
    onFinal: (segment) =>
      setBody((prev) => joinSpoken(prev, segment).slice(0, MAX_BODY)),
    onError: setNotice,
  });
  const live = dictation.state !== "idle";
  const shown =
    dictation.interim === ""
      ? body
      : joinSpoken(body, dictation.interim).slice(0, MAX_BODY);

  // A lock landing mid-sentence takes the microphone with it.
  const { abort } = dictation;
  useEffect(() => {
    if (shut) abort();
  }, [shut, abort]);

  // Keep the newest words in view once the box has hit its height.
  useEffect(() => {
    const el = field.current;
    if (el !== null && dictation.interim !== "") el.scrollTop = el.scrollHeight;
  }, [shown, dictation.interim]);

  /**
   * The box's height, measured off a twin rather than left to the browser.
   *
   * A textarea cannot animate to `auto`, and asking it for its own
   * `scrollHeight` means first snapping it to `auto` to measure — which is
   * the jump this exists to remove. So the same text is laid out in an
   * invisible div with the same width, padding and type, that div's height
   * is the answer, and the textarea is told it as a number it can move to.
   * A `ResizeObserver` on the twin catches both a new line of text and a
   * narrower window, which are the two things that change how it wraps.
   */
  const mirror = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(FIELD_MIN);

  useEffect(() => {
    const el = mirror.current;
    if (el === null) return;
    const observer = new ResizeObserver(() => {
      setHeight(Math.min(FIELD_MAX, Math.max(FIELD_MIN, el.offsetHeight)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /*
   * Pictures.
   *
   * Three calls to the server per picture — see the note at the top of
   * `convex/chat/attachments.ts` for why it is three — and every one of them
   * happens here, before the picture is ever offered to `onSubmit`. What the
   * send receives is a list of ids the server has already said yes to.
   */
  const uploadUrl = useMutation(api.chat.attachments.uploadUrl);
  const discard = useMutation(api.chat.attachments.discard);
  const check = useAction(api.chat.attachments.check);
  const picker = useRef<HTMLInputElement>(null);

  const [attached, setAttached] = useState<Attached[]>([]);

  /**
   * What the tray last held, kept while it closes.
   *
   * The tray's height is animated by the grid trick below — a row that goes
   * from `1fr` to `0fr` — and a row shrinking over nothing is a row that is
   * already gone. So the last thumbnails stay drawn under the closing row
   * until `onTransitionEnd` says it has shut. Set during render, which is
   * the sanctioned shape for state that mirrors other state.
   */
  const [ghost, setGhost] = useState<Attached[]>([]);
  if (attached.length > 0 && ghost !== attached) setGhost(attached);

  /**
   * Previews whose thumbnails are still on screen as ghosts. Revoking them
   * the moment they left the tray drew broken images for the length of the
   * close; they are released when it has finished.
   */
  const retired = useRef<string[]>([]);

  function releaseRetired() {
    for (const url of retired.current) URL.revokeObjectURL(url);
    retired.current = [];
  }

  /**
   * How many the tray holds, counted the moment a file is accepted rather
   * than when its row appears in state. Six files dropped at once arrive in
   * one event, and the cap has to be applied across them before any has
   * finished decoding.
   */
  const count = useRef(0);

  /**
   * Keys taken out of the tray while their upload was still out.
   *
   * An upload cannot be cancelled, only disowned: the bytes finish landing,
   * and whichever step comes next finds the key here and stops. A file that
   * was never claimed is the sweep's; one that was claimed is discarded on
   * the spot.
   */
  const removed = useRef(new Set<string>());

  /** The tray as of the last render, for the unmount below. */
  const tray = useRef<Attached[]>([]);
  useEffect(() => {
    tray.current = attached;
  }, [attached]);

  // Leaving the conversation with pictures in the box. Their previews are
  // memory and their rows are storage, and neither is coming back — the
  // rows would be swept within the hour, but a cross that was never pressed
  // should not cost an hour of a file.
  useEffect(() => {
    return () => {
      for (const entry of tray.current) {
        URL.revokeObjectURL(entry.preview);
        if (entry.attachmentId !== undefined) {
          void discard({ attachmentId: entry.attachmentId });
        }
      }
      for (const url of retired.current) URL.revokeObjectURL(url);
    };
  }, [discard]);

  function patch(key: string, changes: Partial<Attached>) {
    setAttached((list) =>
      list.map((entry) =>
        entry.key === key ? { ...entry, ...changes } : entry,
      ),
    );
  }

  /**
   * Out of the tray, one seat freed, and the preview released — now if the
   * thumbnail vanishes at once, later if it is the last one and the tray is
   * about to close over it. See `retired`.
   */
  function drop(key: string) {
    count.current = Math.max(0, count.current - 1);
    setAttached((list) => {
      const entry = list.find((candidate) => candidate.key === key);
      const rest = list.filter((candidate) => candidate.key !== key);
      if (entry !== undefined) {
        if (rest.length === 0) retired.current.push(entry.preview);
        else URL.revokeObjectURL(entry.preview);
      }
      return rest;
    });
  }

  function fail(key: string, message: string) {
    drop(key);
    setNotice(message);
  }

  async function attach(file: File) {
    const key = crypto.randomUUID();

    const prepared = await prepareImage(file);
    if (prepared === null) {
      count.current = Math.max(0, count.current - 1);
      setNotice("That picture could not be read.");
      return;
    }

    const preview = URL.createObjectURL(prepared.blob);
    setAttached((list) => [
      ...list,
      {
        key,
        preview,
        width: prepared.width,
        height: prepared.height,
        state: "uploading",
      },
    ]);

    try {
      const slot = await uploadUrl({});
      if (!slot.ok) {
        fail(key, refusalMessage(slot.refusal));
        return;
      }

      const response = await fetch(slot.url, {
        method: "POST",
        headers: { "Content-Type": prepared.blob.type },
        body: prepared.blob,
      });
      if (!response.ok) {
        fail(key, refusalMessage("image"));
        return;
      }
      const { storageId } = (await response.json()) as {
        storageId: Id<"_storage">;
      };

      // Taken out while the bytes were going up. Nothing claimed it, so
      // there is nothing to discard; the sweep reclaims the file.
      if (removed.current.delete(key)) return;

      patch(key, { state: "checking" });
      const verdict = await check({
        storageId,
        width: prepared.width,
        height: prepared.height,
      });

      // Taken out while the classifier was looking. It is claimed now, so
      // if it passed it has a row to release.
      if (removed.current.delete(key)) {
        if (verdict.ok) void discard({ attachmentId: verdict.attachmentId });
        return;
      }

      if (!verdict.ok) {
        fail(key, refusalMessage(verdict.refusal));
        return;
      }
      patch(key, { state: "ready", attachmentId: verdict.attachmentId });
    } catch {
      fail(key, refusalMessage("image"));
    }
  }

  /**
   * The one way pictures get in, whether they were picked, pasted, or
   * dropped. Files that are not pictures are ignored rather than refused —
   * a paste of a spreadsheet cell has a file in it that nobody meant to send.
   */
  function addFiles(files: File[]) {
    if (!pictures || shut) return;
    const images = files.filter(isImageFile);
    if (images.length === 0) return;

    const room = MAX_IMAGES_PER_MESSAGE - count.current;
    if (images.length > room) setNotice(TOO_MANY);

    for (const file of images.slice(0, Math.max(0, room))) {
      count.current += 1;
      void attach(file);
    }
  }

  useImperativeHandle(ref, () => ({ addFiles }));

  function remove(entry: Attached) {
    if (entry.attachmentId !== undefined) {
      void discard({ attachmentId: entry.attachmentId });
    } else {
      removed.current.add(entry.key);
    }
    drop(entry.key);
  }

  function onPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = [...event.clipboardData.files].filter(isImageFile);
    if (files.length === 0) return;
    // A pasted picture is the paste; the browser would otherwise also drop
    // its filename into the box as text.
    event.preventDefault();
    addFiles(files);
  }

  function onPick(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files === null ? [] : [...event.target.files];
    // Cleared so picking the same file twice fires twice.
    event.target.value = "";
    addFiles(files);
  }

  const ready = attached.filter((entry) => entry.state === "ready");
  const waiting = ready.length !== attached.length;
  const canSend =
    !shut && !waiting && (shown.trim() !== "" || ready.length > 0);

  async function submit() {
    if (!canSend) return;
    const text = shown.trim();
    const sending = ready;

    // Nothing further may arrive into a box that has just been emptied.
    dictation.abort();
    setBody("");
    setAttached([]);
    count.current = 0;
    setNotice(null);

    // Every entry in `sending` is `ready`, and `ready` always carries an id —
    // see `Attached`. The filter is for the type, not for a case.
    const proven = sending.flatMap((entry) =>
      entry.attachmentId === undefined
        ? []
        : [{ ...entry, attachmentId: entry.attachmentId }],
    );

    const refusal = await onSubmit(
      text,
      proven.map((entry) => entry.attachmentId),
      proven.map((entry) => ({
        attachmentId: entry.attachmentId,
        url: entry.preview,
        width: entry.width,
        height: entry.height,
      })),
    );

    if (refusal === null) {
      // The real rows are on screen by now — see `submit` in `Thread` for why
      // that is a guarantee and not a race. The previews are not revoked:
      // they are what the real rows will be drawn with, see `rememberPreview`.
      for (const entry of proven) {
        rememberPreview(entry.attachmentId, entry.preview);
      }
      return;
    }

    setNotice(refusalMessage(refusal));
    // Handed back rather than dropped. Somebody who wrote three sentences and
    // hit a rule on one word should not have to write them again.
    setBody(text);

    if (refusal === "image" || refusal === "too-many-images") {
      // The rows are gone — swept, or discarded from another tab. The
      // pictures have to be added again, so the previews go.
      for (const entry of sending) URL.revokeObjectURL(entry.preview);
    } else {
      // Refused for the words. The pictures are still `ready` on the server
      // and come back into the tray with the text.
      setAttached(sending);
      count.current = sending.length;
    }
    field.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    void submit();
  }

  function toggleDictation() {
    setNotice(null);
    if (live) dictation.stop();
    else dictation.start();
  }

  return (
    <div className="px-3 pb-3 sm:px-8 lg:px-14 xl:px-20">
      {/* Refusals, and the few dictation failures worth a sentence.

          For refusals: the category and never the rule. See `refusalMessage`
          in `src/lib/chat.ts` — telling somebody exactly which word tripped is
          telling them how to spell it next time.

          Over the composer rather than under it, so it reads as the message
          coming back rather than as a line of small print. */}
      {notice === null ? null : (
        <div className="flex justify-center pb-2">
          <p
            role="alert"
            className="animate-notice-in max-w-full rounded-full border border-destructive/30 bg-surface px-3.5 py-1.5 text-center text-[0.8125rem] text-destructive shadow-[0_2px_8px_rgba(15,15,15,0.06)]"
          >
            {notice}
          </p>
        </div>
      )}

      {/* One radius whatever is in it. At a single line the box is fifty
          pixels tall, so a 25px corner *is* the pill; with a tray above or a
          paragraph in it, the same corner is a card. It used to switch
          between `rounded-full` and this, and animating a radius from nine
          thousand pixels to twenty-five is a shape doing something strange
          on the way. */}
      <div className="flex flex-col rounded-[25px] border border-border bg-surface shadow-[0_1px_2px_rgba(15,15,15,0.04),0_4px_12px_rgba(15,15,15,0.08),0_12px_28px_-8px_rgba(15,15,15,0.14)] transition-[border-color,box-shadow] focus-within:border-primary focus-within:shadow-[0_1px_2px_rgba(15,15,15,0.04),0_6px_16px_rgba(15,15,15,0.1),0_16px_36px_-8px_rgba(15,15,15,0.18)]">
        {/* The tray opens and closes by height. A grid row can go from
            `0fr` to `1fr` and back, and unlike `height: auto` a browser can
            draw the frames in between; the inner box clips what does not fit
            yet. The padding is inside the clip so it closes with the rest. */}
        <div
          aria-hidden={attached.length === 0}
          onTransitionEnd={() => {
            if (attached.length > 0) return;
            setGhost([]);
            releaseRetired();
          }}
          className={cn(
            "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
            attached.length > 0 ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="flex gap-2 overflow-x-auto px-3 pt-3">
              {(attached.length > 0 ? attached : ghost).map((entry) => (
                <Thumb
                  key={entry.key}
                  entry={entry}
                  // A ghost is only ever drawn while the tray shuts over it;
                  // pressing its cross would remove something already gone.
                  onRemove={
                    attached.length > 0 ? () => remove(entry) : undefined
                  }
                />
              ))}
            </div>
          </div>
        </div>

        <div
          className={cn(
            "flex items-end gap-2 py-1.5 pr-1.5",
            pictures ? "pl-1.5" : "pl-4",
          )}
        >
          {/* The plus on the left, where every chat puts it. It opens the
              picker; pasting and dropping reach the same `addFiles`. */}
          {pictures ? (
            <>
              <Button
                variant="ghost"
                size="icon-lg"
                onClick={() => picker.current?.click()}
                disabled={shut || attached.length >= MAX_IMAGES_PER_MESSAGE}
                aria-label="Add a picture"
                className="rounded-full text-faint hover:text-foreground"
              >
                <PlusIcon strokeWidth={2} className="size-5" />
              </Button>
              <input
                ref={picker}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={onPick}
              />
            </>
          ) : null}

          {/* The box and its twin. The twin is absolute, so it costs the row
              no height of its own, and it is given the same width by
              `inset-x-0` — which is what makes its wrapping the box's
              wrapping. See `mirror` above. */}
          <div className="relative min-w-0 flex-1">
            <div
              ref={mirror}
              aria-hidden
              className="pointer-events-none invisible absolute inset-x-0 top-0 py-1.5 text-[0.9375rem] leading-relaxed break-words whitespace-pre-wrap"
            >
              {/* The placeholder when empty, so an empty box is one line
                  tall; a zero-width space at the end, so a trailing newline
                  counts as the line it is about to be. */}
              {shown === "" ? "Say something" : shown}
              {"​"}
            </div>
            <textarea
              ref={field}
              value={shown}
              style={{ height }}
              onChange={(event) => {
                const next = event.target.value;
                // Editing while a guess is showing: keep the guess out of `body`
                // while it is still at the end. If the edit went through it, keep
                // what was typed and let the next final land after it.
                const tail =
                  dictation.interim === ""
                    ? ""
                    : joinSpoken(" ", dictation.interim);
                setBody(
                  tail !== "" && next.endsWith(tail)
                    ? next.slice(0, -tail.length)
                    : next,
                );
                setNotice(null);
              }}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              rows={1}
              disabled={shut}
              maxLength={MAX_BODY}
              aria-label="Message"
              placeholder={
                lock !== null
                  ? PLACEHOLDER[lock]
                  : live
                    ? "Listening…"
                    : attached.length > 0
                      ? "Add a caption, or just send"
                      : "Say something"
              }
              className="block w-full resize-none overflow-y-auto bg-transparent py-1.5 text-[0.9375rem] leading-relaxed outline-none transition-[height] duration-150 ease-out placeholder:text-faint disabled:cursor-not-allowed motion-reduce:transition-none"
            />
          </div>
          {/* Absent where the browser has no recogniser (Firefox) and on the
              server, so it appears after hydration without a mismatch. The
              waveform mounts only once the recogniser has actually started,
              which is after the microphone was granted in this same tap. */}
          {dictation.supported ? (
            <Button
              variant="ghost"
              size="icon-lg"
              onClick={toggleDictation}
              disabled={shut}
              aria-pressed={live}
              aria-label={live ? "Stop dictation" : "Start dictation"}
              className={cn(
                "rounded-full",
                live
                  ? "text-destructive hover:bg-destructive/10 hover:text-destructive"
                  : "text-faint hover:text-foreground",
              )}
            >
              {dictation.state === "listening" ? (
                <Waveform />
              ) : (
                // Pulsing while arming or winding down: on, but not yet a signal.
                <MicrophoneIcon
                  className={cn("size-5", live && "animate-pulse")}
                />
              )}
            </Button>
          ) : null}
          <Button
            size="lg"
            className="rounded-full pr-3.5 pl-3"
            onClick={() => void submit()}
            disabled={!canSend}
          >
            <ArrowUpIcon
              strokeWidth={2.5}
              className="size-4 transition-transform duration-200 ease-out group-hover/button:-translate-y-0.5 motion-reduce:transition-none motion-reduce:group-hover/button:translate-y-0"
            />
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * One picture in the tray: a square of it, dimmed with a spinner over it
 * until the server has said yes, and a cross to take it out at any point.
 */
function Thumb({
  entry,
  onRemove,
}: {
  entry: Attached;
  /** Absent on a ghost — see the tray in `Composer`. */
  onRemove: (() => void) | undefined;
}) {
  const waiting = entry.state !== "ready";
  return (
    <div className="relative size-16 shrink-0 overflow-hidden rounded-xl border border-border bg-surface-muted">
      <Photo
        src={entry.preview}
        className={cn(
          "size-full object-cover transition-opacity",
          waiting && "opacity-40",
        )}
      />
      {waiting ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <Spinner aria-hidden className="size-4 text-foreground" />
        </div>
      ) : null}
      <button
        type="button"
        onClick={onRemove}
        disabled={onRemove === undefined}
        tabIndex={onRemove === undefined ? -1 : undefined}
        aria-label="Remove picture"
        className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-background/90 text-foreground shadow-[0_1px_3px_rgba(15,15,15,0.2)] outline-none transition-colors hover:bg-background focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <XMarkIcon strokeWidth={2.5} className="size-3" />
      </button>
    </div>
  );
}

/**
 * The pictures on a message.
 *
 * One is drawn at its own shape, capped in both directions so a tall photo
 * does not take the pane and a wide one does not take the column. Two to
 * four are a grid of squares, cropped — a grid of mixed shapes is a ransom
 * note, and the whole picture is one press away.
 *
 * The `width` and `height` attributes are what let the browser draw the box
 * before the bytes arrive, which is what keeps a thread from jumping as it
 * loads; they came up with the upload for exactly this.
 */
function Pictures({ images }: { images: ChatImage[] }) {
  const [open, setOpen] = useState<ChatImage | null>(null);
  const single = images.length === 1;

  return (
    <>
      <div
        className={cn(
          "grid gap-1 overflow-hidden rounded-3xl",
          single ? "grid-cols-1" : "w-64 max-w-full grid-cols-2",
        )}
      >
        {images.map((image) => (
          <button
            key={image.attachmentId}
            type="button"
            onClick={() => setOpen(image)}
            aria-label="Open picture"
            // The box is sized here, on the button, and the picture fills it.
            // Letting the picture size itself and the box wrap it looked
            // right until the picture was capped in height: the box kept the
            // width the uncapped picture would have had, and drew its grey
            // and its corners out past the edge of what was in it.
            style={single ? singleBox(image) : undefined}
            className={cn(
              "block cursor-zoom-in overflow-hidden bg-surface-muted outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset",
              !single && "aspect-square",
            )}
          >
            <Photo
              src={sourceOf(image)}
              width={image.width}
              height={image.height}
              className="size-full object-cover"
            />
          </button>
        ))}
      </div>

      {open === null ? null : (
        <Lightbox image={open} onClose={() => setOpen(null)} />
      )}
    </>
  );
}

/**
 * Where a picture is drawn from: the preview this browser uploaded when it
 * has one, and the stored file otherwise. Same pixels either way.
 */
function sourceOf(image: ChatImage): string {
  return previewFor(image.attachmentId) ?? image.url;
}

/** The longest either side of a lone picture may be, in pixels. */
const SINGLE_EDGE = 320;

/**
 * The box for a picture on its own.
 *
 * Its own shape, no larger than `SINGLE_EDGE` on either side, and never
 * larger than the picture itself — a sixty-pixel sticker is not blown up to
 * a poster. `min(100%, …)` is the column: on a narrow screen the column is
 * narrower than the cap, and the box follows it. The height comes from the
 * aspect ratio, so the width is the only number that needs deciding.
 */
function singleBox(image: ChatImage): React.CSSProperties {
  const ratio = image.width / image.height;
  const width = Math.round(
    Math.min(image.width, SINGLE_EDGE, SINGLE_EDGE * ratio),
  );
  return {
    aspectRatio: `${image.width} / ${image.height}`,
    width: `min(100%, ${width}px)`,
  };
}

/**
 * A picture, full size, over everything.
 *
 * Into `document.body`, because the thread scrolls and a fixed element
 * inside an ancestor with a transform is fixed to the ancestor. A press
 * anywhere or an Escape closes it — there is nothing to do here but look.
 */
function Lightbox({
  image,
  onClose,
}: {
  image: ChatImage;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal
      aria-label="Picture"
      onClick={onClose}
      className="animate-notice-in fixed inset-0 z-[100] flex cursor-zoom-out items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
    >
      <Photo
        src={sourceOf(image)}
        width={image.width}
        height={image.height}
        className="block h-auto max-h-full w-auto max-w-full rounded-xl object-contain shadow-[0_24px_64px_-12px_rgba(0,0,0,0.6)]"
      />
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 flex size-9 items-center justify-center rounded-full bg-white/10 text-white outline-none transition-colors hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/60"
      >
        <XMarkIcon strokeWidth={2} className="size-5" />
      </button>
    </div>,
    document.body,
  );
}
