import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HostedActivity } from "@/components/activity/hosted-activity";
import { hasAgreed } from "@/lib/agreement-gate";
import { activityBundleUrl } from "@/lib/assets";
import { findActivity } from "@/lib/activities";

/**
 * The framed activity, at `/learn/<slug>`.
 *
 * Every activity is a static bundle on the asset origin, so this resolves one by
 * URL from the catalogue rather than mapping slugs to components. It used to
 * do both, behind a `runtime` discriminant; the compiled-in kind is gone.
 *
 * This page is the middle of three frames — a dashboard page frames it, it
 * frames the bundle — and that is the whole reason it exists rather than
 * pointing the dashboard straight at the bundle: the bundle URL is only ever
 * handed out from a page the session already gated, and this page can send the
 * `frame-ancestors` a bucket cannot. `src/proxy.ts` protects `/learn` with the
 * session; `src/lib/learn.ts` has the rest.
 */
export async function generateMetadata({
  params,
}: PageProps<"/learn/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  return { title: findActivity(slug)?.title ?? "Activity" };
}

export default async function LearnPage({ params }: PageProps<"/learn/[slug]">) {
  const { slug } = await params;

  const activity = findActivity(slug);
  if (!activity) notFound();

  // The same gate the dashboard page applies, applied again here because this
  // is where the bundle URL is actually resolved and this page is reachable on
  // its own — the session gets it from `src/proxy.ts` whether or not it came
  // through a frame. A 404 rather than an explanation: this page is only ever
  // seen inside an iframe, and the page that owns that frame has already said
  // why. See `src/lib/agreement-gate.ts`.
  if (!(await hasAgreed())) notFound();

  // `null` means no asset origin is configured, so there is nowhere to load
  // this from. A 404 is the honest answer and matches every other way this
  // route declines.
  const src = activityBundleUrl(activity.slug);
  if (!src) notFound();

  return <HostedActivity title={activity.title} src={src} />;
}
