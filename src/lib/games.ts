/**
 * The game catalogue.
 *
 * A slug appears in three places and they have to agree: the dashboard route
 * that frames the game, the player route that runs it, and the `postMessage`
 * envelope the two exchange. Keeping the list here is what makes adding a
 * title a matter of one entry plus one component.
 */

export type Game = {
  slug: string;
  /** Shown in the dashboard rail and as the page heading. */
  title: string;
  /** One line under the heading. */
  tagline: string;
  /** How to play, for the panel beside the board. */
  controls: string;
};

export const GAMES: readonly Game[] = [
  {
    slug: "animal-adventure",
    title: "Animal Adventure",
    tagline: "Feed the snake without letting it double back on itself.",
    controls: "Arrow keys or WASD to steer. Swipe on touch. Space to restart.",
  },
];

export function findGame(slug: string): Game | undefined {
  return GAMES.find((game) => game.slug === slug);
}
