"use client";

import {
  ArrowLeftIcon,
  Cog6ToothIcon,
  GlobeAltIcon,
  NoSymbolIcon,
  PlusIcon,
  UserGroupIcon,
  UserPlusIcon,
} from "@heroicons/react/24/solid";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Monogram } from "@/components/app/chat/monogram";
import { OptionTiles } from "@/components/app/chat/option-tiles";
import { FoundNobody, Searching } from "@/components/app/chat/searching";
import { SectionLabel } from "@/components/app/chat/section-label";
import { useChat } from "@/components/app/chat/chat-provider";
import { groupNameError } from "@/lib/chat";
import {
  AVATAR_HUES,
  MAX_HANDLE_CHANGES,
  MAX_INITIALS,
  changesLeftLabel,
  claimError,
  handleShapeError,
} from "@/lib/chat";
import { CHAT_HREF } from "@/lib/nav";
import { cn } from "@/lib/utils";
import type { Icon } from "@/lib/icons";
import { api } from "../../../../convex/_generated/api";

/**
 * Everything that is not a conversation, folded into the top of the list.
 *
 * This was a page — `/dashboard/chat/people` — and being a page was the
 * problem. Adding somebody, changing who may reach you and starting a group are
 * all things you do *while* looking at your conversations, and each of them
 * took the list away to do it. So they open here instead, in the same gesture
 * the rail's invite and agreement cards use: the surface grows, the thing you
 * came for is inside it, and the conversation you were reading is still behind.
 *
 * The mechanics are lifted from `InviteCard` deliberately, so the two read as
 * the same object doing the same thing. A `ResizeObserver` keeps the panel's
 * natural height in state and the wrapper transitions to that number — `height:
 * auto` cannot be interpolated, and the `0fr`/`1fr` grid trick squashes the
 * contents on the way through. Measuring means the panel also re-settles when
 * its contents change size under it, which here happens constantly: every
 * keystroke in the search field changes how many results are under it.
 *
 * One panel and three buttons rather than three panels. Opening one closes the
 * others, because they are three answers to "what do you want to do" and having
 * two of them open at once is a list you have to scroll past to reach your
 * conversations.
 */

type Panel = "people" | "settings" | "group";

/**
 * The three, in the order they sit in the header.
 *
 * `label` is what the button is called to a screen reader; `title` is what the
 * header calls the panel while it is open. They differ where the button names
 * an action and the open panel names a place: the cog is "Chat settings" to
 * press and "Settings" once you are in it.
 *
 * Solid in every state, and so no `IconPair` — these do not use weight to say
 * which one is chosen, because while one is chosen the other two are not on
 * screen to be told apart from it.
 */
const TOOLS: readonly {
  panel: Panel;
  label: string;
  title: string;
  icon: Icon;
}[] = [
  { panel: "people", label: "Add someone", title: "Friends", icon: UserPlusIcon },
  {
    panel: "settings",
    label: "Chat settings",
    title: "Settings",
    icon: Cog6ToothIcon,
  },
  { panel: "group", label: "New group", title: "New group", icon: PlusIcon },
];

export function ChatTools({
  onOpenChange,
}: {
  /**
   * Told whenever a panel opens or closes, because the list below is the
   * caller's and an open panel replaces it. See `ConversationList`.
   */
  onOpenChange?: (open: boolean) => void;
}) {
  const router = useRouter();
  const { waiting } = useChat();

  const [open, setOpen] = useState<Panel | null>(null);
  // What the panel is drawing. Held separately from `open` so the contents do
  // not vanish on the frame the panel starts closing — a panel that empties
  // itself and then collapses reads as two animations, and the second one is
  // measuring against nothing.
  const [shown, setShown] = useState<Panel>("people");
  const [panelHeight, setPanelHeight] = useState(0);

  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(null), []);

  function toggle(panel: Panel) {
    setShown(panel);
    setOpen((current) => (current === panel ? null : panel));
  }

  useEffect(() => {
    onOpenChange?.(open !== null);
  }, [open, onOpenChange]);

  // Measured before the browser paints, and keyed on what is about to be in
  // there. The ResizeObserver below cannot do this job on its own: it delivers
  // its callback *after* the render that swapped `shown`, so the frame the
  // panel starts opening on is aimed at the previous panel's height and only
  // corrects one frame later. That re-aim mid-flight is what read as the panel
  // hesitating before its contents arrived.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (panel) setPanelHeight(panel.offsetHeight);
  }, [shown, open]);

  // And this keeps it honest afterwards, for the changes no render of ours
  // announces — every keystroke in the search field changes how many results
  // are under it, and a query landing adds rows to a panel already open.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const observer = new ResizeObserver(() => setPanelHeight(panel.offsetHeight));
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (open === null) return;

    // `pointerdown` rather than `click`, so the panel is on its way out by the
    // time whatever was clicked responds rather than a frame behind it.
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) close();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  /** Opening a conversation is always the end of whatever the panel was for. */
  const go = useCallback(
    (conversationId: string) => {
      close();
      router.push(`${CHAT_HREF}/${conversationId}`);
    },
    [close, router],
  );

  return (
    <div ref={rootRef} className="shrink-0">
      <div className="flex items-center px-4 pt-4 pb-2">
        {/* What this column is called when it is a list of conversations.
            While a panel is open it is not that, so the header says which of
            the three you are in instead. */}
        <h2 className="min-w-0 flex-1 truncate text-[1.0625rem] font-semibold">
          {open === null
            ? "My Groups"
            : TOOLS.find((tool) => tool.panel === open)!.title}
        </h2>

        {/* Three while none is open, one while one is. The one left is the
            way out of it, so the row is never both a set of choices and a
            choice already made. */}
        {TOOLS.map((tool) => (
          <Tool
            key={tool.panel}
            icon={tool.icon}
            label={tool.label}
            active={open === tool.panel}
            collapsed={open !== null && open !== tool.panel}
            badge={tool.panel === "people" ? waiting : undefined}
            controls={panelId}
            onClick={() => toggle(tool.panel)}
          />
        ))}
      </div>

      <div
        id={panelId}
        inert={open === null}
        style={{ height: open === null ? 0 : panelHeight }}
        className="overflow-hidden transition-[height] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
      >
        {/* The contents fade in from the first frame and out faster than the
            shape closes. They used to be held back until the panel had most of
            its height, and waiting a fifth of a second to be shown what you
            just asked for is not restraint, it is lag. Out is still quicker
            than in: sliding text up behind a closing edge is the part that
            reads as clunky, so it is gone before the edge reaches it.

            There is no rule under it: the list it used to be divided from is
            hidden for as long as this is open, and a hairline over nothing is
            just a stray line. */}
        <div
          ref={panelRef}
          className={cn(
            "px-3 pb-3 transition-opacity",
            open === null ? "opacity-0 duration-100" : "opacity-100 duration-200",
          )}
        >
          {shown === "people" ? (
            <PeoplePanel open={open === "people"} onOpen={go} />
          ) : shown === "settings" ? (
            <SettingsPanel />
          ) : (
            <NewGroupPanel open={open === "group"} onCreated={go} />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * One of the three, and — once one of them is open — the only one.
 *
 * Opening a panel does three things to this row at once, all on the same
 * curve: the two that were not chosen go to zero width and take their margins
 * with them, the chosen one widens, and what is drawn inside it crosses from
 * its own glyph to an arrow and the word Back. Width is what animates, so the
 * numbers are literal (`size-8` closed, `w-[4.75rem]` open) rather than
 * `auto` — `auto` is not a value CSS can interpolate towards, and the whole
 * point of the gesture is that the row narrows to one thing in front of you
 * instead of swapping.
 *
 * Both faces are drawn at once, stacked and cross-faded, and both are pinned
 * to the right edge at their own fixed width. That is what keeps the glyph
 * still while the box grows around it: laid out normally it would be centred,
 * and centring inside a box that is changing width means sliding.
 *
 * `inert` on the collapsed two rather than merely `opacity-0`: a zero-width
 * button is still in the tab order, and tabbing into something you cannot see
 * is worse than not being able to reach it.
 */
function Tool({
  icon: Glyph,
  label,
  active,
  collapsed,
  badge,
  controls,
  onClick,
}: {
  icon: Icon;
  label: string;
  active: boolean;
  collapsed: boolean;
  badge?: number;
  controls: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      inert={collapsed}
      aria-label={active ? "Back" : label}
      aria-expanded={active}
      aria-controls={controls}
      className={cn(
        "relative ml-0.5 flex h-8 shrink-0 cursor-pointer items-center overflow-hidden rounded-lg outline-none transition-[width,margin,opacity,background-color,color] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset",
        collapsed
          ? "ml-0 w-0 opacity-0"
          : active
            ? "w-[4.75rem] bg-foreground/[0.08] text-foreground"
            : "w-8 text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 right-0 flex w-8 items-center justify-center transition-opacity duration-200",
          active ? "opacity-0" : "opacity-100",
        )}
      >
        <Glyph className="size-5" />
        {badge !== undefined && badge > 0 ? (
          <span className="absolute top-1 right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-1 text-[0.5625rem] leading-none font-semibold text-primary-foreground tabular-nums">
            {badge}
          </span>
        ) : null}
      </span>

      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 right-0 flex w-[4.75rem] items-center justify-center gap-1.5 transition-opacity duration-200",
          active ? "opacity-100 delay-100" : "opacity-0",
        )}
      >
        <ArrowLeftIcon className="size-4 shrink-0" />
        <span className="text-[0.875rem] font-medium whitespace-nowrap">
          Back
        </span>
      </span>
    </button>
  );
}

/**
 * Find somebody, answer the people who found you, and reach the friends you
 * are not currently in a conversation with.
 *
 * In that order, because it is the order of how likely each one is to be why
 * the panel was opened, and because the requests move — a list that grows a row
 * above the thing you are typing into would push the field under your cursor.
 */
function PeoplePanel({
  open,
  onOpen,
}: {
  open: boolean;
  onOpen: (conversationId: string) => void;
}) {
  const field = useRef<HTMLInputElement>(null);
  const [term, setTerm] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  // What is being searched for, which is not what is in the field. Every
  // keystroke used to be its own query, and the half-typed ones mostly match
  // nobody — so "Nobody by that handle" flashed up between the letters of a
  // handle that does exist. It says something definite, and it has no business
  // saying it while you are still talking.
  const [query, setQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setQuery(term.trim()), 250);
    return () => clearTimeout(timer);
  }, [term]);

  const found = useQuery(
    api.chat.profiles.search,
    open && query.length >= 2 ? { term: query } : "skip",
  );
  const friends = useQuery(api.chat.friends.list, open ? {} : "skip");
  const pending = useQuery(api.chat.friends.pending, open ? {} : "skip");
  const invitations = useQuery(api.chat.groups.invitations, open ? {} : "skip");

  const request = useMutation(api.chat.friends.request);
  const accept = useMutation(api.chat.friends.accept);
  const remove = useMutation(api.chat.friends.remove);
  const respond = useMutation(api.chat.groups.respondToInvite);
  const openDm = useMutation(api.chat.conversations.openDm);

  // Opening this is the whole of the intent — nobody expands it to admire it.
  useEffect(() => {
    if (open) field.current?.focus();
  }, [open]);

  async function message(peerClerkId: string) {
    const result = await openDm({ peerClerkId });
    if (result.ok) {
      onOpen(result.conversationId);
      return;
    }
    setNotice(
      result.reason === "not-friends"
        ? "They only take messages from friends. Send a request first."
        : result.reason === "closed"
          ? "They are not taking direct messages."
          : result.reason === "blocked"
            ? "You cannot message this person."
            : "That did not work.",
    );
  }

  const incoming = (pending ?? []).filter((row) => !row.outgoing);
  const outgoing = (pending ?? []).filter((row) => row.outgoing);

  // Two questions, and only the second one may be answered out loud. The
  // section is open from the second character; what is under it is a wait
  // until the field has settled *and* the answer to that exact term is in —
  // `useQuery` goes back to `undefined` when its argument changes, so this is
  // also false for the round trip after the debounce.
  const searching = term.trim().length >= 2;
  const settled = query === term.trim() && found !== undefined;

  return (
    <div className="pt-3">
      <input
        ref={field}
        value={term}
        onChange={(event) => {
          setTerm(event.target.value.toLowerCase());
          setNotice(null);
        }}
        placeholder="Find someone by handle"
        spellCheck={false}
        autoComplete="off"
        maxLength={20}
        aria-label="Find someone by handle"
        className="h-9 w-full rounded-lg border border-border bg-background px-3 text-[0.875rem] transition-[border-color,box-shadow] outline-none placeholder:text-faint focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
      />

      {notice === null ? null : (
        <p role="status" className="mt-2 text-[0.8125rem] text-destructive">
          {notice}
        </p>
      )}

      <div className="max-h-72 overflow-y-auto">
        {searching ? (
          <section className="pt-3">
            <SectionLabel>Found</SectionLabel>

            {!settled ? (
              <Searching />
            ) : found.length === 0 ? (
              <FoundNobody />
            ) : (
              <ul className="mt-1 flex flex-col">
                {found.map((person) => (
                  <Row
                    key={person.clerkId}
                    handle={person.handle}
                    hue={person.avatarHue}
                    initials={person.avatarInitials}
                  >
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() =>
                        void request({ peerClerkId: person.clerkId })
                      }
                    >
                      Add
                    </Button>
                    <Button
                      size="xs"
                      className="shadow-none hover:shadow-none"
                      onClick={() => void message(person.clerkId)}
                    >
                      Message
                    </Button>
                  </Row>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        {incoming.length > 0 ? (
          <Group label="Waiting on you">
            {incoming.map((row) => (
              <Row
                key={row.clerkId}
                handle={row.handle}
                hue={row.avatarHue}
                initials={row.avatarInitials}
              >
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => void remove({ peerClerkId: row.clerkId })}
                >
                  No
                </Button>
                <Button
                  size="xs"
                  className="shadow-none hover:shadow-none"
                  onClick={() => void accept({ peerClerkId: row.clerkId })}
                >
                  Accept
                </Button>
              </Row>
            ))}
          </Group>
        ) : null}

        {(invitations ?? []).length > 0 ? (
          <Group label="Group invitations">
            {(invitations ?? []).map((invitation) => (
              <Row
                key={invitation.conversationId}
                handle={invitation.title}
                detail={
                  invitation.invitedBy === undefined
                    ? undefined
                    : `from ${invitation.invitedBy}`
                }
              >
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() =>
                    void respond({
                      conversationId: invitation.conversationId,
                      accept: false,
                    })
                  }
                >
                  No
                </Button>
                <Button
                  size="xs"
                  className="shadow-none hover:shadow-none"
                  onClick={() =>
                    void respond({
                      conversationId: invitation.conversationId,
                      accept: true,
                    })
                  }
                >
                  Join
                </Button>
              </Row>
            ))}
          </Group>
        ) : null}

        {!searching ? (
          <Group label="Friends">
            {(friends ?? []).map((friend) => (
              <Row
                key={friend.clerkId}
                handle={friend.handle}
                hue={friend.avatarHue}
                initials={friend.avatarInitials}
              >
                {/* Swapped rather than shown side by side, the way the invite
                    card's Revoke is: the row never changes width on hover. */}
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => void remove({ peerClerkId: friend.clerkId })}
                  className="hidden text-muted-foreground group-hover/row:inline-flex hover:text-destructive"
                >
                  Remove
                </Button>
                <Button
                  size="xs"
                  className="shadow-none hover:shadow-none"
                  onClick={() => void message(friend.clerkId)}
                >
                  Message
                </Button>
              </Row>
            ))}
            {friends !== undefined && friends.length === 0 ? (
              <Empty>No friends… yet.</Empty>
            ) : null}
          </Group>
        ) : null}

        {outgoing.length > 0 && !searching ? (
          <p className="pt-2 text-[0.8125rem] text-faint">
            Waiting on {outgoing.map((row) => row.handle).join(", ")}.
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Who can see you, who can reach you, and who you have shut out.
 *
 * `friends` is the default and it is the load-bearing default of the whole
 * feature: a stranger who finds your handle cannot open a conversation with
 * you, only ask. It commits on click — there is no Save, the way there is none
 * on anything else in this app's chrome.
 *
 * The three are not a list of three equal things, so they are not drawn as
 * one. `friends` is where nearly everybody is and where nearly everybody
 * stays, so it gets the full width and the sentence explaining itself; the two
 * ways of leaving it share the row above and go by their names alone, which in
 * a section headed "Who can reach you" is the whole of what they mean. It sits
 * under them rather than over them because it is the floor of the section: the
 * thing you come back down to.
 */
function SettingsPanel() {
  const { profile } = useChat();
  const blocked = useQuery(api.chat.blocks.list, {});
  const setDmPolicy = useMutation(api.chat.profiles.setDmPolicy);
  const setDiscoverable = useMutation(api.chat.profiles.setDiscoverable);
  const unblock = useMutation(api.chat.blocks.unblock);

  const setPolicy = useCallback(
    (policy: DmPolicy) => void setDmPolicy({ policy }),
    [setDmPolicy],
  );

  const policy = profile?.dmPolicy;

  return (
    <div className="pt-3">
      <SectionLabel>Me</SectionLabel>
      <Me />

      <div className="mt-7">
        <SectionLabel>Who can reach you</SectionLabel>
      </div>

      <OptionTiles
        value={policy}
        onPick={setPolicy}
        className="mt-1.5 grid grid-cols-2 gap-1"
        options={[
          { value: "anyone", label: "Anyone", icon: GlobeAltIcon },
          { value: "nobody", label: "Nobody", icon: NoSymbolIcon },
          {
            // The detail line is the only difference between the wide one and
            // the narrow pair — half of a 288px column will not wrap "Strangers
            // have to ask first." into fewer than four lines, and under a
            // heading that already says who this is about, "Anyone" and
            // "Nobody" need no gloss.
            value: "friends",
            label: "Friends only",
            detail: "Strangers have to ask first.",
            icon: UserGroupIcon,
            className: "col-span-2",
          },
        ]}
      />

      <div className="mt-7">
        <SectionLabel>Who can find you</SectionLabel>
      </div>

      <label className="mt-1.5 flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-foreground/[0.04]">
        <span className="min-w-0 flex-1">
          <span className="block text-[0.875rem] font-medium">
            Findable by handle
          </span>
          <span className="block text-[0.8125rem] leading-snug text-muted-foreground">
            Off, and only people who already know you can find you.
          </span>
        </span>
        <Switch
          checked={profile?.discoverable ?? true}
          onCheckedChange={(checked) =>
            void setDiscoverable({ discoverable: checked })
          }
        />
      </label>

      {(blocked ?? []).length > 0 ? (
        <div className="mt-4">
          <Group label="Blocked">
            {(blocked ?? []).map((person) => (
              <Row key={person.clerkId} handle={person.handle}>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => void unblock({ peerClerkId: person.clerkId })}
                >
                  Unblock
                </Button>
              </Row>
            ))}
          </Group>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Your disc and your handle, which are the only two things about you that
 * anybody else can see.
 *
 * They are set here on very different terms, and the panel says so by how it
 * treats them. The disc — a colour off the wheel and up to two letters — commits
 * the instant you touch it and has no allowance on it, because a colour and two
 * letters are not a name: nothing points at them and nobody remembers you by
 * them. The handle has a Save, which is the only Save in this app's chrome, and
 * it is there precisely because this is the one control that spends something
 * you cannot get back.
 *
 * The preview is the same `Monogram` every list draws, at a larger size and
 * fed from local state rather than from the profile — so the disc changes under
 * your hand rather than after the round trip.
 *
 * What renaming does *not* do is rewrite what you have already said. Messages
 * carry the handle they were sent under (see `convex/chat/profiles.ts`), so old
 * ones keep the old name. That is the denormalisation the thread is built on,
 * and it is also the honest record.
 */
function Me() {
  const { profile } = useChat();
  const rename = useMutation(api.chat.profiles.renameHandle);
  const setAvatar = useMutation(api.chat.profiles.setAvatar);

  const spent = profile?.handleChanges ?? 0;
  const left = MAX_HANDLE_CHANGES - spent;
  const current = profile?.handle ?? "";

  const [hue, setHue] = useState(profile?.avatarHue);
  const [initials, setInitials] = useState(profile?.avatarInitials ?? "");

  const [handle, setHandle] = useState(current);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Follows a rename that lands, and any change made in another tab. Keyed on
  // the server's value rather than set from the mutation's result, so there is
  // one source for what the field says.
  //
  // Adjusted during render rather than in an effect: this is state derived from
  // a prop changing, and React re-runs the component before touching the DOM
  // rather than painting the stale value and correcting it. An effect here
  // would be a cascading render, and is what the lint rule is about.
  const [seen, setSeen] = useState(current);
  if (seen !== current) {
    setSeen(current);
    setHandle(current);
  }

  const trimmed = initials.trim();
  const worn = trimmed === "" ? undefined : trimmed;

  const commit = useCallback(
    (nextHue: number | undefined, nextInitials: string | undefined) =>
      void setAvatar({ hue: nextHue, initials: nextInitials }),
    [setAvatar],
  );

  // The letters settle before they are sent; the colour is a click and goes at
  // once. Both write the whole disc, because `setAvatar` sets both halves and
  // sending one of them alone would clear the other.
  useEffect(() => {
    if ((profile?.avatarInitials ?? "") === trimmed) return;
    const timer = setTimeout(() => commit(hue, worn), 350);
    return () => clearTimeout(timer);
  }, [trimmed, worn, hue, profile?.avatarInitials, commit]);

  const wanted = handle.trim().toLowerCase();
  const shape = wanted === "" || wanted === current ? null : handleShapeError(wanted);
  const ready = wanted !== "" && wanted !== current && shape === null && left > 0 && !busy;

  async function save() {
    if (!ready) return;
    setBusy(true);
    setNotice(null);
    const result = await rename({ handle: wanted });
    setBusy(false);
    if (!result.ok) setNotice(claimError(result.reason));
  }

  return (
    <div className="mt-2">
      <div className="flex items-center gap-3">
        <Monogram
          handle={current}
          hue={hue}
          initials={worn}
          className="size-14 text-[1.25rem]"
        />

        <div className="min-w-0 flex-1">
          <label className="block text-[0.8125rem] text-muted-foreground">
            Initials
            <input
              value={initials}
              onChange={(event) => setInitials(event.target.value)}
              maxLength={MAX_INITIALS}
              spellCheck={false}
              autoComplete="off"
              placeholder={current.slice(0, 1)}
              className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-[0.875rem] transition-[border-color,box-shadow] outline-none placeholder:text-faint focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
            />
          </label>
        </div>
      </div>

      {/* Twelve, in one row that wraps to two. A swatch is the colour it sets,
          so there is nothing to label. */}
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {AVATAR_HUES.map((swatch) => {
          const on = hue === swatch;
          return (
            <button
              key={swatch}
              type="button"
              aria-label={`Colour ${swatch}`}
              aria-pressed={on}
              onClick={() => {
                setHue(swatch);
                commit(swatch, worn);
              }}
              className={cn(
                "monogram size-6 cursor-pointer rounded-full border-2 transition-[border-color] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                on ? "border-primary" : "border-transparent hover:border-border-strong",
              )}
              style={{ "--monogram-hue": swatch } as CSSProperties}
            />
          );
        })}

        {/* Back to the colour the handle hashes to, which is where everybody
            starts and the only way back to it. */}
        <button
          type="button"
          onClick={() => {
            setHue(undefined);
            commit(undefined, worn);
          }}
          aria-pressed={hue === undefined}
          className={cn(
            "flex h-6 cursor-pointer items-center rounded-full border px-2 text-[0.75rem] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
            hue === undefined
              ? "border-primary text-foreground"
              : "border-border text-muted-foreground hover:border-border-strong",
          )}
        >
          Default
        </button>
      </div>

      <div className="mt-3 flex gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-border bg-background px-3 transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
          <span className="text-[0.875rem] text-faint">@</span>
          <input
            value={handle}
            onChange={(event) => {
              setHandle(event.target.value.toLowerCase());
              setNotice(null);
            }}
            disabled={left === 0}
            maxLength={20}
            spellCheck={false}
            autoComplete="off"
            aria-label="Handle"
            className="h-9 min-w-0 flex-1 bg-transparent text-[0.875rem] outline-none disabled:cursor-not-allowed"
          />
        </div>
        <Button
          type="button"
          size="lg"
          disabled={!ready}
          onClick={() => void save()}
          className="shadow-none hover:shadow-none"
        >
          {busy ? "…" : "Save"}
        </Button>
      </div>

      {/* The local objection first, then the server's, then what it costs —
          one line, and never two problems at once. Same order as the handle
          screen, for the same reason. */}
      <p
        className={cn(
          "mt-1.5 text-[0.8125rem] leading-snug",
          shape ?? notice ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {shape ?? notice ?? changesLeftLabel(spent)}
      </p>
    </div>
  );
}

type DmPolicy = "friends" | "anyone" | "nobody";

/** A name and a button. Everything else about a group is set from inside it. */
function NewGroupPanel({
  open,
  onCreated,
}: {
  open: boolean;
  onCreated: (conversationId: string) => void;
}) {
  const field = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const createGroup = useMutation(api.chat.conversations.createGroup);

  useEffect(() => {
    if (open) field.current?.focus();
  }, [open]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const wanted = title.trim();
    if (wanted === "" || busy) return;

    setBusy(true);
    setError(null);
    const result = await createGroup({ title: wanted, joinPolicy: "invite" });
    setBusy(false);

    if (result.ok) {
      setTitle("");
      onCreated(result.conversationId);
      return;
    }
    setError(groupNameError(result.reason));
  }

  return (
    <form onSubmit={submit} className="pt-3">
      <div className="flex gap-2">
        <input
          ref={field}
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            setError(null);
          }}
          placeholder="What is it called"
          maxLength={40}
          autoComplete="off"
          aria-label="Group name"
          className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-[0.875rem] transition-[border-color,box-shadow] outline-none placeholder:text-faint focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
        />
        <Button
          type="submit"
          size="lg"
          disabled={busy || title.trim() === ""}
          className="shadow-none hover:shadow-none"
        >
          {busy ? "…" : "Create"}
        </Button>
      </div>

      {/* Only when something is wrong. The line that used to live here
          explained a group's invite policy to somebody who had not made one
          yet, and the panel is a field and a button. Styled like the people
          panel's notice, because it is the same kind of thing. */}
      {error === null ? null : (
        <p role="status" className="mt-2 text-[0.8125rem] text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="pt-3">
      <SectionLabel>{label}</SectionLabel>
      <ul className="mt-1 flex flex-col">{children}</ul>
    </section>
  );
}

function Row({
  handle,
  detail,
  hue,
  initials,
  children,
}: {
  handle: string;
  detail?: string;
  /** The disc, when the row's source carries one. See `PublicProfile`. */
  hue?: number;
  initials?: string;
  children: ReactNode;
}) {
  return (
    <li className="group/row flex h-11 items-center gap-2.5">
      <Monogram
        handle={handle}
        hue={hue}
        initials={initials}
        className="size-7 text-[0.75rem]"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.875rem] font-medium">
          {handle}
        </span>
        {detail === undefined ? null : (
          <span className="block truncate text-[0.75rem] text-faint">
            {detail}
          </span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-1">{children}</span>
    </li>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <li className="py-7 text-center text-[0.8125rem] leading-relaxed text-muted-foreground">
      {children}
    </li>
  );
}
