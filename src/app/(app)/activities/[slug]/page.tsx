import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GameViewRecorder } from "@/components/app/game-views";
import { ActivityFrame } from "@/components/app/activity-frame";
import { findActivity } from "@/lib/activities";
import { activityFrameSrc } from "@/lib/learn";

export async function generateMetadata({
  params,
}: PageProps<"/activities/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  return { title: findActivity(slug)?.title ?? "Activities" };
}

/**
 * One route for every activity.
 *
 * The app's side of the frame is the same for all of them — protect the route,
 * frame `/learn/<slug>` — so there is nothing a per-activity page could add
 * beyond a title and a genre, both of which the catalogue already carries.
 *
 * Unlike every other page in the signed-in app, this one has no container: the
 * frame is the page and takes the shell edge to edge. The title and the way
 * back moved into the overlay on top of it, which is the only chrome an activity
 * gets. See `ActivityFrame`.
 */
export default async function ActivityPage({
  params,
}: PageProps<"/activities/[slug]">) {
  await auth.protect();
  const { slug } = await params;

  const activity = findActivity(slug);
  if (!activity) notFound();

  return (
    <>
      <GameViewRecorder slug={activity.slug} />
      <ActivityFrame
        title={activity.title}
        src={activityFrameSrc(activity.slug)}
      />
    </>
  );
}
