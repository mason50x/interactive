import { protectPage } from "@/lib/session";
import type { Metadata } from "next";
import { Page } from "@/components/ui/page";
import { TvBrowser } from "@/components/app/tv/tv-browser";
import { TV_SHOWS } from "@/lib/tv";
export const metadata: Metadata = { title: "TV" };
export default async function EntertainmentPage() {
  await protectPage();
  const shows = TV_SHOWS.map((show) => ({
    slug: show.slug,
    title: show.displayName ?? show.title,
    genre: show.genre,
    thumbnail: show.thumbnail,
    episodeCount: show.episodes.length,
  }));
  return (
    <Page>
      <TvBrowser shows={shows} />
    </Page>
  );
}
