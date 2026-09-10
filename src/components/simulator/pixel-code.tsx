import { PixelArt } from "./pixel-art";

/** A pair of angle brackets with a slash: the HTML library's empty state. */
const ART = [
  "..........##.......",
  ".........##........",
  "....##...##..##....",
  "...##...##....##...",
  "..##....##.....##..",
  ".##....##.......##.",
  "..##...##......##..",
  "...##.##......##...",
  "....####.....##....",
  "......##...........",
  ".....##............",
] as const;
export function PixelCode() {
  return <PixelArt art={ART} />;
}
