/**
 * The parts of Home an account can hide, in the order they appear.
 *
 * A module of its own, not an export of `home.tsx`, because two very
 * different pages read it. Home draws the cards; the Home tab of Settings
 * only lists their names beside a switch. Importing the list from the page
 * component dragged the whole Home graph into the Settings bundle on both
 * sides of the wire, and on the server that graph ends in the quote card's
 * WebGL backdrop: three.js and postprocessing, half a megabyte the Worker
 * evaluated on the first Settings request of every isolate.
 */
export const homeSections = [
  { id: "greeting", label: "Greeting" },
  { id: "featured", label: "Top pick" },
  { id: "schedule", label: "Bell schedule" },
  { id: "chat", label: "Chat" },
  { id: "leaders", label: "Leaderboard" },
  { id: "quote", label: "Quote of the day" },
] as const;

export type HomeSectionId = (typeof homeSections)[number]["id"];
