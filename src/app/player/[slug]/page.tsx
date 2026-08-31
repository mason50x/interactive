import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HostedGame } from "@/components/player/hosted-game";
import { gameBundleUrl } from "@/lib/assets";
import { findGame } from "@/lib/games";

/**
 * The player origin's only route.
 *
 * Every game is a static bundle on the asset origin, so this resolves one by
 * URL from the catalogue rather than mapping slugs to components. It used to
 * do both, behind a `runtime` discriminant; the compiled-in kind is gone.
 *
 * The catalogue in `src/lib/games.ts` is the metadata and this is the frame
 * around it. They are separate because the app has to render a title and a
 * description for a game without pulling the game's bundle into the app's own
 * origin.
 */
export async function generateMetadata({
  params,
}: PageProps<"/player/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  return { title: findGame(slug)?.title ?? "Player" };
}

export default async function PlayerPage({ params }: PageProps<"/player/[slug]">) {
  const { slug } = await params;

  const game = findGame(slug);
  if (!game) notFound();

  // `null` means no asset origin is configured, so there is nowhere to load
  // this from. A 404 is the honest answer and matches every other way this
  // route declines — see the note on uniform 404s in `src/proxy.ts`.
  const src = gameBundleUrl(game.slug);
  if (!src) notFound();

  return <HostedGame title={game.title} src={src} />;
}
