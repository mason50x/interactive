"use client";

import type { ReactNode } from "react";
import { GlideList } from "@/components/app/chat/glide-list";
import { Monogram } from "@/components/app/chat/monogram";
import { PersonCard } from "@/components/app/chat/person-card";
import { personName } from "@/lib/chat";
import { Separator } from "@/components/ui/separator";

/**
 * The pieces every list of people is built from, so the three lists — search
 * results, requests, friends — are one kind of row seen three times.
 */

export type Person = {
  clerkId: string;
  handle: string;
  displayName?: string;
  avatarHue?: number;
  avatarEmoji?: string;
  avatarInitials?: string;
  avatarUrl?: string;
};

/**
 * One person: their disc, their name over their handle, and whatever may be
 * done to them on the right.
 *
 * With `card`, the name and disc are a button that opens their card — see
 * `PersonCard` — which is where Message, Add and Block live. The controls on
 * the right are for what the list itself is for: answering a request, say.
 */
export function PersonRow({
  person,
  card = true,
  detail,
  children,
}: {
  person: Person;
  card?: boolean;
  detail?: string;
  children?: ReactNode;
}) {
  const name = personName(person);
  const face = (
    <>
      <Monogram
        handle={person.handle}
        imageUrl={person.avatarUrl}
        hue={person.avatarHue}
        emoji={person.avatarEmoji}
        initials={person.avatarInitials}
        className="size-8 text-[0.75rem]"
      />
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[0.875rem] font-medium">
          {name}
        </span>
        <span className="block truncate text-[0.75rem] text-faint">
          {detail ?? `@${person.handle}`}
        </span>
      </span>
    </>
  );

  // Hover is not the row's to draw: the list it is in slides one highlight
  // between whichever rows can be pressed — see `GlideList`. A row with no
  // card is not one of those, so the highlight passes it by.
  return (
    <li
      data-glide-row={card ? "" : undefined}
      className="flex min-h-11 items-center gap-2"
    >
      {card ? (
        <PersonCard
          person={person}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-lg px-1.5 py-1 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60 data-popup-open:bg-foreground/[0.06]"
        >
          {face}
        </PersonCard>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-2.5 px-1.5 py-1">
          {face}
        </span>
      )}
      {children === undefined ? null : (
        <span className="flex shrink-0 items-center gap-1 pr-1">
          {children}
        </span>
      )}
    </li>
  );
}

export function Group({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <section className="pt-3">
      <Separator>{label}</Separator>
      <GlideList className="mt-1" listClassName="flex flex-col">
        {children}
      </GlideList>
    </section>
  );
}
