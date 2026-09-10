import { PixelArt } from "./pixel-art";

/** A game pad with a d-pad and two buttons: the Game Boy library's empty
 *  state. */
const ART = [
  "...#####...#####...",
  "..#.....###.....#..",
  ".#...............#.",
  ".#..+........+...#.",
  "#..+++........+...#",
  "#...+...++...+....#",
  "#.................#",
  "#......#####......#",
  "#.....#.....#.....#",
  ".#...#.......#...#.",
  "..###.........###..",
] as const;

export function PixelController() {
  return <PixelArt art={ART} />;
}
