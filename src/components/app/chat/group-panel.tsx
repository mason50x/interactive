"use client";

// Solid throughout, which is the whole set: the two on the conversation row sit
// under `ChatTools`'s own solid icons, and the thread header's is the same
// weight as the add button in the sidebar it sits across from. An outline glyph
// among them read as a different family of thing rather than as the same
// control in a second place.
import {
  Cog6ToothIcon,
  UserPlusIcon,
  UsersIcon,
} from "@heroicons/react/24/solid";
import { useRouter } from "next/navigation";
import { requestGroupPanel, type GroupPanelMode } from "@/lib/chat";
import { CHAT_HREF } from "@/lib/nav";
import type { Id } from "@convex/_generated/dataModel";
import { AddView } from "@/components/app/chat/group-panel/add-view";
import { SettingsView } from "@/components/app/chat/group-panel/settings-view";

/**
 * Running a group, in two panels rather than one.
 *
 * They were one, and one was wrong. Bringing somebody in is the thing that
 * happens often, takes ten seconds, and is done by anybody with the standing to
 * do it; changing what the group *is* — its name, its face, how people get in,
 * who is admin — happens rarely and is read carefully. A single panel made the
 * first of those scroll past the second, and put a list of radio buttons under
 * the nose of somebody who came to type one handle.
 *
 * So: `AddView` is a field and a list of people. `SettingsView` is everything
 * else. Both are opened from the group's row in the conversation list, and the
 * thread header opens the second.
 *
 * ## Why they are not sheets any more
 *
 * They were, and a sheet is a dialog: it lies over the whole app, it takes the
 * focus, and it goes away when you touch anything that is not it. None of that
 * describes what these are. Editing a group is not a question to be answered
 * before carrying on — it is a place, next to the conversations, and it should
 * behave like one. The disc editor made the old behaviour indefensible: its
 * popup is portalled, so opening it counted as touching something outside the
 * sheet, and the sheet closed underneath the popup it had just opened.
 *
 * So both take the conversation column over instead — the same thing the tools
 * panel above the list does, and nothing dismisses either but the way back in
 * its own header. `GroupColumn` is that takeover; the buttons that open it are
 * in the list and in the thread header and do not know where it is, they only
 * ask. See `requestGroupPanel` in `src/lib/chat.ts`.
 *
 * What is in the settings panel depends on the role, and the roles are small on
 * purpose. An owner can do everything including hand the group away by leaving
 * it. An admin can admit, invite, rename, and remove ordinary members. A member
 * can see who is here and leave. None of it reaches outside this group — see
 * the note at the top of `convex/chat/groups.ts`.
 */
export function GroupPanel({
  conversationId,
}: {
  conversationId: Id<"conversations">;
}) {
  const router = useRouter();

  return (
    <button
      type="button"
      aria-label="Group settings"
      onClick={() => {
        requestGroupPanel(conversationId, "settings");

        // Wide enough and the column this just asked for is already beside the
        // thread, so nothing else needs to happen. Below `md` the two panes are
        // one and the thread is standing where the column would be, so the
        // press has to be a move as well as a request — the panel is opened in
        // a column that is on screen by the time the route lands. Asked of the
        // viewport rather than kept in state: this is read once, in the handler
        // that needs it, and a listener would be a re-render per drag of a
        // window edge for a fact nothing draws.
        if (!window.matchMedia("(min-width: 48rem)").matches) {
          router.push(CHAT_HREF);
        }
      }}
      className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
    >
      <UsersIcon className="size-5" />
    </button>
  );
}

/**
 * The two buttons on a group's row in the conversation list.
 *
 * A group row carries the two things somebody opens a group to do, so they are
 * on the row rather than two clicks inside it. The room and direct messages
 * have neither: there is nothing to administer in a room nobody owns, and a
 * conversation between two people has no membership to edit.
 *
 * Adding is drawn only for an owner or an admin, which is the same rule the
 * server is under. A member gets the settings button alone, which for them is
 * who is here and the way out.
 */
export function GroupRowActions({
  conversationId,
  canInvite,
}: {
  conversationId: Id<"conversations">;
  canInvite: boolean;
}) {
  return (
    <>
      {canInvite ? (
        <button
          type="button"
          aria-label="Add someone to this group"
          onClick={() => requestGroupPanel(conversationId, "add")}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/[0.08] hover:text-foreground"
        >
          <UserPlusIcon className="size-4" />
        </button>
      ) : null}

      <button
        type="button"
        aria-label="Group settings"
        onClick={() => requestGroupPanel(conversationId, "settings")}
        className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/[0.08] hover:text-foreground"
      >
        <Cog6ToothIcon className="size-4" />
      </button>
    </>
  );
}

/**
 * Whichever of the two the column has been asked for.
 *
 * The column holds which group and which panel and nothing else; everything
 * about how they are drawn is here, and both are mounted only while they are
 * being looked at — which is what lets them subscribe to the group's detail
 * without a list of ten groups being ten subscriptions.
 */
export function GroupColumn({
  conversationId,
  mode,
  onBack,
}: {
  conversationId: Id<"conversations">;
  mode: GroupPanelMode;
  onBack: () => void;
}) {
  return mode === "add" ? (
    <AddView conversationId={conversationId} onBack={onBack} />
  ) : (
    <SettingsView conversationId={conversationId} onBack={onBack} />
  );
}
