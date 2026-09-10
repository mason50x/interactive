"use client";

import {
  HandRaisedIcon,
  LinkIcon,
  LockClosedIcon,
} from "@heroicons/react/24/solid";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { Face } from "@/components/app/chat/face-editor";
import { Customization } from "@/components/app/chat/group-panel/customization";
import { Frame } from "@/components/app/chat/group-panel/frame";
import { Line } from "@/components/app/chat/group-panel/line";
import {
  useDetail,
  useMembers,
} from "@/components/app/chat/group-panel/use-group";
import { OptionTiles } from "@/components/app/chat/option-tiles";
import { CHAT_HREF } from "@/lib/nav";
import { useTransientFlag } from "@/lib/use-transient-flag";
import { cn } from "@/lib/utils";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

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
export function SettingsView({
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
  // rather than in a bar at the top of the sheet. The words are kept apart
  // from whether they are showing: the flag lowers itself a couple of seconds
  // after it is raised, and while it is down the row says its standing line
  // about leaving.
  const [copied, setCopied] = useState<{ said: string; bad?: true } | null>(
    null,
  );
  const [showingCopied, showCopied] = useTransientFlag(2600);

  function report(said: string, bad?: true) {
    setCopied(bad ? { said, bad } : { said });
    showCopied();
  }

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
        <Separator>Members ({inside.length})</Separator>
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
          <Separator>How people get in</Separator>

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
        <Separator>Config</Separator>
        {/* `mt-1.5`, the same as the tiles under "How people get in" directly
            above: two rows of buttons hanging off two headings a thumb apart,
            and the eye reads a six-pixel difference between them as one of
            them being wrong rather than as breathing room. */}
        <div className={cn("mt-1.5 grid gap-2", owner && "grid-cols-2")}>
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
                  report("Link copied.");
                } catch {
                  report("Copy it out of the address bar instead.", true);
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
          className={cn(
            "mt-2 text-center text-[0.8125rem]",
            showingCopied && copied?.bad ? "text-destructive" : "text-faint",
          )}
        >
          {showingCopied && copied !== null
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
