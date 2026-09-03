import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";

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
 * nobody has seen is that finding its edge costs a message, a refusal, and
 * eventually a strike.
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
  exploitation: "That is not allowed here, and the account has been closed.",
  threat: "Threats are not allowed here.",
  "self-harm": "Telling someone to hurt themselves is not allowed here.",
  degrading: "Threatening to expose someone is not allowed here.",
  harassment: "That reads as aimed at someone. Say it about the thing, not the person.",
  profanity: "Swearing does not go through here. Say it another way and it will.",

  contact: "Contact details cannot be shared here — no numbers, handles or usernames.",
  link: "Links are not allowed here.",
  location: "Addresses cannot be shared here.",

  duplicate: "You just sent that.",
  broadcast: "That has gone to enough places.",
  "too-fast": "Slow down a moment.",

  muted: "You cannot send messages right now.",
  banned: "This account can no longer use chat.",
  "not-a-member": "You are not in this conversation.",
  blocked: "You cannot message this person.",
  // Nearly unreachable, and deliberately so: the wait is drawn as a ring above
  // the composer and the composer is shut until it closes, so the only way here
  // is a browser clock running ahead of the server's. Worded as the near miss
  // it is rather than as a rule somebody has run into.
  "too-new": "Not quite yet — the ring above has a moment left on it.",
  "not-agreed": "Accept the terms before you can send anything.",

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
 * The same copy, for the ledger, where it is describing something that already
 * happened rather than something that just failed.
 */
const RULES: Record<string, string> = {
  slur: "Used a slur",
  sexual: "Sexual content",
  exploitation: "Sexual content involving minors",
  threat: "Threatened someone",
  "self-harm": "Told someone to hurt themselves",
  degrading: "Threatened to expose someone",
  harassment: "Aimed language at someone",
  contact: "Shared contact details",
  link: "Posted a link",
  location: "Shared an address",
  broadcast: "Sent the same message to several places",
  "too-fast": "Sent messages too quickly",
  reordering: "Used text-direction characters",
  "stacked-marks": "Used stacked accents",
  graphic: "Sent a graphic picture",
};

export function ruleLabel(rule: string): string {
  return RULES[rule] ?? rule;
}

/**
 * The reactions, fixed.
 *
 * The same six as `REACTIONS` in `convex/moderation/limits.ts`, duplicated for
 * the same reason `AGREEMENT_PHRASE` is duplicated between `src/lib/agreement.ts`
 * and `convex/agreement.ts`: Convex bundles from `convex/` and the browser
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
  "🎮", "🎵", "⚽", "🎨", "📚", "🍕", "🌟", "🚀",
  "🐙", "🌵", "🍀", "🧩", "🎲", "🛹", "🪐", "🦊",
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
 * Why a display name did not take. The filter refusals stay vague on purpose,
 * the same as the composer's — see `refusalMessage` above.
 */
export function displayNameError(
  reason: Refusal | "no-profile" | "closed",
): string {
  switch (reason) {
    case "muted":
      return "You cannot change your name while you cannot send messages.";
    case "banned":
    case "closed":
      return "This account can no longer use chat.";
    case "no-profile":
      return "Pick a handle first.";
    case "too-long":
      return "That name is too long.";
    default:
      return "That name will not work. Try another.";
  }
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

/** Shape only. Everything else about a handle is decided on the server. */
export function handleShapeError(handle: string): string | null {
  const wanted = handle.trim().toLowerCase();
  if (wanted.length < 3) return "At least three characters.";
  if (wanted.length > 20) return "At most twenty characters.";
  if (!/^[a-z]/.test(wanted)) return "Start with a letter.";
  if (!/^[a-z0-9_]+$/.test(wanted)) {
    return "Letters, numbers and underscores only.";
  }
  if (wanted.includes("__")) return "One underscore at a time.";
  if (wanted.endsWith("_")) return "Cannot end with an underscore.";
  return null;
}

/** Why a handle was refused, once the server has looked at it properly. */
export function claimError(reason: string): string {
  switch (reason) {
    case "taken":
      return "Someone already has that one, or something close enough to it.";
    case "reserved":
      return "That one is reserved.";
    case "language":
      return "Pick something else.";
    case "already":
      return "You already have a handle.";
    case "not-agreed":
      return "Accept the terms first.";
    case "limit":
      return "You have used both of your changes.";
    case "same":
      return "That is already your handle.";
    case "no-profile":
      return "You do not have a handle yet.";
    case "closed":
      return "This account is closed.";
    default:
      return "That handle will not work.";
  }
}

/**
 * How much of the rename allowance is left, in the words somebody would use.
 *
 * Takes what has been spent rather than what remains, because that is the
 * number the server keeps — deriving it here means there is one subtraction in
 * the app and it is next to the sentence that depends on it.
 */
export function changesLeftLabel(spent: number): string {
  const left = Math.max(0, MAX_HANDLE_CHANGES - spent);
  if (left === 0) return "No changes left. This handle is yours for good.";
  if (left === 1) return "One change left.";
  return "Two changes left.";
}

/**
 * Why a group did not get made.
 *
 * Worth spelling out rather than collapsing into one line, because only some of
 * these are about the name at all. Somebody who is muted and reads "that name
 * will not work" will try four more names before working out that the name was
 * never the problem.
 *
 * The filter refusals stay vague on purpose, the same as the composer's — see
 * `refusalMessage` above.
 */
export function groupNameError(
  reason: Refusal | "no-profile" | "closed",
): string {
  switch (reason) {
    case "muted":
      return "You cannot make a group while you cannot send messages.";
    case "banned":
    case "closed":
      return "This account can no longer use chat.";
    case "no-profile":
      return "Pick a handle first.";
    case "not-agreed":
      return "Accept the terms first.";
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
 * `not-friends` is the one worth getting right: it is the default policy, so
 * it is the refusal nearly everybody meets first, and it is not a refusal at
 * all so much as the next thing to press.
 */
export function openDmError(
  reason: "no-profile" | "unknown" | "blocked" | "not-friends" | "closed",
): string {
  switch (reason) {
    case "not-friends":
      return "They only take messages from friends. Add them first.";
    case "closed":
      return "They are not taking messages right now.";
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

/** How long is left on a mute, in the words somebody would use. */
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

/** Ask for one. Nothing happens where the conversation column is not mounted,
 *  which is everywhere outside chat. */
export function requestGroupPanel(
  conversationId: string,
  mode: GroupPanelMode,
) {
  window.dispatchEvent(
    new CustomEvent<GroupPanelRequest>(GROUP_PANEL_EVENT, {
      detail: { conversationId, mode },
    }),
  );
}

/** The column's side of it. Returns the unsubscribe, for an effect's cleanup. */
export function onGroupPanelRequest(
  handler: (request: GroupPanelRequest) => void,
) {
  const listener = (event: Event) =>
    handler((event as CustomEvent<GroupPanelRequest>).detail);
  window.addEventListener(GROUP_PANEL_EVENT, listener);
  return () => window.removeEventListener(GROUP_PANEL_EVENT, listener);
}
