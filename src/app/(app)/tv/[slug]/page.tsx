import { protectPage } from "@/lib/session";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TvPlayer } from "@/components/app/tv/tv-player";
import { findTvShow } from "@/lib/tv";
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await protectPage();
  return { title: findTvShow((await params).slug)?.title ?? "Entertainment" };
}
export default async function TvPage({ params }: Props) {
  await protectPage();
  const show = findTvShow((await params).slug);
  if (!show) notFound();
  return <TvPlayer key={show.slug} show={show} />;
}
