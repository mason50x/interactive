"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Frame } from "@/components/app/chat/group-panel/frame";
import { InviteCell } from "@/components/app/chat/group-panel/invite-cell";
import { Line } from "@/components/app/chat/group-panel/line";
import {
  useDetail,
  useMembers,
} from "@/components/app/chat/group-panel/use-group";
import { FoundNobody, Searching } from "@/components/app/chat/searching";
import { useDebounced } from "@/lib/use-debounced";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

/**
 * Bringing people in, and letting waiting people through.
 *
 * Both halves of one job: somebody you go and find, and somebody who already
 * came and knocked. Keeping them together is why this sheet is worth having
 * apart from the other one — a request left waiting is the thing most likely to
 * be missed, and here it is at the top rather than four sections down.
 */
export function AddView({
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
  const wanted = term.trim();
  const query = useDebounced(wanted, 250);

  const found = useQuery(
    api.chat.profiles.search,
    query.length >= 2 ? { term: query } : "skip",
  );

  // Two questions, and only the second may be answered out loud. The section
  // is open from the second character; what is under it is a wait until the
  // field has settled *and* the answer to that exact term is in — `useQuery`
  // goes back to `undefined` when its argument changes, so this covers the
  // round trip after the debounce as well as the debounce.
  const searching = wanted.length >= 2;
  const settled = query === wanted && found !== undefined;

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
          <Separator>Asking to join</Separator>
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
        <Separator>Find somebody</Separator>
        <Input
          ref={field}
          size="lg"
          value={term}
          onChange={(event) => {
            setTerm(event.target.value.toLowerCase());
            setRefused({});
          }}
          placeholder="Their handle"
          spellCheck={false}
          autoComplete="off"
          aria-label="Search handles"
          className="mt-3"
        />

        {/* Nothing at all until there is something to say. Below two
            characters this section is a field and a label, which is the honest
            shape of a search nobody has typed yet. */}
        {!searching ? null : !settled ? (
          <Searching />
        ) : (
          <Found
            people={found.filter((person) => !alreadyIn.has(person.clerkId))}
            refused={refused}
            onInvite={(clerkId) => void send(clerkId)}
          />
        )}
      </section>

      {asked.length > 0 ? (
        <section>
          <Separator>Invited, not yet in</Separator>
          <p className="mt-2 text-[0.8125rem] text-muted-foreground">
            {asked.map((member) => member.handle).join(", ")}.
          </p>
        </section>
      ) : null}
    </Frame>
  );
}

/**
 * The people a settled search turned up who are not already in the group.
 *
 * Everybody can be found by handle, so nothing here is a handle typed wrong
 * or somebody already in the group — and saying so saves a person trying it
 * four more times.
 */
function Found({
  people,
  refused,
  onInvite,
}: {
  people: {
    clerkId: string;
    handle: string;
    displayName?: string;
    avatarUrl?: string;
    avatarHue?: number;
    avatarEmoji?: string;
    avatarInitials?: string;
  }[];
  /** The refusal for each person whose invite would not go, by id. */
  refused: Record<string, string>;
  onInvite: (clerkId: string) => void;
}) {
  if (people.length === 0) {
    return (
      <FoundNobody>
        Nobody by that handle, or they are already in the group.
      </FoundNobody>
    );
  }

  return (
    <ul className="mt-1 flex flex-col">
      {people.map((person) => (
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
            onInvite={() => onInvite(person.clerkId)}
          />
        </Line>
      ))}
    </ul>
  );
}
