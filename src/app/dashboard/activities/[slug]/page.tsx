import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GameFrame } from "@/components/app/game-frame";
import { findGame } from "@/lib/games";
import { playerOrigin, playerUrl } from "@/lib/player";
import { mintPlayerGrant } from "@/lib/player-token";

export async function generateMetadata({
  params,
}: PageProps<"/dashboard/activities/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  return { title: findGame(slug)?.title ?? "Activities" };
}

/**
 * One route for every activity.
 *
 * The app's side of the boundary is the same for all of them — mint a grant,
 * frame the player origin — so there is nothing a per-game page could add
 * beyond a title and a genre, both of which the catalogue already carries.
 *
 * Unlike every other page under `/dashboard`, this one has no container: the
 * frame is the page and takes the shell edge to edge. The title and the way
 * back moved into the overlay on top of it, which is the only chrome a game
 * gets. See `GameFrame`.
 */
export default async function ActivityPage({
  params,
}: PageProps<"/dashboard/activities/[slug]">) {
  const { userId } = await auth.protect();
  const { slug } = await params;

  const game = findGame(slug);
  if (!game) notFound();

  // Minted here, after the guard, because this is the last point that both
  // knows who the user is and can still reach the signing secret. The player
  // origin gets the result and never the session it was derived from. One
  // grant covers every game.
  const grant = await mintPlayerGrant(userId);

  return (
    <GameFrame
      title={game.title}
      src={playerUrl(game.slug, grant)}
      playerOrigin={playerOrigin()}
    />
  );
}
