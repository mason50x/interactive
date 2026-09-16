import { canAccessEntertainment } from "@/lib/entertainment-access";
import { EntertainmentSoon } from "@/components/app/tv/entertainment-soon";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TvPlayer } from "@/components/app/tv/tv-player";
import { findTvShow } from "@/lib/tv";
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!(await canAccessEntertainment())) return { title: "Entertainment" };
  return { title: findTvShow((await params).slug)?.title ?? "Entertainment" };
}
export default async function TvPage({ params }: Props) {
  if (!(await canAccessEntertainment())) return <EntertainmentSoon />;
  const show = findTvShow((await params).slug);
  if (!show) notFound();
  return <TvPlayer key={show.slug} show={show} />;
}
