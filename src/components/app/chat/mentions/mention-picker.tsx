"use client";

import type { MentionCandidate } from "@/components/app/chat/mentions";
import { Monogram } from "@/components/app/chat/monogram";
import { popupVariants } from "@/components/ui/popup";
import { Spinner } from "@/components/ui/spinner";
import { BOT_TAGS_PER_DAY, isBot, personName } from "@/lib/chat";
import { cn } from "@/lib/utils";

/**
 * The list under the caret.
 *
 * Above the box, because the box is at the foot of the pane and there is
 * nowhere else. Rows are pressed with the mouse held down rather than on
 * click — `onMouseDown` with the default prevented — so the textarea never
 * loses focus on the way: a picker that blurs the field it is completing
 * closes itself before the pick lands.
 *
 * Keyboard handling is the composer's, which owns the field the keys arrive
 * in; this draws the row it is told is active and says which one was pressed.
 */
export function MentionPicker({
  id,
  candidates,
  active,
  loading,
  query,
  onActiveChange,
  onPick,
}: {
  id: string;
  candidates: MentionCandidate[];
  active: number;
  loading: boolean;
  query: string;
  onActiveChange: (index: number) => void;
  onPick: (candidate: MentionCandidate) => void;
}) {
  return (
    <div
      id={id}
      role="listbox"
      aria-label="People to mention"
      className={cn(
        popupVariants({ motion: "none", padding: "xs" }),
        "animate-notice-in absolute bottom-full left-0 z-30 mb-2 flex w-72 max-w-[calc(100vw-2rem)] flex-col",
      )}
    >
      {candidates.map((candidate, index) => {
        const current = index === active;
        return (
          <button
            key={
              candidate.kind === "everyone"
                ? "@everyone"
                : candidate.person.clerkId
            }
            type="button"
            role="option"
            id={optionId(id, index)}
            aria-selected={current}
            tabIndex={-1}
            onMouseDown={(event) => event.preventDefault()}
            onMouseMove={() => {
              if (!current) onActiveChange(index);
            }}
            onClick={() => onPick(candidate)}
            className={cn(
              "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-left outline-none",
              current && "bg-foreground/[0.06]",
            )}
          >
            {candidate.kind === "everyone" ? (
              <>
                <span
                  aria-hidden
                  className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/12 text-[0.875rem] font-semibold text-primary"
                >
                  @
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.875rem] font-medium">
                    Everyone
                  </span>
                  <span className="block truncate text-[0.75rem] text-faint">
                    Notify everyone in this group
                  </span>
                </span>
              </>
            ) : (
              <>
                <Monogram
                  handle={candidate.person.handle}
                  imageUrl={candidate.person.avatarUrl}
                  hue={candidate.person.avatarHue}
                  emoji={candidate.person.avatarEmoji}
                  initials={candidate.person.avatarInitials}
                  className="size-7 text-[0.6875rem]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.875rem] font-medium">
                    {personName(candidate.person)}
                  </span>
                  <span className="block truncate text-[0.75rem] text-faint">
                    {isBot(candidate.person.clerkId)
                      ? `${BOT_TAGS_PER_DAY} tags, refilling through the day`
                      : `@${candidate.person.handle}`}
                  </span>
                </span>
              </>
            )}
          </button>
        );
      })}

      {candidates.length === 0 ? (
        loading ? (
          <div className="flex items-center justify-center gap-2 py-3">
            <Spinner className="size-3.5 text-faint" />
          </div>
        ) : (
          <p className="px-2 py-3 text-center text-[0.8125rem] leading-snug text-muted-foreground">
            {query === ""
              ? "Type a handle to find someone."
              : "Nobody by that name in here."}
          </p>
        )
      ) : null}
    </div>
  );
}

/** The id of one row, for `aria-activedescendant` on the field. */
export function optionId(listId: string, index: number): string {
  return `${listId}-${index}`;
}
