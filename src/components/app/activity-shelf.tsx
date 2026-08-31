import { ActivityRow } from "@/components/app/activity-row";
import type { Activity, Genre } from "@/lib/activity";
import { GENRES } from "@/lib/genres";

/**
 * One genre, as a head and a row you scroll sideways.
 *
 * A row rather than a grid because the catalogue is not a flat set of 318
 * things — it is six sections of wildly different sizes, and Reaction alone
 * is 130 activities. A grid of all of them is a wall you scroll past; six rows are six
 * decisions, each one shelf-height, and the head tells you what you are
 * looking at before you look at it.
 *
 * The scroller itself is `ActivityRow`, which the home page also uses. What is
 * left here is the head, which is the only part of a shelf that is about a
 * genre — and with the row gone this no longer holds state and no longer needs
 * to be a client component.
 */
export function ActivityShelf({
  genre,
  activities,
  /** Shown instead of the genre's own copy when the row is a filtered subset. */
  countLabel,
}: {
  genre: Genre;
  activities: readonly Activity[];
  countLabel?: string;
}) {
  const meta = GENRES[genre];

  return (
    <section
      style={{ "--hue": meta.hue } as React.CSSProperties}
      aria-labelledby={`shelf-${genre}`}
    >
      <div className="flex items-center gap-3">
        {/* The mark itself, at the height of the two lines beside it and in
            the genre's own colour. No plate under it: a tinted square would
            add a second shape to read before the icon inside it, and at this
            size the solid cut carries the shelf on its own. */}
        <meta.icon
          className="size-10 shrink-0"
          style={{ color: "var(--hue)" }}
        />

        <div className="min-w-0">
          <h2
            id={`shelf-${genre}`}
            className="text-[1.25rem] leading-tight font-semibold text-foreground"
          >
            {meta.label}
          </h2>
          <p className="label-small mt-0.5 truncate text-faint">
            {countLabel ?? `${meta.description} ${activities.length} of them.`}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <ActivityRow activities={activities} />
      </div>
    </section>
  );
}
