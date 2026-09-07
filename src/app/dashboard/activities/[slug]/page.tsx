import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActivityFrame } from "@/components/app/activity-frame";
import { ViewRecorder } from "@/components/app/view-recorder";
import { findActivity } from "@/lib/activities";
import { activityFrameSrc } from "@/lib/learn";

export async function generateMetadata({
  params,
}: PageProps<"/dashboard/activities/[slug]">): Promise<Metadata> {
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
 * Unlike every other page under `/dashboard`, this one has no container: the
 * frame is the page and takes the shell edge to edge. The title and the way
 * back moved into the overlay on top of it, which is the only chrome an activity
 * gets. See `ActivityFrame`.
 */
export default async function ActivityPage({
  params,
}: PageProps<"/dashboard/activities/[slug]">) {
  await auth.protect();
  const { slug } = await params;

  const activity = findActivity(slug);
  if (!activity) notFound();

  return (
    <>
      {/* Draws nothing. It is what puts this activity on the home page — in
          "jump back in", in your most-opened, and in the day's global count. */}
      <ViewRecorder slug={activity.slug} />

      <ActivityFrame
        title={activity.title}
        src={activityFrameSrc(activity.slug)}
      />
    </>
  );
}
