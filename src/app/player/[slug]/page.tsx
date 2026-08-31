import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HostedActivity } from "@/components/player/hosted-activity";
import { activityBundleUrl } from "@/lib/assets";
import { findActivity } from "@/lib/activities";

/**
 * The player origin's only route.
 *
 * Every activity is a static bundle on the asset origin, so this resolves one by
 * URL from the catalogue rather than mapping slugs to components. It used to
 * do both, behind a `runtime` discriminant; the compiled-in kind is gone.
 *
 * The catalogue in `src/lib/activities.ts` is the metadata and this is the frame
 * around it. They are separate because the app has to render a title and a
 * description for an activity without pulling the activity's bundle into the app's own
 * origin.
 */
export async function generateMetadata({
  params,
}: PageProps<"/player/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  return { title: findActivity(slug)?.title ?? "Player" };
}

export default async function PlayerPage({ params }: PageProps<"/player/[slug]">) {
  const { slug } = await params;

  const activity = findActivity(slug);
  if (!activity) notFound();

  // `null` means no asset origin is configured, so there is nowhere to load
  // this from. A 404 is the honest answer and matches every other way this
  // route declines — see the note on uniform 404s in `src/proxy.ts`.
  const src = activityBundleUrl(activity.slug);
  if (!src) notFound();

  return <HostedActivity title={activity.title} src={src} />;
}
