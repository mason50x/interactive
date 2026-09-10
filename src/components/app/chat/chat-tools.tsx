"use client";

import { useClerk } from "@clerk/nextjs";
import {
  ArrowLeftIcon,
  Cog6ToothIcon,
  PlusIcon,
  UserGroupIcon,
} from "@heroicons/react/24/solid";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FaceEditor, type Face } from "@/components/app/chat/face-editor";
import {
  Empty,
  Group,
  PersonRow,
  RowMenu,
} from "@/components/app/chat/people-rows";
import { SectionLabel } from "@/components/app/chat/section-label";
import { useChat } from "@/components/app/chat/chat-provider";
import { groupNameError } from "@/lib/chat";
import { CHAT_HREF } from "@/lib/nav";
import { cn } from "@/lib/utils";
import type { Icon } from "@/lib/icons";
import { api } from "../../../../convex/_generated/api";

/**
 * Everything that is not a conversation, folded into the top of the list.
 *
 * This was a page — `/dashboard/chat/people` — and being a page was the
 * problem. Tidying your friends and starting a group are things you do
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
        "flex min-h-0 w-full flex-col",
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
          "min-h-0 flex-1 animate-in overflow-y-auto px-3 pb-3 duration-200 fade-in",
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
        "relative ml-0.5 flex h-8 shrink-0 cursor-pointer items-center overflow-hidden rounded-lg transition-[width,margin,opacity,background-color,color] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset",
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
 * You, your friends, and who you have shut out.
 *
 * There used to be two questions above the friends list — who may reach you,
 * with three answers, and whether search may find you, with two — and both
 * are gone because both now have one answer. Direct messages are friends
 * only, for everybody: a stranger who finds your handle cannot open a
 * conversation with you, only ask. See `openDm` in
 * `convex/chat/conversations.ts`. And everybody can be found by handle. A
 * control with one position is a sentence, so that is what is drawn: one
 * line under your own row saying how it works, and no switch to look for.
 */
function SettingsPanel({ open }: { open: boolean }) {
  const blocked = useHeld(useQuery(api.chat.blocks.list, open ? {} : "skip"));
  const unblock = useMutation(api.chat.blocks.unblock);

  return (
    <div className="pt-3">
      <SectionLabel>Me</SectionLabel>
      <Me />

      <div className="mt-5 flex items-start gap-3 rounded-xl border border-border bg-foreground/[0.03] px-3 py-2.5">
        <UserGroupIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p className="min-w-0 text-[0.8125rem] leading-snug text-muted-foreground">
          Only friends can message you. Anyone can find you by handle and ask to
          be one.
        </p>
      </div>

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

/** Clerk controls identity; chat controls the avatar style. */
function Me() {
  const { profile } = useChat();
  const { openUserProfile } = useClerk();
  const setAvatar = useMutation(api.chat.profiles.setAvatar);
  const [error, setError] = useState<string | null>(null);
  const save = async (face: Face, mode: "account" | "custom") => {
    try {
      const result = await setAvatar({ ...face, mode });
      setError(result.ok ? null : "Could not save your picture. Try again.");
    } catch {
      setError("Could not save your picture. Try again.");
    }
  };
  return (
    <div className="mt-2">
      <FaceEditor
        name={profile?.handle ?? ""}
        label="your picture"
        face={{
          emoji: profile?.avatarEmoji,
          initials: profile?.avatarInitials,
          hue: profile?.avatarHue,
        }}
        imageUrl={profile?.avatarUrl}
        account={{
          selected: profile?.avatarMode !== "custom",
          onSelect: () => void save({}, "account"),
        }}
        onChange={(face) => void save(face, "custom")}
      >
        <div className="min-w-0">
          <p className="truncate text-[0.9375rem] font-semibold">
            {profile?.displayName || profile?.handle}
          </p>
          <p className="truncate text-[0.8125rem] text-muted-foreground">
            @{profile?.handle}
          </p>
          <p className="text-[0.75rem] text-faint">
            {sentLabel(profile?.messagesSent ?? 0)}
          </p>
        </div>
      </FaceEditor>
      <Button
        variant="ghost"
        size="sm"
        className="mt-2"
        onClick={() => openUserProfile()}
      >
        Manage account
      </Button>
      <p className="mt-1 text-xs text-muted-foreground">
        Your name and handle come from your account.
      </p>
      {error && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

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
