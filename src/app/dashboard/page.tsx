import { auth, currentUser } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { HomeGreeting } from "@/components/app/home/greeting";
import { HomeBoard } from "@/components/app/home/home-board";
import { StatsCard } from "@/components/app/home/stats-card";
import { StreakCard } from "@/components/app/home/streak-card";
import { WeatherCard } from "@/components/app/home/weather-card";
import { ACTIVITIES } from "@/lib/activities";

export const metadata: Metadata = { title: "Home" };

/**
 * Home.
 *
 * It was a placeholder holding a route open; this is what went in it. The
 * shape is a greeting, a row of three things that are true about today, and
 * then rows of activities — narrowing from "you" to "what to
 * open" down the page, which is the order someone actually arrives in.
 *
 * ## What is rendered where, and why
 *
 * The greeting is server-rendered and everything below it is not, and the
 * split is not arbitrary. The name comes from Clerk on the server so the first
 * HTML already says it — a heading that reads "Welcome back" and then adds a
 * name is a heading that visibly reassembles itself.
 *
 * Everything else needs the browser. The streak, the counters and the rows are
 * Convex subscriptions, which is also the right answer for them: these numbers
 * change while you are looking at them, so finish an activity, come back, and
 * they have already moved. The weather needs the browser for a different
 * reason — it asks the device where it is rather than guessing from the IP
 * (see `src/lib/weather.ts`).
 *
 * ## Width
 *
 * `max-w-6xl`, matching the catalogue rather than the `max-w-5xl` the prose
 * pages use, because this page is rows of art too and the extra measure is a
 * third card visible in each row before you scroll.
 */
export default async function DashboardPage() {
  // The layout guards the shell, but the router does not re-render a shared
  // layout between sibling pages, so every page under /dashboard guards itself.
  await auth.protect();

  const user = await currentUser();

  // A first name is the greeting; a full name in a heading reads as a form
  // letter. `username` is the fallback for accounts created without one, and
  // `null` means the greeting simply stops after "Welcome back".
  const name = user?.firstName ?? user?.username ?? null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 pt-12 pb-16 sm:px-10">
      <HomeGreeting name={name} />

      {/* One column on a phone, three from `md`. Deliberately not two at any
          width: the three cards are peers and a 2+1 layout makes whichever one
          wraps look like a footnote to the other two. */}
      <div className="grid gap-4 md:grid-cols-3">
        <StreakCard />
        <WeatherCard />
        <StatsCard />
      </div>

      {/* Handed the catalogue rather than importing it: that import inside a
          client component would put all 318 entries in a public static chunk.
          See `src/lib/activities.ts`. */}
      <HomeBoard activities={ACTIVITIES} />
    </div>
  );
}
