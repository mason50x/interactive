"use client";

import {
  ArrowLeftIcon,
  Cog6ToothIcon,
  PlusIcon,
} from "@heroicons/react/24/solid";
import { useRouter } from "next/navigation";
import { useCallback, useId, useState } from "react";
import { CHAT_HREF } from "@/lib/nav";
import { cn } from "@/lib/utils";
import type { Icon } from "@/lib/icons";
import { NewGroupPanel } from "@/components/app/chat/chat-tools/new-group-panel";
import { PeoplePanel } from "@/components/app/chat/chat-tools/people-panel";

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
          <PeoplePanel open={open === "settings"} />
        ) : (
          <NewGroupPanel open={open === "group"} onCreated={go} />
        )}
      </div>
    </div>
  );
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
