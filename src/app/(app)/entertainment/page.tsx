import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { FilmIcon } from "@heroicons/react/24/solid";
import { Page, PageTitle } from "@/components/ui/page";
import { TvBrowser } from "@/components/app/tv/tv-browser";
import { TV_SHOWS } from "@/lib/tv";
export const metadata: Metadata = { title: "Entertainment" };
export default async function EntertainmentPage() {
  await auth.protect();
  const shows = TV_SHOWS.map((show) => ({
    slug: show.slug,
    title: show.displayName ?? show.title,
    genre: show.genre,
    thumbnail: show.thumbnail,
    episodeCount: show.episodes.length,
  }));
  return (
    <Page>
      <PageTitle icon={<FilmIcon />}>Entertainment</PageTitle>
      <TvBrowser shows={shows} />
    </Page>
  );
}
