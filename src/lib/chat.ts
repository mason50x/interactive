import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import { channel } from "@/lib/events";

/**
 * The client's half of chat: types, copy, and nothing that decides anything.
 *
 * ## Why the rules are not here
 *
 * Everything that judges a message — the word lists, the patterns, the
 * thresholds — lives under `convex/moderation/` and is bundled for the Convex
 * runtime alone. None of it is reachable from `src/`, and an ESLint rule in
 * `eslint.config.mjs` refuses the import so that staying true is not a matter
 * of remembering.
 *
 * Two reasons, and the second is the one that matters. A list of slurs in a
 * public JavaScript chunk is a list of slurs anybody can read. And a filter you
 * can read is a filter you can walk around at leisure — the value of a rule
 * nobody has seen is that finding its edge costs repeated refused attempts.
 *
 * The refusal type below is not an exception. It is derived from the return
 * type of the mutation, so it arrives through `convex/_generated/api` — which
 * is names and types, erased at build, and carries no rule with it.
 */

type SendResult = FunctionReturnType<typeof api.chat.messages.send>;

/** Every reason a message can come back refused. */
export type Refusal = Extract<SendResult, { ok: false }>["refusal"];

/**
 * What the composer says when a message does not go.
 *
 * Each one names the category and not the rule. "That looked like a link" tells
 * somebody what to change; "the word `discord` within four tokens of `add`"
 * tells them how to get the next one through. The second is also what turns the
 * composer into a way of reading the wordlist a guess at a time, which is the
 * thing the whole arrangement above exists to prevent.
 *
 * Written to a fourteen-year-old, because that is who is reading it: short,
 * specific about what to do next, and not a telling-off. Somebody who typed a
 * swear word into a game site has not done anything shocking and should not be
 * addressed as though they had.
 */
const REFUSALS: Record<string, string> = {
  empty: "There is nothing to send.",
  "too-long": "That is too long for one message.",
  "hidden-characters": "That message had invisible characters in it.",
  reordering: "That message had text-direction characters in it.",
  "stacked-marks": "That message had too many stacked accents.",
  "too-many-lines": "That is too many line breaks for one message.",

  slur: "That is a slur, and it is not allowed anywhere here.",
  sexual: "Sexual content is not allowed here.",
  exploitation: "That is not allowed here.",
  threat: "Threats are not allowed here.",
  "self-harm": "Telling someone to hurt themselves is not allowed here.",
  degrading: "Threatening to expose someone is not allowed here.",
  harassment:
    "That reads as aimed at someone. Say it about the thing, not the person.",
  profanity:
    "Swearing does not go through here. Say it another way and it will.",

  contact:
    "Contact details cannot be shared here — no numbers, handles or usernames.",
  link: "Links are not allowed here.",
  location: "Addresses cannot be shared here.",

  duplicate: "You just sent that.",
  broadcast: "That has gone to enough places.",
  "too-fast": "Slow down a moment.",

  "not-a-member": "You are not in this conversation.",
  blocked: "You cannot message this person.",
  "reply-unavailable": "That message is no longer available to reply to.",
  mention: "You can only mention people who are in this conversation.",
  "mention-everyone": "@everyone only works in a group.",
  // Nearly unreachable, and deliberately so: the wait is drawn as a ring above
  // the composer and the composer is shut until it closes, so the only way here
  // is a browser clock running ahead of the server's. Worded as the near miss
  // it is rather than as a rule somebody has run into.

  // Pictures. `sexual` and `self-harm` above already read correctly for a
  // picture, and are what one comes back with — see
  // `convex/moderation/images.ts`. These are the ones only a picture can earn.
  graphic: "That picture is too graphic to send here.",
  image: "That picture could not be used. Try another.",
  "image-check": "Pictures cannot be checked right now. Try again in a minute.",
  "too-many-images": "That is too many pictures at once.",
};

export function refusalMessage(refusal: Refusal): string {
  return REFUSALS[refusal] ?? "That message could not be sent.";
}

/**
 * The reactions, fixed.
 *
 * The same six as `REACTIONS` in `convex/moderation/limits.ts`, duplicated for
 * bundle isolation: Convex bundles from `convex/` and the browser
 * bundles from `src/`, so a shared constant would have to live in one and be
 * imported across the boundary this module exists to keep. Change one, change
 * the other. The server is the one that decides.
 */
export const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥"] as const;

/**
 * The faces a group may wear, and the colours it may wear them on.
 *
 * Duplicated from `GROUP_EMOJI` and `GROUP_HUES` in
 * `convex/moderation/limits.ts` for the reason above. Here they are the
 * picker's contents; there they are the check that a picked value is one of
 * them. Change one, change the other. The server is the one that decides.
 */
export const GROUP_EMOJI = [
  "🎮",
  "🎵",
  "⚽",
  "🎨",
  "📚",
  "🍕",
  "🌟",
  "🚀",
  "🐙",
  "🌵",
  "🍀",
  "🧩",
  "🎲",
  "🛹",
  "🪐",
  "🦊",
] as const;

export const GROUP_HUES = [
  10, 40, 70, 100, 130, 160, 190, 220, 250, 280, 310, 340,
] as const;

/** The longest a group may be called, the same as `MAX_TITLE` on the server. */
export const MAX_TITLE = 40;

/** The longest a display name may be, the same as `MAX_DISPLAY_NAME` there. */
export const MAX_DISPLAY_NAME = 30;

/**
 * What a person is called where there is room for one line: their display
 * name if they have set one, and their handle if not. Where there is room for
 * two, the handle goes under it with an `@` — see `Handle` in `people-rows.tsx`.
 */
export function personName(person: {
  handle: string;
  displayName?: string;
}): string {
  return person.displayName ?? person.handle;
}

/**
 * The wheel a person may draw their own disc on, the faces they may wear, and
 * how much they may write instead.
 *
 * The same twelve steps and the same sixteen faces a group gets, because a
 * person and a group sitting in one list should not come from two palettes.
 * Mirrored from `AVATAR_HUES`, `AVATAR_EMOJI` and `MAX_INITIALS` in
 * `convex/moderation/limits.ts` for the reason above — here they are the
 * picker, there they are the check.
 */
export const AVATAR_HUES = GROUP_HUES;
export const AVATAR_EMOJI = GROUP_EMOJI;
export const MAX_INITIALS = 2;

/**
 * How many handle changes an account gets, ever. Mirrors
 * `MAX_HANDLE_CHANGES` on the server, which is the one that decides; here it
 * only decides what the panel says is left.
 */
export const MAX_HANDLE_CHANGES = 2;

/**
 * How long a message can still be deleted, duplicated from
 * `DELETE_WINDOW_MS` in `convex/moderation/limits.ts` for the reason above.
 *
 * Here it only decides how long the menu goes on offering it. The mutation
 * checks the same window itself and is the one that decides.
 */
export const DELETE_WINDOW_MS = 30 * 1000;

/**
 * How often an open conversation says it is still open.
 *
 * The other half of `PRESENCE_WINDOW_MS` in `convex/chat/presence.ts`, which is
 * how long one of these beats counts for. The window is set to comfortably more
 * than two of these, so a beat lost to a bad connection does not blink somebody
 * out of a room they never left; shortening the gap here without widening the
 * window there is how that starts happening.
 *
 * Fifteen seconds is the slowest this can be and still be a *live* count. It is
 * also a write per reader per fifteen seconds, which is the whole cost of the
 * feature — see the note at the top of `convex/chat/presence.ts`.
 */
export const HEARTBEAT_MS = 15 * 1000;

/**
 * How often a box with words in it says so.
 *
 * The other half of `TYPING_WINDOW_MS` in `convex/chat/typing.ts`, which is
 * how long one of these beats counts for and is set to comfortably more than
 * two of them. A keystroke is not a beat: the composer sends one on the first
 * character and then at most one per this interval while keys keep coming,
 * because every beat that lands re-runs the subscription of everybody reading
 * the conversation — see the note at the top of that file.
 */
export const TYPING_BEAT_MS = 3 * 1000;

/**
 * Who is writing, in the words the caption under the dots says it in.
 *
 * Up to three are named and the rest are counted, because "alice, bob, cara,
 * dan and eve are typing" is a sentence nobody finishes reading before one of
 * them has sent. Names come through `personName`, so a display name is used
 * where there is one and the handle where there is not — the same rule as
 * everywhere else a person is named on one line.
 */
export function typingLabel(
  people: { handle: string; displayName?: string }[],
): string {
  const names = people.map(personName);
  if (names.length === 0) return "";
  if (names.length === 1) return `${names[0]} is typing`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing`;
  if (names.length === 3) {
    return `${names[0]}, ${names[1]} and ${names[2]} are typing`;
  }
  const others = names.length - 2;
  return `${names[0]}, ${names[1]} and ${others} others are typing`;
}

/**
 * Why a group did not get made.
 *
 * The filter refusals stay vague on purpose, the same as the composer's — see
 * `refusalMessage` above.
 */
export function groupNameError(reason: Refusal | "no-profile"): string {
  switch (reason) {
    case "no-profile":
      return "Pick a handle first.";
    case "empty":
      return "Give it a name first.";
    case "too-long":
      return "That name is too long.";
    default:
      return "That name will not work. Try another.";
  }
}

/**
 * Why a direct message did not open, in the words the card says it in.
 *
 * `not-friends` is the one worth getting right: it is the rule for everybody,
 * so it is the refusal nearly everybody meets first, and it is not a refusal
 * at all so much as the next thing to press.
 */
export function openDmError(
  reason: "no-profile" | "unknown" | "blocked" | "not-friends",
): string {
  switch (reason) {
    case "not-friends":
      return "They only take messages from friends. Add them first.";
    case "blocked":
      return "You cannot message this person.";
    case "unknown":
      return "That account is gone.";
    case "no-profile":
      return "Pick a handle first.";
  }
}

/**
 * What a conversation is called, given that only groups carry a title.
 *
 * A direct message is called by the other person's display name when they
 * have one, and their handle when they do not — the same rule `personName`
 * applies everywhere else a person is named on one line.
 */
export function conversationName(conversation: {
  kind: "global" | "dm" | "group";
  title?: string;
  peerHandle?: string;
  peerName?: string;
}): string {
  if (conversation.kind === "global") return "Everyone";
  if (conversation.kind === "dm") {
    return conversation.peerName ?? conversation.peerHandle ?? "Direct message";
  }
  return conversation.title ?? "Group";
}

/**
 * A stable colour for a handle.
 *
 * Chat has no avatars, deliberately: the only picture the app holds is the one
 * Clerk took at signup, and a photograph of a thirteen-year-old is the single
 * worst thing to put next to their messages in a room of strangers. So people
 * are a letter and a colour, and the colour is derived from the handle so that
 * it is the same for everybody looking at it and needs nothing stored.
 *
 * Returned as an `oklch` hue rather than a palette entry so it sits in the same
 * colour space as the rest of the app and stays legible against both surfaces.
 */
export function handleHue(handle: string): number {
  let hash = 0;
  for (let index = 0; index < handle.length; index += 1) {
    hash = (hash * 31 + handle.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % 360;
}

/** How long remains in a countdown, in the words somebody would use. */
export function untilLabel(until: number, now: number): string {
  const seconds = Math.max(0, Math.round((until - now) / 1000));
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return minutes === 1 ? "a minute" : `${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? "an hour" : `${hours} hours`;
}

/**
 * Asking the chat column to show a group's panel.
 *
 * The panels — who is in a group, what it is called, who may join — take the
 * conversation column over rather than opening a sheet on top of everything.
 * That is what they should do: a group's membership is a place in this app, not
 * a dialog, and a dialog is exactly the thing that goes away the moment you
 * touch what is behind it.
 *
 * The trouble is that the column is not the only place they are opened from.
 * The cog on a group's row is inside it, but the one in the thread header is in
 * the other pane entirely, and threading a callback from a conversation row and
 * a thread header into one piece of state means a context around both, holding
 * a value neither pane wants to re-render for.
 *
 * So: a window event, exactly as `requestSettings` in `src/lib/preferences.ts`
 * does it, and for the same reason. Callers need nothing but this module, and
 * the column listens and shows itself.
 */
const GROUP_PANEL_EVENT = "50x:group-panel";

/** Which of the two the column should show. */
export type GroupPanelMode = "add" | "settings";

export type GroupPanelRequest = {
  conversationId: string;
  mode: GroupPanelMode;
};

const groupPanelChannel = channel<GroupPanelRequest>(GROUP_PANEL_EVENT);

/** Ask for one. Nothing happens where the conversation column is not mounted,
 *  which is everywhere outside chat. */
export function requestGroupPanel(
  conversationId: string,
  mode: GroupPanelMode,
) {
  groupPanelChannel.request({ conversationId, mode });
}

/** The column's side of it. Returns the unsubscribe, for an effect's cleanup. */
export function onGroupPanelRequest(
  handler: (request: GroupPanelRequest) => void,
) {
  return groupPanelChannel.subscribe(handler);
}

/**
 * The old man in the room.
 *
 * `@bot` in the global room is answered by a character — see
 * `convex/chat/bot.ts` — whose replies are ordinary messages signed with
 * `BOT_ID` in `authorClerkId`. He has no profile, so the three things that
 * open one — the face in a message row, a mention chip, the name in a reply
 * preview — check `isBot` first and draw him plain. Mirrored from the server
 * for the reason `REACTIONS` above is: the two bundles do not share a
 * module. Change one, change the other.
 */
export const BOT_ID = "bot";
export const BOT_HANDLE = "bot";
/** His fixed, app-owned portrait. He has no profile row of his own. */
export const BOT_AVATAR = "/chat/bot-avatar.webp";
/** How he is introduced in the mention picker. */
export const BOT_NAME = "Bot";
export const BOT_TAGS_PER_DAY = 5;

export function isBot(clerkId: string | undefined): boolean {
  return clerkId === BOT_ID;
}
