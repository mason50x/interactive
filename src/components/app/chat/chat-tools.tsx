"use client";

import {
  ArrowLeftIcon,
  Cog6ToothIcon,
  GlobeAltIcon,
  NoSymbolIcon,
  PlusIcon,
  UserGroupIcon,
} from "@heroicons/react/24/solid";
import { useAction, useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  FaceEditor,
  type Face,
  type FaceUploadResult,
} from "@/components/app/chat/face-editor";
import { NameEditor } from "@/components/app/chat/name-editor";
import { OptionTiles } from "@/components/app/chat/option-tiles";
import {
  Empty,
  Group,
  PersonRow,
  RowMenu,
} from "@/components/app/chat/people-rows";
import { SectionLabel } from "@/components/app/chat/section-label";
import { useChat } from "@/components/app/chat/chat-provider";
import {
  MAX_DISPLAY_NAME,
  MAX_HANDLE_CHANGES,
  changesLeftLabel,
  claimError,
  displayNameError,
  groupNameError,
  handleShapeError,
  refusalMessage,
} from "@/lib/chat";
import { prepareImage } from "@/lib/images";
import { CHAT_HREF } from "@/lib/nav";
import { cn } from "@/lib/utils";
import type { Icon } from "@/lib/icons";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

/**
 * Everything that is not a conversation, folded into the top of the list.
 *
 * This was a page — `/dashboard/chat/people` — and being a page was the
 * problem. Changing who may reach you and starting a group are things you do
 * *while* looking at your conversations, and each of them took the list away
 * to do it. So they open here instead, in the same gesture the rail's invite
 * cards use: the surface grows, the thing you came for is inside
 * it, and the conversation you were reading is still behind.
 *
 * There were three of these and there are two. The third was People — a
 * search, the requests waiting on you, and your friends — and none of that is
 * a panel any more: the search is the field over the list, the requests sit
 * above the conversations, and a person is reached by pressing their name
 * wherever it appears. See `chat-search.tsx`, `waiting.tsx` and
 * `person-card.tsx`. The friends list moved in here, under Settings, because
 * once a name is the way to reach somebody, a roster is a thing to tidy.
 *
 * ## A mode, not a drawer
 *
 * An open panel *is* the column: it takes the whole of it, the list underneath
 * goes, and the header above stops saying your handle and says which panel you
 * are in. It used to grow out of the top of the list instead — a measured box
 * that reserved its own height and pushed the conversations down — which made
 * it a thing sitting on top of the column rather than the column's other face,
 * and gave a tall panel nowhere to scroll.
 *
 * Nothing dismisses it but the way back in the header. It deliberately does not
 * close on a press outside itself, and there are two reasons, one of them a
 * bug this had:
 *
 * A panel that has taken the column over is not a popover. There is nothing
 * behind it to press back to — the list it replaced is *inside* it, one press
 * away — so a press on the thread beside it means "read that", not "put this
 * away", and taking the panel away is losing somebody's place in a search they
 * were half way through typing.
 *
 * And an outside press cannot be told apart from a press inside something this
 * panel opened. A portalled popup — the disc editor in Settings is one — is not
 * a descendant of this element, so every press in it read as outside and closed
 * the panel underneath the popup that was still open.
 *
 * One panel and two buttons rather than two panels. Opening one closes the
 * other, because they are two answers to "what do you want to do" and having
 * both open at once is a list you have to scroll past to reach your
 * conversations.
 */

export type Panel = "settings" | "group";

/**
 * The two, in the order they sit in the header.
 *
 * `label` is what the button is called to a screen reader; `title` is what the
 * header calls the panel while it is open. They differ where the button names
 * an action and the open panel names a place: the cog is "Chat settings" to
 * press and "Settings" once you are in it.
 *
 * Solid in every state, and so no `IconPair` — these do not use weight to say
 * which one is chosen, because while one is chosen the other is not on screen
 * to be told apart from it.
 */
const TOOLS: readonly {
  panel: Panel;
  label: string;
  title: string;
  icon: Icon;
}[] = [
  {
    panel: "settings",
    label: "Chat settings",
    title: "Settings",
    icon: Cog6ToothIcon,
  },
  { panel: "group", label: "New group", title: "New group", icon: PlusIcon },
];

export function ChatTools({
  open,
  onOpenChange,
}: {
  /**
   * Which panel is open, or `null` while the column is a list.
   *
   * Held by the caller rather than here, because an open panel replaces the
   * list and the list is the caller's. See `ConversationList`.
   */
  open: Panel | null;
  onOpenChange: (panel: Panel | null) => void;
}) {
  const router = useRouter();

  // What the panel is drawing. Held separately from `open` so that a panel
  // which has been closed is still the one that comes back when the same
  // button is pressed again — the contents are hidden, not thrown away, and a
  // group name somebody typed is still there when they return to it.
  const [shown, setShown] = useState<Panel>("settings");

  const panelId = useId();

  const close = useCallback(() => onOpenChange(null), [onOpenChange]);

  function toggle(panel: Panel) {
    onOpenChange(open === panel ? null : panel);
  }

  // Adjusted while rendering rather than in an effect, which is what React
  // asks for when a piece of state is a prop plus a memory of it: an effect
  // would paint one frame of the old panel first.
  if (open !== null && open !== shown) setShown(open);

  /** Opening a conversation is always the end of whatever the panel was for. */
  const go = useCallback(
    (conversationId: string) => {
      close();
      router.push(`${CHAT_HREF}/${conversationId}`);
    },
    [close, router],
  );

  return (
    <div
      className={cn(
        "flex w-full min-h-0 flex-col",
        // Closed, this is a header sitting above a list. Open, it *is* the
        // column, and the panel inside it is what scrolls.
        open === null ? "shrink-0" : "flex-1",
      )}
    >
      <div className="flex shrink-0 items-center px-4 pt-4 pb-2">
        {/* What this column is called when it is a list of conversations.
            While a panel is open it is not that, so the header says which of
            the three you are in instead. */}
        <h2 className="min-w-0 flex-1 truncate text-[1.0625rem] font-semibold">
          {open === null
            ? "My Feed"
            : TOOLS.find((tool) => tool.panel === open)!.title}
        </h2>

        {/* Two while none is open, one while one is. The one left is the
            way out of it, so the row is never both a set of choices and a
            choice already made. */}
        {TOOLS.map((tool) => (
          <Tool
            key={tool.panel}
            icon={tool.icon}
            label={tool.label}
            active={open === tool.panel}
            collapsed={open !== null && open !== tool.panel}
            controls={panelId}
            onClick={() => toggle(tool.panel)}
          />
        ))}
      </div>

      {/* `hidden` rather than a height of zero, and mounted rather than
          unmounted. A panel that reserves a collapsed box is a panel the list
          has to start below; a panel that is thrown away loses what was typed
          into it. This is neither: no space when it is shut, and everything
          still there when it comes back.

          It arrives on a fade because there is no shape left to animate — the
          gesture that says something happened is the tool row narrowing to one
          button and the heading changing behind it, which is above this and
          plays whether this is open or not. A CSS animation restarts every
          time an element comes back from `display: none`, which is exactly
          when this should play.

          There is no rule over it: the list it used to be divided from is not
          on screen while this is, and a hairline over nothing is just a stray
          line. */}
      <div
        id={panelId}
        inert={open === null}
        className={cn(
          "animate-in fade-in min-h-0 flex-1 overflow-y-auto px-3 pb-3 duration-200",
          open === null && "hidden",
        )}
      >
        {shown === "settings" ? (
          <SettingsPanel open={open === "settings"} />
        ) : (
          <NewGroupPanel open={open === "group"} onCreated={go} />
        )}
      </div>
    </div>
  );
}

/**
 * The last answer a query gave, kept while it is not being asked.
 *
 * The settings panel is mounted for the rest of the session once it has been
 * opened — hidden rather than thrown away, so that what was typed into it
 * survives — and two of its queries were subscribed for that whole time. One of
 * them counts every conversation the account is in, and a membership row is
 * written every time its owner reads a message, so a panel nobody was looking at
 * was re-counting itself on every message anybody sent them.
 *
 * They are asked only while the panel is open now. This is the part that makes
 * that invisible: dropping a subscription drops its value, so without it the
 * second opening would draw an empty panel for the length of a round trip
 * before filling in with the same numbers it showed the first time. The held
 * copy is what is on screen while the fresh one arrives, and the fresh one
 * replaces it the moment it does.
 */
function useHeld<T>(value: T | undefined): T | undefined {
  const [held, setHeld] = useState<T | undefined>(undefined);
  // Adjusted while rendering rather than in an effect, the same way `shown`
  // above is: this is state that is a value plus a memory of it, and an effect
  // would paint one frame of the gap first — which is the frame this exists to
  // prevent. Convex hands back the same object for an unchanged result, so the
  // comparison settles on the first render rather than chasing itself.
  if (value !== undefined && value !== held) setHeld(value);
  return value ?? held;
}

/**
 * One of the two, and — once one of them is open — the only one.
 *
 * Opening a panel does three things to this row at once, all on the same
 * curve: the one that was not chosen goes to zero width and takes its margin
 * with it, the chosen one widens, and what is drawn inside it crosses from
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
 * `inert` on the collapsed one rather than merely `opacity-0`: a zero-width
 * button is still in the tab order, and tabbing into something you cannot see
 * is worse than not being able to reach it.
 */
function Tool({
  icon: Glyph,
  label,
  active,
  collapsed,
  controls,
  onClick,
}: {
  icon: Icon;
  label: string;
  active: boolean;
  collapsed: boolean;
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
 * Who can see you, who can reach you, and who you have shut out.
 *
 * `friends` is the default and it is the load-bearing default of the whole
 * feature: a stranger who finds your handle cannot open a conversation with
 * you, only ask. `anyone` is the door open, and it is real now — see `openDm`
 * in `convex/chat/conversations.ts`, which the person card calls. It commits
 * on click — there is no Save, the way there is none on anything else in this
 * app's chrome.
 *
 * The three are not a list of three equal things, so they are not drawn as
 * one. `friends` is where nearly everybody is and where nearly everybody
 * stays, so it gets the full width and the sentence explaining itself; the two
 * ways of leaving it share the row above and go by their names alone, which in
 * a section headed "Who can reach you" is the whole of what they mean. It sits
 * under them rather than over them because it is the floor of the section: the
 * thing you come back down to.
 */
function SettingsPanel({ open }: { open: boolean }) {
  const { profile } = useChat();
  const blocked = useHeld(useQuery(api.chat.blocks.list, open ? {} : "skip"));
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

      <Friends open={open} />

      {(blocked ?? []).length > 0 ? (
        <div className="mt-4">
          <Group label="Blocked">
            {(blocked ?? []).map((person) => (
              <PersonRow key={person.clerkId} person={person} card={false}>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => void unblock({ peerClerkId: person.clerkId })}
                >
                  Unblock
                </Button>
              </PersonRow>
            ))}
          </Group>
        </div>
      ) : null}

      <EraseChat open={open} />
    </div>
  );
}

/**
 * Who your friends are, and the requests you have out.
 *
 * A roster rather than a way in: pressing a friend opens their card, which is
 * where Message lives, and the menu on the row is for the two rare things.
 * Held while the panel is shut, the same way the blocked list is — see
 * `useHeld`.
 */
function Friends({ open }: { open: boolean }) {
  const friends = useHeld(useQuery(api.chat.friends.list, open ? {} : "skip"));
  const pending = useHeld(
    useQuery(api.chat.friends.pending, open ? {} : "skip"),
  );
  const remove = useMutation(api.chat.friends.remove);
  const block = useMutation(api.chat.blocks.block);

  const outgoing = (pending ?? []).filter((row) => row.outgoing);

  return (
    <div className="mt-4">
      <Group label="Friends">
        {(friends ?? []).map((friend) => (
          <PersonRow key={friend.clerkId} person={friend}>
            <RowMenu
              label={`More for ${friend.handle}`}
              items={[
                {
                  label: "Remove friend",
                  onClick: () => void remove({ peerClerkId: friend.clerkId }),
                },
                {
                  label: `Block ${friend.handle}`,
                  onClick: () => void block({ peerClerkId: friend.clerkId }),
                  danger: true,
                },
              ]}
            />
          </PersonRow>
        ))}
        {friends !== undefined && friends.length === 0 ? (
          <Empty>No friends yet. Press a name anywhere to add one.</Empty>
        ) : null}
      </Group>

      {outgoing.length > 0 ? (
        <Group label="Asked">
          {outgoing.map((row) => (
            <PersonRow key={row.clerkId} person={row}>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => void remove({ peerClerkId: row.clerkId })}
              >
                Cancel
              </Button>
            </PersonRow>
          ))}
        </Group>
      ) : null}
    </div>
  );
}

/**
 * The way out of chat that is not the way out of the account.
 *
 * It lives at the bottom of the panel that holds the handle, the blocks and who
 * may reach you, because it is the last item on that same list: this is the
 * screen for everything about who you are in here, and leaving is the end of
 * it. Deleting the Clerk account is a different button in a different place and
 * always was — somebody who wants their messages gone should not have to close
 * the account they use for the rest of the site to get it.
 *
 * ## It arms before it fires
 *
 * The closed state is a sentence and a button. The open state is the list of
 * what will actually happen, counted from the server rather than described, and
 * a field that wants the handle typed back. Counting is the part that matters:
 * "delete everything" is a phrase anybody can agree to without picturing any of
 * it, and "the 3 groups you own, and everything anybody said in them" is a
 * number somebody can recognise as wrong while there is still time.
 *
 * The typed handle is checked here and again in `chat.erase.eraseMine`, for the
 * usual reason — this is a browser, and the mutation can be called without it.
 *
 * Nothing here navigates on success. The profile is deleted, so the
 * subscription behind `useChat` drops it and `ChatFrame` swaps the whole pane
 * for the handle screen, which is exactly where somebody who has just erased
 * themselves should be. See `handle-gate.tsx`.
 */
function EraseChat({ open }: { open: boolean }) {
  const preview = useHeld(useQuery(api.chat.erase.preview, open ? {} : "skip"));
  const erase = useMutation(api.chat.erase.eraseMine);

  const field = useRef<HTMLInputElement>(null);
  const [armed, setArmed] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (armed) field.current?.focus();
  }, [armed]);

  // Undefined is the query in flight and null is an account with no handle,
  // which cannot see this panel at all. Neither has anything to draw.
  if (preview === undefined || preview === null) return null;

  const ready = confirm.trim().toLowerCase() === preview.handle && !busy;

  const lines = ["Every message you have sent, in every conversation."];

  if (preview.owned > 0) {
    lines.push(
      preview.owned === 1
        ? "The group you own, and everything anybody said in it."
        : `The ${preview.owned} groups you own, and everything anybody said in them.`,
    );
  }
  if (preview.groups > 0) {
    lines.push(
      preview.groups === 1
        ? "You leave the other group you are in."
        : `You leave the other ${preview.groups} groups you are in.`,
    );
  }
  if (preview.dms > 0) {
    lines.push(
      preview.dms === 1
        ? "Your direct message, deleted for both of you."
        : `All ${preview.dms} direct messages, deleted for both of you.`,
    );
  }

  lines.push(
    "Your friends, everyone you have blocked, and every report you filed.",
  );
  lines.push(
    `@${preview.handle} is released, and anybody may claim it.`,
  );

  async function go() {
    if (!ready) return;
    setBusy(true);
    setError(null);
    const result = await erase({ confirm });
    setBusy(false);

    if (!result.ok) {
      setError(
        result.reason === "handle"
          ? "That is not your handle."
          : "There is nothing here to clear.",
      );
      return;
    }
    setArmed(false);
    setConfirm("");
  }

  return (
    <div className="mt-7">
      <SectionLabel>Clearing out</SectionLabel>

      {armed ? (
        <div className="mt-2 rounded-xl border border-destructive/30 bg-destructive/[0.04] p-3">
          <ul className="flex flex-col gap-1.5">
            {lines.map((line) => (
              <li
                key={line}
                className="flex gap-2 text-[0.8125rem] leading-snug text-foreground"
              >
                <span
                  aria-hidden
                  className="mt-[0.4375rem] size-1 shrink-0 rounded-full bg-destructive"
                />
                <span className="min-w-0">{line}</span>
              </li>
            ))}
          </ul>

          <label className="mt-3 block text-[0.8125rem] text-muted-foreground">
            Type {preview.handle} to confirm
            <input
              ref={field}
              value={confirm}
              onChange={(event) => {
                setConfirm(event.target.value);
                setError(null);
              }}
              spellCheck={false}
              autoComplete="off"
              maxLength={20}
              className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-[0.875rem] text-foreground transition-[border-color,box-shadow] outline-none focus-visible:border-destructive focus-visible:ring-1 focus-visible:ring-destructive"
            />
          </label>

          <div className="mt-2.5 flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="flex-1"
              onClick={() => {
                setArmed(false);
                setConfirm("");
                setError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="lg"
              disabled={!ready}
              onClick={() => void go()}
              className="flex-1 shadow-none hover:shadow-none"
            >
              {busy ? "…" : "Delete everything"}
            </Button>
          </div>

          {error === null ? null : (
            <p role="status" className="mt-2 text-[0.8125rem] text-destructive">
              {error}
            </p>
          )}
        </div>
      ) : (
        <div className="mt-1.5 flex items-center gap-3">
          <p className="min-w-0 flex-1 text-[0.8125rem] leading-snug text-muted-foreground">
            Delete your handle and everything you have ever said here. Nothing
            about it can be undone.
          </p>
          <Button
            type="button"
            variant="destructive"
            size="lg"
            className="shrink-0 shadow-none hover:shadow-none"
            onClick={() => {
              setArmed(true);
              setError(null);
            }}
          >
            Clear chat
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * How many messages this account has ever sent, said in words.
 *
 * Grouped by locale, because the number is the point of the line and `1284` is
 * harder to read at a glance than `1,284`. Zero is not "0 messages sent": an
 * account that has never spoken is at the beginning of something rather than
 * holding a count of nothing.
 */
function sentLabel(sent: number): string {
  if (sent === 0) return "No messages yet";
  if (sent === 1) return "1 message sent";
  return `${sent.toLocaleString()} messages sent`;
}

/**
 * Your disc, your name and your handle, which are the three things about you
 * that anybody else can see.
 *
 * One row, and everything about you is in it. Nothing here is a form. The
 * whole section is what somebody else sees when they come across you, and
 * every part of it is changed by pressing the thing itself — the disc opens
 * `FaceEditor`, the pencil beside each name opens `NameEditor`, and each of
 * those is a panel over the column rather than a control that moves
 * everything under it.
 *
 * They are set on different terms. The disc — a picked face or two letters,
 * on a picked colour — commits the instant you touch it and has no allowance
 * on it, because a colour and a picture are not a name: nothing points at
 * them and nobody remembers you by them. The display name keeps a Save
 * because it goes through the filter — it is read by everybody — but it is
 * not rationed: it is printed over the handle, never instead of it. The handle
 * keeps a Save and an allowance, because it is the one control that spends
 * something you cannot get back.
 *
 * The count is here and nowhere else. `messagesSent` has always been on the
 * profile, feeding the trust tier; it is on `MyProfile` and deliberately not on
 * `PublicProfile`, because how much somebody talks is not a fact strangers
 * should be able to read off them.
 *
 * What renaming does *not* do is rewrite what you have already said. Messages
 * carry the handle they were sent under (see `convex/chat/profiles.ts`), so old
 * ones keep the old name. That is the denormalisation the thread is built on,
 * and it is also the honest record.
 */
function Me() {
  const { profile, images } = useChat();
  const rename = useMutation(api.chat.profiles.renameHandle);
  const setDisplayName = useMutation(api.chat.profiles.setDisplayName);
  const setAvatar = useMutation(api.chat.profiles.setAvatar);
  const uploadUrl = useMutation(api.chat.attachments.uploadUrl);
  const checkImage = useAction(api.chat.attachments.check);
  const discard = useMutation(api.chat.attachments.discard);

  const spent = profile?.handleChanges ?? 0;
  const left = MAX_HANDLE_CHANGES - spent;
  const current = profile?.handle ?? "";
  const name = profile?.displayName ?? "";
  const avatarHue = profile?.avatarHue;

  // Held steady across renders: the editor debounces the letters against this
  // callback, and a new function on every render — this component re-renders
  // whenever the profile query does — would restart that timer each time and
  // never reach the end of it.
  const setFace = useCallback(
    (face: Face) => void setAvatar(face),
    [setAvatar],
  );

  const uploadPicture = useCallback(
    async (file: File): Promise<FaceUploadResult> => {
      const prepared = await prepareImage(file);
      if (prepared === null) {
        return { ok: false, message: "That picture could not be read." };
      }

      const previewUrl = URL.createObjectURL(prepared.blob);
      try {
        const slot = await uploadUrl({ purpose: "avatar" });
        if (!slot.ok) {
          URL.revokeObjectURL(previewUrl);
          return { ok: false, message: refusalMessage(slot.refusal) };
        }

        const response = await fetch(slot.url, {
          method: "POST",
          headers: { "Content-Type": prepared.blob.type },
          body: prepared.blob,
        });
        if (!response.ok) {
          URL.revokeObjectURL(previewUrl);
          return { ok: false, message: refusalMessage("image") };
        }

        const { storageId } = (await response.json()) as {
          storageId: Id<"_storage">;
        };
        const verdict = await checkImage({
          storageId,
          width: prepared.width,
          height: prepared.height,
          purpose: "avatar",
        });
        if (!verdict.ok) {
          URL.revokeObjectURL(previewUrl);
          return { ok: false, message: refusalMessage(verdict.refusal) };
        }

        const changed = await setAvatar({
          attachmentId: verdict.attachmentId,
          hue: avatarHue,
        });
        if (!changed.ok) {
          await discard({ attachmentId: verdict.attachmentId });
          URL.revokeObjectURL(previewUrl);
          return { ok: false, message: refusalMessage("image") };
        }

        return { ok: true, previewUrl };
      } catch {
        URL.revokeObjectURL(previewUrl);
        return { ok: false, message: refusalMessage("image") };
      }
    },
    [avatarHue, checkImage, discard, setAvatar, uploadUrl],
  );

  return (
    <div className="mt-2">
      <FaceEditor
        name={current}
        label="your picture"
        face={{
          emoji: profile?.avatarEmoji,
          initials: profile?.avatarInitials,
          hue: profile?.avatarHue,
        }}
        imageUrl={profile?.avatarUrl}
        onUpload={images ? uploadPicture : undefined}
        onChange={setFace}
      >
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1">
            <p className="min-w-0 truncate text-[0.9375rem] font-semibold">
              {name === "" ? (
                <span className="text-muted-foreground">Add a name</span>
              ) : (
                name
              )}
            </p>

            <NameEditor
              value={name}
              label="display name"
              title="Name"
              maxLength={MAX_DISPLAY_NAME}
              caption="Shown over your handle. Old messages keep the old one."
              onSave={async (wanted) => {
                const result = await setDisplayName({ name: wanted });
                return result.ok ? null : displayNameError(result.reason);
              }}
            />
          </div>

          <div className="flex min-w-0 items-center gap-1">
            {/* The `@` is faint and the handle is not, so the name reads as
                the name rather than as an address. Both go together while the
                profile is still in flight: a lone `@` with nothing after it is
                not a shorter name, it is a broken one. */}
            <p className="min-w-0 truncate text-[0.8125rem] text-muted-foreground">
              {current === "" ? null : <span className="text-faint">@</span>}
              {current}
            </p>

            <NameEditor
              value={current}
              prefix="@"
              label="handle"
              title="Handle"
              maxLength={20}
              caption={changesLeftLabel(spent)}
              allowance={{ left, total: MAX_HANDLE_CHANGES }}
              disabled={left === 0}
              transform={(raw) => raw.toLowerCase()}
              check={handleShapeError}
              onSave={async (handle) => {
                const result = await rename({ handle });
                return result.ok ? null : claimError(result.reason);
              }}
            />
          </div>

          <p className="mt-0.5 truncate text-[0.75rem] text-faint">
            {sentLabel(profile?.messagesSent ?? 0)}
          </p>
        </div>
      </FaceEditor>
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
