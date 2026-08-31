"use client";

// Solid for the two on the conversation row, which sit under `ChatTools`'s own
// solid icons and read as the same set. The thread header's is outline, beside
// the outline chevron it shares that bar with.
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  Cog6ToothIcon,
  HandRaisedIcon,
  LinkIcon,
  LockClosedIcon,
  UserPlusIcon,
} from "@heroicons/react/24/solid";
import { UsersIcon } from "@heroicons/react/24/outline";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Monogram } from "@/components/app/chat/monogram";
import { OptionTiles } from "@/components/app/chat/option-tiles";
import { FoundNobody, Searching } from "@/components/app/chat/searching";
import { SectionLabel } from "@/components/app/chat/section-label";
import {
  GROUP_EMOJI,
  GROUP_HUES,
  MAX_INITIALS,
  MAX_TITLE,
} from "@/lib/chat";
import { CHAT_HREF } from "@/lib/nav";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { ConversationDetail } from "../../../../convex/chat/conversations";

/**
 * Running a group, in two sheets rather than one.
 *
 * They were one, and one was wrong. Bringing somebody in is the thing that
 * happens often, takes ten seconds, and is done by anybody with the standing to
 * do it; changing what the group *is* — its name, its face, how people get in,
 * who is admin — happens rarely and is read carefully. A single sheet made the
 * first of those scroll past the second, and put a list of radio buttons under
 * the nose of somebody who came to type one handle.
 *
 * So: `AddSheet` is a field and a list of people. `SettingsSheet` is everything
 * else. Both are opened from the group's row in the conversation list, and the
 * thread header opens the second.
 *
 * What is on the settings sheet depends on the role, and the roles are small on
 * purpose. An owner can do everything including hand the group away by leaving
 * it. An admin can admit, invite, rename, and remove ordinary members. A member
 * can see who is here and leave. None of it reaches outside this group — see
 * the note at the top of `convex/chat/groups.ts`.
 */
export function GroupPanel({
  conversationId,
  detail,
}: {
  conversationId: Id<"conversations">;
  detail: ConversationDetail;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label="Group settings"
        onClick={() => setOpen(true)}
        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
      >
        <UsersIcon className="size-5" />
      </button>

      <SettingsSheet
        conversationId={conversationId}
        detail={detail}
        open={open}
        onOpenChange={setOpen}
      />
    </>
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
  const [adding, setAdding] = useState(false);
  const [settings, setSettings] = useState(false);

  return (
    <>
      {canInvite ? (
        <button
          type="button"
          aria-label="Add someone to this group"
          onClick={() => setAdding(true)}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/[0.08] hover:text-foreground"
        >
          <UserPlusIcon className="size-4" />
        </button>
      ) : null}

      <button
        type="button"
        aria-label="Group settings"
        onClick={() => setSettings(true)}
        className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/[0.08] hover:text-foreground"
      >
        <Cog6ToothIcon className="size-4" />
      </button>

      {canInvite ? (
        <AddSheet
          conversationId={conversationId}
          open={adding}
          onOpenChange={setAdding}
        />
      ) : null}

      <SettingsSheet
        conversationId={conversationId}
        open={settings}
        onOpenChange={setSettings}
      />
    </>
  );
}

/**
 * The group's detail, fetched only while a sheet is open.
 *
 * Passed in from the thread, which already has it, and queried here for the
 * list, which does not — so a column of ten groups is not ten subscriptions for
 * panels nobody has looked at.
 */
function useDetail(
  conversationId: Id<"conversations">,
  open: boolean,
  given?: ConversationDetail,
): ConversationDetail | null {
  const fetched = useQuery(
    api.chat.conversations.get,
    open && given === undefined ? { conversationId } : "skip",
  );
  return given ?? fetched ?? null;
}

/** A sheet with its title, and a spinner until there is anything to put in it. */
function Frame({
  title,
  open,
  onOpenChange,
  loading,
  children,
}: {
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col gap-0 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>

        {loading ? (
          <div className="flex flex-1 items-center justify-center py-12">
            <Spinner />
          </div>
        ) : (
          <div className="flex flex-col gap-6 px-4 pb-6">{children}</div>
        )}
      </SheetContent>
    </Sheet>
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
function AddSheet({
  conversationId,
  open,
  onOpenChange,
}: {
  conversationId: Id<"conversations">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const detail = useDetail(conversationId, open);

  const requests = useQuery(
    api.chat.groups.requests,
    open ? { conversationId } : "skip",
  );

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
    open && query.length >= 2 ? { term: query } : "skip",
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

  const [notice, setNotice] = useState<string | null>(null);

  const field = useRef<HTMLInputElement>(null);
  const ready = detail !== null;

  // The button that opened this came here to type a handle, so the caret is
  // already in the field — but not until the detail lands, because until then
  // there is no field to put it in.
  useEffect(() => {
    if (open && ready) field.current?.focus();
  }, [open, ready]);

  const alreadyIn = new Set(
    (detail?.members ?? []).map((member) => member.clerkId),
  );
  const asked = (detail?.members ?? []).filter(
    (member) => member.status === "invited",
  );

  async function send(peerClerkId: string) {
    const result = await invite({ conversationId, peerClerkId });
    setNotice(
      result.ok
        ? "Invited. They have to accept."
        : result.reason === "full"
          ? "This group is full."
          : result.reason === "already"
            ? "They are already here."
            : result.reason === "blocked"
              ? "You cannot invite this person."
              : "That did not work.",
    );
  }

  return (
    <Frame
      title="Add to this group"
      open={open}
      onOpenChange={onOpenChange}
      loading={detail === null}
    >
      {notice === null ? null : (
        <p className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-[0.8125rem]">
          {notice}
        </p>
      )}

      {(requests ?? []).length > 0 ? (
        <section>
          <SectionLabel>Asking to join</SectionLabel>
          <ul className="mt-2 flex flex-col">
            {(requests ?? []).map((person) => (
              <Line key={person.clerkId} handle={person.handle}>
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
            setNotice(null);
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
            // Nobody is discoverable by accident — see `discoverable` on the
            // profile — so a search finding nothing here is as likely to be
            // somebody who has turned themselves off as a handle typed wrong,
            // and saying so saves a person trying it four more times.
            return rows.length === 0 ? (
              <FoundNobody>
                Nobody by that handle, or they are not letting themselves be
                found.
              </FoundNobody>
            ) : (
              <ul className="mt-1 flex flex-col">
                {rows.map((person) => (
                  <Line
                    key={person.clerkId}
                    handle={person.handle}
                    hue={person.avatarHue}
                    initials={person.avatarInitials}
                  >
                    <Button size="sm" onClick={() => void send(person.clerkId)}>
                      Invite
                    </Button>
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
function SettingsSheet({
  conversationId,
  detail: given,
  open,
  onOpenChange,
}: {
  conversationId: Id<"conversations">;
  detail?: ConversationDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const detail = useDetail(conversationId, open, given);

  const kick = useMutation(api.chat.groups.kick);
  const setRole = useMutation(api.chat.groups.setRole);
  const setJoinPolicy = useMutation(api.chat.groups.setJoinPolicy);
  const setLook = useMutation(api.chat.groups.setLook);
  const rename = useMutation(api.chat.groups.rename);
  const leave = useMutation(api.chat.groups.leave);

  const [notice, setNotice] = useState<string | null>(null);

  const admin =
    detail !== null && (detail.role === "owner" || detail.role === "admin");
  const owner = detail !== null && detail.role === "owner";

  const members = detail?.members ?? [];
  const inside = members.filter((member) => member.status === "active");

  return (
    <Frame
      title={detail?.title ?? "Group"}
      open={open}
      onOpenChange={onOpenChange}
      loading={detail === null}
    >
      {notice === null ? null : (
        <p className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-[0.8125rem]">
          {notice}
        </p>
      )}

      {detail === null ? null : admin ? (
        <Customization
          title={detail.title ?? ""}
          look={{
            emoji: detail.emoji,
            initials: detail.initials,
            hue: detail.hue,
          }}
          onRename={async (title) => {
            const result = await rename({ conversationId, title });
            setNotice(result.ok ? null : "That name will not work.");
            return result.ok;
          }}
          onSet={(look) => void setLook({ conversationId, ...look })}
        />
      ) : null}

      <section>
        <SectionLabel>Members ({inside.length})</SectionLabel>
        <ul className="mt-2 flex flex-col">
          {inside.map((member) => (
            <Line
              key={member.clerkId}
              handle={member.handle}
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

          {/* The link is the whole distribution mechanism, so it has to be one
              press to get hold of. Falls back to saying nothing rather than
              throwing: clipboard access is refused in plenty of ordinary
              situations and none of them are worth an error. */}
          <Button
            variant="outline"
            size="sm"
            className="mt-3 w-full"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  `${window.location.origin}${CHAT_HREF}/${conversationId}`,
                );
                setNotice("Link copied.");
              } catch {
                setNotice("Copy the address bar to share this group.");
              }
            }}
          >
            Copy the link
          </Button>
        </section>
      ) : null}

      <section>
        <Button
          variant="outline"
          className="w-full text-destructive"
          onClick={async () => {
            await leave({ conversationId });
            onOpenChange(false);
            router.push(CHAT_HREF);
          }}
        >
          {inside.length === 1
            ? "Leave and delete this group"
            : owner
              ? "Leave and hand it over"
              : "Leave this group"}
        </Button>
        {/* Nothing under the button when you are the last one in: it already
            says it deletes the group, and a second sentence saying so is a
            warning rather than an explanation. */}
        {inside.length === 1 ? null : (
          <p className="mt-2 text-[0.8125rem] text-faint">
            {owner
              ? "The longest-standing admin takes it over."
              : "Your place in the conversation is kept if you come back."}
          </p>
        )}
      </section>
    </Frame>
  );
}

type Look = { emoji?: string; initials?: string; hue?: number };

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
 * So the disc is the control. Press it and it moves to the next face; the two
 * steppers beside it walk the same ring in either direction, and the colour on
 * its own. Nothing is enumerated, the section is four rows tall instead of
 * twelve, and the thing being changed is the thing you are looking at rather
 * than a grid of small copies of it.
 *
 * Both rings start at "none", so stepping back from the first face is the way
 * out of having one at all — the same place `Default` gets to in one press.
 *
 * The name is saved on a button rather than as you type. Every keystroke
 * through `screenStatic` would be a filter somebody could read a word at a
 * time, which is the thing `src/lib/chat.ts` explains at length; it also means
 * a half-typed name is never the name. The letters commit on blur for the
 * plainer reason that two characters typed one at a time would otherwise be
 * three saves and a wrong disc in between.
 *
 * `onSet` takes the whole face every time, which is what the mutation takes —
 * see `setLook` in `convex/chat/groups.ts`. Each control here sends the face it
 * is holding with its own part swapped, and the server drops the letters when
 * an emoji arrives, because the disc has room for one thing.
 */
function Customization({
  title,
  look,
  onRename,
  onSet,
}: {
  title: string;
  look: Look;
  onRename: (title: string) => Promise<boolean>;
  onSet: (look: Look) => void;
}) {
  const { emoji, initials, hue } = look;

  const [name, setName] = useState(title);
  const [busy, setBusy] = useState(false);
  const [letters, setLetters] = useState(initials ?? "");

  const wantedName = name.trim();
  const renamable = wantedName !== title && wantedName !== "";

  const chosen =
    emoji !== undefined || initials !== undefined || hue !== undefined;

  /** Round the ring of faces, which begins with not having one. */
  function stepFace(by: number) {
    const ring = GROUP_EMOJI.length + 1;
    const faces: readonly string[] = GROUP_EMOJI;
    const at = emoji === undefined ? 0 : faces.indexOf(emoji) + 1;
    const next = (at + by + ring) % ring;
    onSet({
      emoji: next === 0 ? undefined : GROUP_EMOJI[next - 1],
      initials: letters.trim() || undefined,
      hue,
    });
  }

  /** And the ring of colours, which begins with the one the name gives it. */
  function stepColour(by: number) {
    const ring = GROUP_HUES.length + 1;
    const wheel: readonly number[] = GROUP_HUES;
    const at = hue === undefined ? 0 : wheel.indexOf(hue) + 1;
    const next = (at + by + ring) % ring;
    onSet({
      emoji,
      initials: letters.trim() || undefined,
      hue: next === 0 ? undefined : GROUP_HUES[next - 1],
    });
  }

  return (
    <section>
      <SectionLabel>Customization</SectionLabel>

      <form
        className="mt-3 flex gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!renamable || busy) return;
          setBusy(true);
          const ok = await onRename(wantedName);
          setBusy(false);
          if (!ok) setName(title);
        }}
      >
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={MAX_TITLE}
          autoComplete="off"
          aria-label="Group name"
          className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-[0.875rem] transition-[border-color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
        />
        <Button type="submit" size="lg" disabled={!renamable || busy}>
          {busy ? "…" : "Save"}
        </Button>
      </form>

      <div className="mt-3 flex items-start gap-3">
        {/* The disc is the button. It says so on hover with a ring rather than
            with a pencil over the top of it: whatever is under the pointer is
            the thing about to change, and covering it to say so would hide the
            only preview there is. */}
        <button
          type="button"
          aria-label="Next picture"
          onClick={() => stepFace(1)}
          className="shrink-0 cursor-pointer rounded-full outline-none ring-2 ring-transparent transition-[box-shadow] hover:ring-border-strong focus-visible:ring-ring"
        >
          <Monogram
            handle={title === "" ? "Group" : title}
            emoji={emoji}
            initials={initials}
            hue={hue}
            className="size-14 text-[1.25rem]"
          />
        </button>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Stepper label="Picture" onStep={stepFace} />
          <Stepper label="Colour" onStep={stepColour} />
        </div>
      </div>

      <div className="mt-1.5 flex gap-2">
        <input
          value={letters}
          onChange={(event) =>
            setLetters(event.target.value.replace(/[^a-z0-9]/gi, ""))
          }
          onBlur={() => {
            const wanted = letters.trim();
            if (wanted === (initials ?? "")) return;
            onSet({ emoji, initials: wanted || undefined, hue });
          }}
          maxLength={MAX_INITIALS}
          spellCheck={false}
          autoComplete="off"
          aria-label="Letters on the picture"
          placeholder={`Letters, or ${(title.slice(0, 1) || "g").toLowerCase()}`}
          className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-[0.875rem] transition-[border-color,box-shadow] outline-none placeholder:text-faint focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
        />

        {/* Back to the letter and colour the name gives it, which is where every
            group starts and the only way back to it in one press. */}
        <Button
          type="button"
          variant="outline"
          size="lg"
          disabled={!chosen}
          onClick={() => {
            setLetters("");
            onSet({});
          }}
        >
          Default
        </Button>
      </div>
    </section>
  );
}

/** One ring, walked a step at a time. The disc beside it is the readout. */
function Stepper({
  label,
  onStep,
}: {
  label: string;
  onStep: (by: number) => void;
}) {
  return (
    <div className="flex h-9 items-center rounded-lg border border-border">
      <button
        type="button"
        aria-label={`Previous ${label.toLowerCase()}`}
        onClick={() => onStep(-1)}
        className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-l-lg text-muted-foreground transition-colors outline-none hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset"
      >
        <ChevronLeftIcon className="size-4" />
      </button>

      <span className="min-w-0 flex-1 truncate text-center text-[0.8125rem] text-muted-foreground">
        {label}
      </span>

      <button
        type="button"
        aria-label={`Next ${label.toLowerCase()}`}
        onClick={() => onStep(1)}
        className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-r-lg text-muted-foreground transition-colors outline-none hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset"
      >
        <ChevronRightIcon className="size-4" />
      </button>
    </div>
  );
}

/** One person in a list, with whatever may be done to them on the right. */
function Line({
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
  children?: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-2.5 border-b border-border py-2 last:border-b-0">
      <Monogram
        handle={handle}
        hue={hue}
        initials={initials}
        className="size-7 text-[0.75rem]"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.875rem] font-medium">{handle}</span>
        {detail === undefined ? null : (
          <span className="block text-[0.75rem] text-faint">{detail}</span>
        )}
      </span>
      <span className="flex shrink-0 gap-1">{children}</span>
    </li>
  );
}
