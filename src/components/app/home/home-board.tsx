"use client";

import { useQuery } from "convex/react";
import { useCallback, useMemo } from "react";
import { ActivityRow } from "@/components/app/activity-row";
import { Spinner } from "@/components/ui/spinner";
import type { Activity } from "@/lib/activity";
import { formatSince } from "@/lib/time";
import { useNow } from "@/lib/use-now";
import { api } from "../../../../convex/_generated/api";

/**
 * Everything on the home page that depends on what you have opened.
 *
 * One component and not three, because all of it comes off the same three
 * subscriptions and the interesting decisions are the ones *between* the
 * sections: whether a row appears at all depends on whether the one above it
 * did. Splitting them would mean lifting that back up into a parent anyway,
 * with the queries duplicated on the way.
 *
 * A brand-new account has opened nothing, so two of the three rows have
 * nothing in them. They are not rendered as empty states — a heading over a message
 * explaining that a row is empty is a worse use of the space than not having
 * the row — so the page is short on day one and grows as there is something to
 * put in it. "Most popular today" is the exception and always draws, because
 * it is topped up from the catalogue.
 *
 * The catalogue arrives as a prop and is not imported, which is the same
 * boundary `ActivitiesBrowser` keeps: importing it into a `"use client"` module
 * puts all 318 entries in a `/_next/static` chunk that is served without a
 * session. Here it rides in the home page's RSC payload instead, behind
 * `auth.protect()`. See `src/lib/activities.ts`.
 *
 * It needs the whole catalogue rather than a slice of it, because the slugs it
 * has to resolve come back from Convex and can be any activity the account has
 * ever opened.
 */

/** How many tiles a row asks for. Enough to overflow at any width, which is
 *  what makes the row scroll and read as a row. */
const ROW_SIZE = 18;

export function HomeBoard({ activities }: { activities: readonly Activity[] }) {
  const favourites = useQuery(api.views.favourites, { limit: ROW_SIZE });
  const recent = useQuery(api.views.recent, { limit: ROW_SIZE });
  const popular = useQuery(api.views.popularToday, { limit: ROW_SIZE });

  const now = useNow();

  // The lookup the catalogue used to hand out as `findActivity`. Built once
  // per catalogue, which in practice is once: the prop is the same array on
  // every render of a given page load.
  const bySlug = useMemo(
    () => new Map(activities.map((activity) => [activity.slug, activity])),
    [activities],
  );

  const resolve = useCallback(
    /** Rows come back as slugs and counts; the catalogue is what turns them
     *  into something with art on it. A slug the catalogue no longer carries —
     *  an activity retired between one build and the next — simply drops out. */
    (rows: readonly { slug: string }[]): Activity[] =>
      rows
        .map((row) => bySlug.get(row.slug))
        .filter((activity): activity is Activity => activity !== undefined),
    [bySlug],
  );

  // `undefined` is Convex still connecting. Only the first paint is ever in
  // that state, and the page holds its shape through it rather than drawing
  // rows that are about to disappear.
  const loading =
    favourites === undefined || recent === undefined || popular === undefined;

  const favouriteRow = useMemo(
    () => resolve(favourites ?? []),
    [favourites, resolve],
  );
  const recentRow = useMemo(() => resolve(recent ?? []), [recent, resolve]);

  /**
   * Today's board, topped up.
   *
   * The real counts come first and in order, and the rest of the row is the
   * catalogue's own hand-ordered popularity with the already-listed slugs
   * removed. On a quiet morning that is nearly the whole row, which is the
   * point: "most popular today" with two tiles in it looks broken, and the
   * catalogue's order is the same claim made about a longer window.
   *
   * The two halves are labelled differently on the card — a real entry says
   * how many people, a topped-up one says its rank — so the card never
   * presents the fallback as though it were today's data.
   */
  const popularRow = useMemo(() => {
    const counted = (popular ?? [])
      .map((row) => {
        const activity = bySlug.get(row.slug);
        return activity ? { activity, views: row.views } : null;
      })
      .filter(
        (entry): entry is { activity: Activity; views: number } =>
          entry !== null,
      );

    const listed = new Set(counted.map((entry) => entry.activity.slug));
    // `activities` is already rank-ascending, so taking it in order is the
    // catalogue's own popularity.
    const filler = activities
      .filter((activity) => !listed.has(activity.slug))
      .slice(0, ROW_SIZE - counted.length)
      .map((activity) => ({ activity, views: 0 }));

    return [...counted, ...filler];
  }, [activities, bySlug, popular]);

  const viewCounts = useMemo(
    () => new Map((favourites ?? []).map((row) => [row.slug, row.count])),
    [favourites],
  );
  const lastViewed = useMemo(
    () => new Map((recent ?? []).map((row) => [row.slug, row.lastViewedAt])),
    [recent],
  );
  const viewsToday = useMemo(
    () =>
      new Map(popularRow.map((entry) => [entry.activity.slug, entry.views])),
    [popularRow],
  );

  if (loading) {
    return (
      <div className="flex h-56 items-center justify-center">
        <Spinner className="size-5 text-faint" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-12">
      <Section title="Most popular today">
        <ActivityRow
          activities={popularRow.map((entry) => entry.activity)}
          note={(activity) => {
            const views = viewsToday.get(activity.slug) ?? 0;
            return views > 0
              ? `${views} ${views === 1 ? "view" : "views"} today`
              : undefined;
          }}
        />
      </Section>

      {recentRow.length > 0 && (
        <Section title="Jump back in">
          <ActivityRow
            activities={recentRow}
            note={(activity) => {
              const at = lastViewed.get(activity.slug);
              if (at === undefined || now === null) return undefined;
              return formatSince(at, now);
            }}
          />
        </Section>
      )}

      {/* Two of anything is not a favourites list, it is the two things you
          have opened — and "jump back in" is already showing them. */}
      {favouriteRow.length >= 3 && (
        <Section title="Your favourites">
          <ActivityRow
            activities={favouriteRow}
            note={(activity) => {
              const count = viewCounts.get(activity.slug) ?? 0;
              return `Opened ${count} ${count === 1 ? "time" : "times"}`;
            }}
          />
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-[1.25rem] leading-tight font-semibold text-foreground">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}
