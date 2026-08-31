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
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  GlobalUnlock,
  useRemaining,
} from "@/components/app/chat/global-unlock";
import { GroupPanel } from "@/components/app/chat/group-panel";
import { menuItemClass, popupClass } from "@/components/app/chat/menu";
import { Monogram } from "@/components/app/chat/monogram";
import { Present } from "@/components/app/chat/presence";
import { StandingBanner } from "@/components/app/chat/standing-banner";
import { useChat } from "@/components/app/chat/chat-provider";
import {
  DELETE_WINDOW_MS,
  REACTIONS,
  conversationName,
  refusalMessage,
} from "@/lib/chat";
import { useStillness } from "@/lib/motion";
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

  /** The composer's text box, which is where a message is before it is one. */
  const field = useRef<HTMLTextAreaElement>(null);

  /** The pending message's row, which is where it is after. */
  const flyer = useRef<HTMLDivElement>(null);

  /** That row's bubble, without its words — the part that is not sent. */
  const flyerFace = useRef<HTMLSpanElement>(null);

  /**
   * Where the words were on screen at the moment Send was pressed.
   *
   * A ref and not state: it is read once, by the layout effect that runs on the
   * very next commit, and nothing renders differently for it. Measured in the
   * handler rather than in that effect because by then the textarea has been
   * emptied and has collapsed back to one line — the top of the text somebody
   * wrote is only knowable while it is still written.
   */
  const launch = useRef<{ x: number; y: number } | null>(null);

  const still = useStillness();

  /** Whether the reader is at the live end. See the note above. */
  const pinned = useRef(true);

  /** Returns the refusal to show, or `null` when it went. */
  async function submit(text: string): Promise<string | null> {
    if (profile === null || userId === null || userId === undefined)
      return null;

    const box = still ? undefined : field.current?.getBoundingClientRect();
    launch.current =
      box === undefined ? null : { x: box.left, y: box.top + FIELD_PAD_Y };

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

  // Before the paint rather than after it. A thread opens at its live end, and
  // an effect that runs after the browser has drawn shows one frame of the top
  // of the conversation before it jumps. It also has to be settled before the
  // flight below measures anything: the message's destination is a position in
  // a box that is about to be scrolled.
  useLayoutEffect(() => {
    const element = scroller.current;
    if (element === null || !pinned.current) return;
    element.scrollTop = element.scrollHeight;
  }, [conversationId, newest, pending, results.length]);

  /**
   * The message travelling from the box it was typed in to the place it sits.
   *
   * Sending is the one moment in this app where a thing you made moves, and it
   * moves rather than appears because those are two different claims: a bubble
   * that fades in at the bottom of the thread is a message *arriving*, which is
   * what everybody else's do, and this one did not arrive — it left.
   *
   * ## What travels is the words
   *
   * The thing that leaves the composer is the sentence, at the size and weight
   * it was typed at, starting exactly where it was sitting a frame ago — not a
   * bubble that appears near the Send button and slides. The bubble is drawn
   * around the words on the way, from nothing at the start to a full face by
   * the time they land, so the handoff from the field is the same text carrying
   * on rather than one object being swapped for another. That is the whole
   * reason the face is a layer of its own — see `MessageRow`.
   *
   * Nothing is scaled: the composer and the bubble set text at the same size,
   * which is what lets this be a translation and not an effect. The launch
   * point is the top-left of the *text* in the field, and the landing point the
   * top-left of the text in the bubble, so the words never jump at either end.
   *
   * It is the real row that moves, not a copy of it flown over the top. The
   * copy is the usual way to do this and it is worse in every way that matters:
   * two elements holding the same sentence, one of which has to be hidden at
   * exactly the frame the other stops. Here the row renders where it belongs,
   * is pushed back to where the words already were, and released.
   *
   * ## Three things that make it a movement rather than a stutter
   *
   * It is lifted over the composer for the trip. The composer is an opaque bar
   * on its own blur at `z-10`, and a message that starts underneath it spends
   * the first half of the journey invisible and appears halfway up the pane out
   * of nothing.
   *
   * It is composited. The bubble is a gradient, a border, two inset shadows and
   * a drop shadow — see `.bubble-mine` in `globals.css` — and re-rasterising
   * that on every frame is what turns a move into a sequence of positions.
   * `will-change` hands both layers to the GPU for the length of the trip and
   * takes them back after, so the hint never outlives the motion.
   *
   * Both animations are single animations rather than transitions between two
   * inline styles. A transition has to be started by writing one value, forcing
   * the browser to notice it, then writing another; the middle step is a
   * synchronous layout read in the frame the message is sent, which is exactly
   * the frame that can least afford one.
   *
   * The push has to be measured before the browser paints — hence a layout
   * effect — or there is a frame of the message at its destination before it
   * goes back to fetch itself.
   */
  useLayoutEffect(() => {
    const element = flyer.current;
    const face = flyerFace.current;
    const from = launch.current;
    launch.current = null;
    if (element === null || face === null || from === null) return;

    const box = face.getBoundingClientRect();
    const dx = from.x - (box.left + BUBBLE_PAD_X);
    const dy = from.y - (box.top + BUBBLE_PAD_Y);

    element.style.position = "relative";
    element.style.zIndex = "20";
    element.style.willChange = "transform, opacity";
    face.style.willChange = "opacity";

    const timing: KeyframeAnimationOptions = {
      duration: FLIGHT_MS,
      // Most of the distance in the first third and a long settle after it. A
      // message leaves quickly — the send was a keystroke — and an even glide
      // across the pane reads as the app moving it rather than as it going.
      easing: "cubic-bezier(0.16, 1, 0.3, 1)",
    };

    const flight = element.animate(
      [
        // Full weight at the start, because at the start it is still the thing
        // in the composer, which was never dimmed. It lands at the half opacity
        // the class on it carries, which is where the animation stops writing.
        { transform: `translate(${dx}px, ${dy}px)`, opacity: 1 },
        { transform: "translate(0px, 0px)", opacity: 0.5 },
      ],
      timing,
    );

    // Held off until the words are clear of the composer. A face that starts
    // growing immediately is a bubble sliding out of the text box, which is the
    // one reading this is trying not to have.
    const forming = face.animate(
      [{ opacity: 0 }, { opacity: 0, offset: 0.3 }, { opacity: 1 }],
      timing,
    );

    const land = () => {
      element.style.position = "";
      element.style.zIndex = "";
      element.style.willChange = "";
      face.style.willChange = "";
    };

    // `finished` rejects when an animation is cancelled, which is what happens
    // when the server confirms mid-flight and this row is replaced by the real
    // one. There is nothing to clean up in that case — the elements are gone —
    // but an unhandled rejection would be reported as if there were.
    flight.finished.then(land, () => {});

    return () => {
      flight.cancel();
      forming.cancel();
      land();
    };
  }, [pending]);

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
            message. Held at reduced opacity so it reads as in flight rather
            than as sent — and it may still be refused. */}
        {pending === null ? null : (
          <div ref={flyer} className="opacity-50">
            <MessageRow
              message={pending}
              previous={ordered[ordered.length - 1]}
              mine
              canAct={false}
              faceRef={flyerFace}
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
          fieldRef={field}
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
  faceRef,
}: {
  message: ChatMessage;
  previous: ChatMessage | undefined;
  mine: boolean;
  canAct: boolean;
  // Only the message in flight passes one. See the flight in `Thread`: the
  // words travel on their own and the bubble is drawn around them as they
  // land, which needs the two to be separately reachable.
  faceRef?: RefObject<HTMLSpanElement | null>;
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
              "relative rounded-3xl px-3.5 py-2 text-[0.9375rem] leading-relaxed break-words whitespace-pre-wrap",
              mine
                ? "font-semibold text-primary-foreground"
                : "text-foreground",
            )}
          >
            {/* The bubble itself, behind the words rather than around them.
                One element for the face and one for the text is what lets a
                message be sent as the words alone and become a bubble on
                arrival — and it costs nothing the rest of the time, because
                an inset layer is the same rectangle the padding already
                described. The text is positioned too, and after it, so it
                paints over the face rather than under it. */}
            <span
              ref={faceRef}
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

/** How long the message takes to travel. Long enough to be followed and short
 *  enough that the next one can be typed over the top of it. */
const FLIGHT_MS = 300;

/** The bubble's own padding, which is `px-3.5 py-2` in pixels, and the field's
 *  `py-1.5`. The flight lines up the two pieces of *text*, not the two boxes
 *  around them — a bubble is padded and a textarea is barely padded at all, so
 *  matching their corners would leave the words a few pixels adrift at both
 *  ends of the move, which is the part anybody would notice. */
const BUBBLE_PAD_X = 14;
const BUBBLE_PAD_Y = 8;
const FIELD_PAD_Y = 6;

function Composer({
  onSubmit,
  lock,
  fieldRef,
}: {
  onSubmit: (text: string) => Promise<string | null>;
  lock: Lock;
  // Held by the thread, because the thread is what needs to know where a
  // message was typed in order to move it out of here.
  fieldRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const shut = lock !== null;
  const [body, setBody] = useState("");
  const [refused, setRefused] = useState<string | null>(null);
  const field = fieldRef;

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
