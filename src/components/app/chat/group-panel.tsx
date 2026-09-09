"use client";

// Solid throughout, which is the whole set: the two on the conversation row sit
// under `ChatTools`'s own solid icons, and the thread header's is the same
// weight as the add button in the sidebar it sits across from. An outline glyph
// among them read as a different family of thing rather than as the same
// control in a second place.
import {
  ArrowLeftIcon,
  Cog6ToothIcon,
  HandRaisedIcon,
  LinkIcon,
  LockClosedIcon,
  UserPlusIcon,
  UsersIcon,
} from "@heroicons/react/24/solid";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { FaceEditor, type Face } from "@/components/app/chat/face-editor";
import { Monogram } from "@/components/app/chat/monogram";
import { NameEditor } from "@/components/app/chat/name-editor";
import { OptionTiles } from "@/components/app/chat/option-tiles";
import { FoundNobody, Searching } from "@/components/app/chat/searching";
import { SectionLabel } from "@/components/app/chat/section-label";
import {
  MAX_TITLE,
  personName,
  requestGroupPanel,
  type GroupPanelMode,
} from "@/lib/chat";
import { CHAT_HREF } from "@/lib/nav";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import type {
  ConversationDetail,
  ConversationMember,
} from "../../../../convex/chat/conversations";

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

/**
 * The group's detail.
 *
 * Subscribed here rather than passed down from whatever opened the panel: the
 * two things that open it are a row in a list and a button in another pane, and
 * only one panel is ever open, so one query at the moment it is looked at costs
 * less than a query per row for panels nobody has opened. It is also the thing
 * that made the thread's copy unnecessary — see `GroupPanel`.
 */
function useDetail(
  conversationId: Id<"conversations">,
): ConversationDetail | null {
  return useQuery(api.chat.conversations.get, { conversationId }) ?? null;
}

/**
 * The group's people, which are a second subscription rather than a field on
 * the first.
 *
 * They came off `conversations.get` because that query is also the thread
 * header's, and the header is open for as long as the conversation is. Every
 * membership row carries a reading position, so every person reading wrote one
 * on every message — and a header watching the whole member list was recomputed
 * by all of it. Here it is watched only while somebody is looking at the panel
 * that draws it. See `members` in `convex/chat/conversations.ts`.
 */
function useMembers(
  conversationId: Id<"conversations">,
): ConversationMember[] | null {
  return useQuery(api.chat.conversations.members, { conversationId }) ?? null;
}

/**
 * The column, while a group panel has it: a heading, the way back, and the
 * panel under both.
 *
 * The header is the conversation list's own header at the same metrics, for
 * the reason the tools panel's is — this is the column being one thing instead
 * of another, not a second kind of surface arriving in it. The way out is a
 * button on the right, where the tools panel's Back is, and it is the only way
 * out: nothing here closes because something else was pressed.
 */
function Frame({
  title,
  onBack,
  loading,
  children,
}: {
  title: string;
  onBack: () => void;
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="flex shrink-0 items-center gap-2 px-4 pt-4 pb-2">
        <h2 className="min-w-0 flex-1 truncate text-[1.0625rem] font-semibold">
          {title}
        </h2>

        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-lg px-2 text-[0.8125rem] text-muted-foreground transition-colors outline-none hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <ArrowLeftIcon className="size-4 shrink-0" />
          Back
        </button>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center py-12">
          <Spinner />
        </div>
      ) : (
        <div className="animate-in fade-in flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-3 pb-4 duration-200">
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * Bringing people in, and letting waiting people through.
 *
 * Both halves of one job: somebody you go and find, and somebody who already
 * came and knocked. Keeping them together is why this sheet is worth having
 * apart from the other one — a request left waiting is the thing most likely to
 * be missed, and here it is at the top rather than four sections down.
 */
function AddView({
  conversationId,
  onBack,
}: {
  conversationId: Id<"conversations">;
  onBack: () => void;
}) {
  const detail = useDetail(conversationId);
  const people = useMembers(conversationId);
  const requests = useQuery(api.chat.groups.requests, { conversationId });

  // What is being searched for, which is not what is in the field — the same
  // debounce the tools panel's search uses, and for the same reason: every
  // keystroke was its own query, and the half-typed ones mostly match nobody,
  // so a definite sentence flashed up between the letters of a handle that
  // does exist.
  const [term, setTerm] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setQuery(term.trim()), 250);
    return () => clearTimeout(timer);
  }, [term]);

  const found = useQuery(
    api.chat.profiles.search,
    query.length >= 2 ? { term: query } : "skip",
  );

  // Two questions, and only the second may be answered out loud. The section
  // is open from the second character; what is under it is a wait until the
  // field has settled *and* the answer to that exact term is in — `useQuery`
  // goes back to `undefined` when its argument changes, so this covers the
  // round trip after the debounce as well as the debounce.
  const searching = term.trim().length >= 2;
  const settled = query === term.trim() && found !== undefined;

  const invite = useMutation(api.chat.groups.invite);
  const decide = useMutation(api.chat.groups.decide);

  // Why nothing is kept for a successful invite: the person leaves the found
  // list the moment the invite lands — they are a member with `invited` on
  // them, so `alreadyIn` catches them — and their handle turns up under
  // "Invited, not yet in" two inches below. The row moving is the receipt.
  // Only refusals need words, and they belong on the row that was refused.
  const [refused, setRefused] = useState<Record<string, string>>({});

  const field = useRef<HTMLInputElement>(null);
  // Both, because the panel's answers depend on both: who may be invited is
  // the group's people, and they are a second subscription now rather than a
  // field on the first. See `useMembers`.
  const ready = detail !== null && people !== null;

  // The button that opened this came here to type a handle, so the caret is
  // already in the field — but not until the detail lands, because until then
  // there is no field to put it in.
  useEffect(() => {
    if (ready) field.current?.focus();
  }, [ready]);

  const alreadyIn = new Set((people ?? []).map((member) => member.clerkId));
  const asked = (people ?? []).filter((member) => member.status === "invited");

  async function send(peerClerkId: string) {
    const result = await invite({ conversationId, peerClerkId });
    if (result.ok) return;
    setRefused((was) => ({
      ...was,
      [peerClerkId]:
        result.reason === "full"
          ? "This group is full"
          : result.reason === "already"
            ? "Already here"
            : result.reason === "blocked"
              ? "You cannot invite them"
              : "That did not work",
    }));
  }

  return (
    <Frame title="Add to this group" onBack={onBack} loading={!ready}>
      {(requests ?? []).length > 0 ? (
        <section>
          <SectionLabel>Asking to join</SectionLabel>
          <ul className="mt-2 flex flex-col">
            {(requests ?? []).map((person) => (
              <Line
                key={person.clerkId}
                handle={person.handle}
                name={person.displayName}
                imageUrl={person.avatarUrl}
                hue={person.avatarHue}
                emoji={person.avatarEmoji}
                initials={person.avatarInitials}
              >
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    void decide({
                      conversationId,
                      clerkId: person.clerkId,
                      approve: false,
                    })
                  }
                >
                  No
                </Button>
                <Button
                  size="sm"
                  onClick={() =>
                    void decide({
                      conversationId,
                      clerkId: person.clerkId,
                      approve: true,
                    })
                  }
                >
                  Let in
                </Button>
              </Line>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <SectionLabel>Find somebody</SectionLabel>
        <input
          ref={field}
          value={term}
          onChange={(event) => {
            setTerm(event.target.value.toLowerCase());
            setRefused({});
          }}
          placeholder="Their handle"
          spellCheck={false}
          autoComplete="off"
          aria-label="Search handles"
          className="mt-3 h-10 w-full rounded-xl border border-border bg-background px-3 text-[0.875rem] outline-none placeholder:text-faint focus:border-primary"
        />

        {/* Nothing at all until there is something to say. Below two
            characters this section is a field and a label, which is the honest
            shape of a search nobody has typed yet. */}
        {!searching ? null : !settled ? (
          <Searching />
        ) : (
          (() => {
            const rows = found.filter(
              (person) => !alreadyIn.has(person.clerkId),
            );
            // Everybody can be found by handle, so nothing here is a handle
            // typed wrong or somebody already in the group — and saying so
            // saves a person trying it four more times.
            return rows.length === 0 ? (
              <FoundNobody>
                Nobody by that handle, or they are already in the group.
              </FoundNobody>
            ) : (
              <ul className="mt-1 flex flex-col">
                {rows.map((person) => (
                  <Line
                    key={person.clerkId}
                    handle={person.handle}
                    name={person.displayName}
                    imageUrl={person.avatarUrl}
                    hue={person.avatarHue}
                    emoji={person.avatarEmoji}
                    initials={person.avatarInitials}
                  >
                    <InviteCell
                      refused={refused[person.clerkId]}
                      onInvite={() => void send(person.clerkId)}
                    />
                  </Line>
                ))}
              </ul>
            );
          })()
        )}
      </section>

      {asked.length > 0 ? (
        <section>
          <SectionLabel>Invited, not yet in</SectionLabel>
          <p className="mt-2 text-[0.8125rem] text-muted-foreground">
            {asked.map((member) => member.handle).join(", ")}.
          </p>
        </section>
      ) : null}
    </Frame>
  );
}

/**
 * What the group is, for the people who may change it.
 *
 * Name and face first, because they are what everybody else sees and the only
 * two things here that are about the group rather than about its membership.
 * The picture is a picked emoji on a picked hue and never an upload: see
 * `monogram.tsx` for why this app holds no pictures of its users, and
 * `setLook` in `convex/chat/groups.ts` for the closed sets that make a group
 * having a face cost nothing to moderate.
 */
function SettingsView({
  conversationId,
  onBack,
}: {
  conversationId: Id<"conversations">;
  onBack: () => void;
}) {
  const router = useRouter();
  const detail = useDetail(conversationId);
  const people = useMembers(conversationId);

  const kick = useMutation(api.chat.groups.kick);
  const setRole = useMutation(api.chat.groups.setRole);
  const setJoinPolicy = useMutation(api.chat.groups.setJoinPolicy);
  const setLook = useMutation(api.chat.groups.setLook);
  const rename = useMutation(api.chat.groups.rename);
  const leave = useMutation(api.chat.groups.leave);

  // Held steady across renders: the editor debounces its letters field against
  // this callback, and a sheet that re-renders every time its detail query does
  // would restart that timer instead of ever reaching the end of it.
  const setFace = useCallback(
    (look: Face) => void setLook({ conversationId, ...look }),
    [setLook, conversationId],
  );

  // What the copy button has just done, said under the row it was pressed in
  // rather than in a bar at the top of the sheet. A new object every press so
  // that pressing again restarts the clock rather than inheriting the last
  // one. `null` means the row is saying its standing line about leaving.
  const [copied, setCopied] = useState<{ said: string; bad?: true } | null>(
    null,
  );

  useEffect(() => {
    if (copied === null) return;
    const timer = setTimeout(() => setCopied(null), 2600);
    return () => clearTimeout(timer);
  }, [copied]);

  const admin =
    detail !== null && (detail.role === "owner" || detail.role === "admin");
  const owner = detail !== null && detail.role === "owner";

  const members = people ?? [];
  const inside = members.filter((member) => member.status === "active");

  return (
    <Frame
      title={detail?.title ?? "Group"}
      onBack={onBack}
      loading={detail === null || people === null}
    >
      {detail === null ? null : admin ? (
        <Customization
          title={detail.title ?? ""}
          look={{
            emoji: detail.emoji,
            initials: detail.initials,
            hue: detail.hue,
          }}
          members={inside.length}
          onRename={async (title) => {
            const result = await rename({ conversationId, title });
            return result.ok;
          }}
          onSet={setFace}
        />
      ) : null}

      <section>
        <SectionLabel>Members ({inside.length})</SectionLabel>
        <ul className="mt-2 flex flex-col">
          {inside.map((member) => (
            <Line
              key={member.clerkId}
              handle={member.handle}
              name={member.displayName}
              imageUrl={member.avatarUrl}
              hue={member.avatarHue}
              emoji={member.avatarEmoji}
              initials={member.avatarInitials}
              detail={member.role === "member" ? undefined : member.role}
            >
              {owner && member.role !== "owner" ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    void setRole({
                      conversationId,
                      clerkId: member.clerkId,
                      role: member.role === "admin" ? "member" : "admin",
                    })
                  }
                >
                  {member.role === "admin" ? "Demote" : "Promote"}
                </Button>
              ) : null}

              {/* An admin cannot remove another admin, and nobody removes the
                  owner. The server enforces both — this only avoids drawing a
                  button that would do nothing. */}
              {admin &&
              member.role !== "owner" &&
              !(member.role === "admin" && !owner) ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    void kick({ conversationId, clerkId: member.clerkId })
                  }
                  className="text-destructive"
                >
                  Remove
                </Button>
              ) : null}
            </Line>
          ))}
        </ul>
      </section>

      {owner && detail !== null ? (
        <section>
          <SectionLabel>How people get in</SectionLabel>

          {/* The same three tiles and the same travelling face as "Who can
              reach you" in the tools panel, laid out the same way and for the
              same reason: the two ends of the question are a word each and go
              side by side, the one in the middle is the one that needs
              explaining and gets the width to explain itself in. */}
          <OptionTiles
            value={detail.joinPolicy}
            onPick={(joinPolicy) =>
              void setJoinPolicy({ conversationId, joinPolicy })
            }
            className="mt-1.5 grid grid-cols-2 gap-1"
            options={[
              { value: "invite", label: "Invite only", icon: LockClosedIcon },
              { value: "open", label: "Anyone", icon: LinkIcon },
              {
                value: "request",
                label: "They ask, you decide",
                detail: "Anyone with the link can request to join.",
                icon: HandRaisedIcon,
                className: "col-span-2",
              },
            ]}
          />
        </section>
      ) : null}

      {/* The two things you do to a group from outside the conversation: pass
          it on, or step out of it. Neither belongs to a section above — the
          link is how the join policy actually reaches anybody, and leaving is
          not a setting at all — so they end the sheet together under one
          heading, one row, equal halves. Stacked full width and unheaded they
          were two grey slabs with a gap between them and no reason for the gap.

          Same shape, different weight: the outline is shared so the row reads
          as one pair, and only the words and the colour say which of them you
          cannot take back. */}
      <section>
        <SectionLabel>Config</SectionLabel>

        {/* `mt-1.5`, the same as the tiles under "How people get in" directly
            above: two rows of buttons hanging off two headings a thumb apart,
            and the eye reads a six-pixel difference between them as one of
            them being wrong rather than as breathing room. */}
        <div className={`mt-1.5 grid gap-2 ${owner ? "grid-cols-2" : ""}`}>
          {/* The link is the whole distribution mechanism, so it has to be one
              press to get hold of. Clipboard access is refused in plenty of
              ordinary situations, so the refusal is caught and answered with
              the one thing left to do — read it off the address bar — rather
              than thrown at a person who pressed a button and got silence. */}
          {owner ? (
            <Button
              variant="outline"
              size="lg"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    `${window.location.origin}${CHAT_HREF}/${conversationId}`,
                  );
                  setCopied({ said: "Link copied." });
                } catch {
                  setCopied({
                    said: "Copy it out of the address bar instead.",
                    bad: true,
                  });
                }
              }}
            >
              Copy the link
            </Button>
          ) : null}

          <Button
            variant="outline"
            size="lg"
            className="text-destructive hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
            onClick={async () => {
              await leave({ conversationId });
              // The panel goes first, because what it is a panel for is about
              // to stop existing for this account: leaving unsubscribes the
              // detail query behind it.
              onBack();
              router.push(CHAT_HREF);
            }}
          >
            {inside.length === 1
              ? "Leave and delete"
              : owner
                ? "Leave and hand over"
                : "Leave this group"}
          </Button>
        </div>

        {/* Half a button is not room for a whole sentence, so the sentence goes
            underneath, centred under the row rather than under either half of
            it — it is the row it explains, not one of the two buttons. The
            last one out gets a line too now: at full width "Leave and delete
            this group" said it all and a second sentence only repeated the
            warning, but "Leave and delete" leaves the *what* unsaid, and
            saying it is an explanation rather than a second warning.

            The copy also reports here, borrowing the line for a couple of
            seconds. A press with no answer is the thing worth fixing, and this
            answers a hand's width from the button that was pressed, in type
            that is already on the page — where a bar at the top of the sheet
            reported the press somewhere the eye was not, and pushed
            everything down to do it. `aria-live` because the sentence changes
            under a reader who is looking elsewhere by then. */}
        <p
          aria-live="polite"
          className={`mt-2 text-center text-[0.8125rem] ${
            copied?.bad ? "text-destructive" : "text-faint"
          }`}
        >
          {copied !== null
            ? copied.said
            : inside.length === 1
              ? "Nobody else is in here, so the group goes with you."
              : owner
                ? "The longest-standing admin takes it over."
                : "Your place in the conversation is kept if you come back."}
        </p>
      </section>
    </Frame>
  );
}

/**
 * What the group is called and what it looks like, in one section.
 *
 * One heading, because they are one job: a group is named and then given a face
 * to go with the name, usually in the same minute.
 *
 * ## Why the choices are not on the page
 *
 * They were, and it was wrong. Sixteen emoji and twelve colours laid out is
 * twenty-eight controls for a decision that takes two seconds and is made once
 * in the life of a group — a wall of buttons in the middle of a settings sheet,
 * shouting louder than the group's name above it and the people below it.
 *
 * So the disc is the control, and it says so: hover it and a pencil arrives on
 * it, press it and the choices open underneath, one question at a time. That is
 * `FaceEditor`, and it is the same control a person edits their own disc with
 * in the settings panel one click away — which is the whole reason it is a
 * component. A group's face and a person's face are the same object, drawn at
 * the same size out of the same two closed sets, and before this they were two
 * different pieces of UI that agreed about none of it.
 *
 * Beside the disc is what the disc stands for: the name, with a pencil that
 * opens the one field that changes it, and under it how many people are in the
 * room. The count is not a control and is not meant to be — it is the line that
 * makes the name a group's name rather than a word. Both are `name-editor.tsx`,
 * which the person's own handle uses in the settings panel a click away; the
 * note there is the argument for why a name is not a field until it is asked
 * for.
 *
 * The name is saved on a button rather than as you type. Every keystroke
 * through `screenStatic` would be a filter somebody could read a word at a
 * time, which is the thing `src/lib/chat.ts` explains at length; it also means
 * a half-typed name is never the name.
 *
 * `onSet` takes the whole face every time, which is what the mutation takes —
 * see `setLook` in `convex/chat/groups.ts`. The editor sends the face it is
 * holding with one part swapped, and the server drops the letters when an emoji
 * arrives, because the disc has room for one thing.
 */
function Customization({
  title,
  look,
  members,
  onRename,
  onSet,
}: {
  title: string;
  look: Face;
  /** How many people are in here, said under the name. */
  members: number;
  onRename: (title: string) => Promise<boolean>;
  onSet: (look: Face) => void;
}) {
  return (
    <section>
      <SectionLabel>Customization</SectionLabel>

      <div className="mt-3">
        <FaceEditor
          name={title === "" ? "Group" : title}
          label="the group picture"
          face={look}
          onChange={onSet}
        >
          <div className="flex min-w-0 items-center gap-1">
            <p className="min-w-0 truncate text-[0.9375rem] font-semibold">
              {title}
            </p>

            {/* A refused name is a fact about the field, so it is said in the
                panel the field is in — see `NameEditor`. Nothing out here
                moves for it. */}
            <NameEditor
              value={title}
              label="group name"
              title="Name"
              maxLength={MAX_TITLE}
              onSave={async (wanted) =>
                (await onRename(wanted)) ? null : "That name will not work."
              }
            />
          </div>

          <p className="mt-0.5 truncate text-[0.8125rem] text-muted-foreground">
            {members === 1 ? "Just you in here" : `${members} people in here`}
          </p>
        </FaceEditor>
      </div>
    </section>
  );
}

/**
 * Invite, and then the reason it would not go, in the width the button was in.
 *
 * Both are in the row the whole time and one of them is always at nothing: two
 * grid columns going 1fr to 0fr and 0fr to 1fr, which is the one way of moving
 * between two content widths that a browser will interpolate rather than jump.
 * The reason is usually wider than the button, so the swap moves the handle
 * beside it too — done in one motion that is easy to follow, where the jump
 * read as the row being replaced.
 *
 * Each column holds its content at `w-max` behind `overflow-hidden`, so the
 * words being put away keep their shape on the way out instead of reflowing
 * narrower and narrower as the column closes.
 *
 * Nothing here checks `prefers-reduced-motion`: the blanket rule at the foot of
 * `globals.css` cuts the duration to nothing and the swap is simply instant,
 * which is the honest still version of it.
 */
function InviteCell({
  refused,
  onInvite,
}: {
  refused?: string;
  onInvite: () => void;
}) {
  const off = refused !== undefined;

  return (
    <span
      className="grid items-center transition-[grid-template-columns] duration-300 ease-out"
      style={{ gridTemplateColumns: off ? "0fr 1fr" : "1fr 0fr" }}
    >
      {/* `inert` rather than unmounted: a button at no width is still a button
          to a keyboard, and tabbing to one nobody can see is worse than the
          jump this is avoiding. */}
      <span className="min-w-0 overflow-hidden">
        <Button size="sm" inert={off} onClick={onInvite} className="w-max">
          Invite
        </Button>
      </span>

      <span className="min-w-0 overflow-hidden">
        <span
          role="status"
          className="block w-max px-1 text-[0.75rem] whitespace-nowrap text-destructive"
        >
          {refused ?? ""}
        </span>
      </span>
    </span>
  );
}

/**
 * One person in a list, with whatever may be done to them on the right.
 *
 * Their display name over their handle when they have one, and the handle
 * alone when they do not; a role, where there is one, goes after the handle.
 */
function Line({
  handle,
  name,
  detail,
  imageUrl,
  hue,
  emoji,
  initials,
  children,
}: {
  handle: string;
  name?: string;
  detail?: string;
  imageUrl?: string;
  /** The disc, when the row's source carries one. See `PublicProfile`. */
  hue?: number;
  emoji?: string;
  initials?: string;
  children?: React.ReactNode;
}) {
  const under = [name === undefined ? null : `@${handle}`, detail]
    .filter((part) => part !== null && part !== undefined)
    .join(" · ");

  return (
    <li className="flex items-center gap-2.5 border-b border-border py-2 last:border-b-0">
      <Monogram
        handle={handle}
        imageUrl={imageUrl}
        hue={hue}
        emoji={emoji}
        initials={initials}
        className="size-7 text-[0.75rem]"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.875rem] font-medium">
          {personName({ handle, displayName: name })}
        </span>
        {under === "" ? null : (
          <span className="block truncate text-[0.75rem] text-faint">
            {under}
          </span>
        )}
      </span>
      <span className="flex shrink-0 gap-1">{children}</span>
    </li>
  );
}
