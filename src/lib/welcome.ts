/**
 * Whether the unlock is on screen, held outside React.
 *
 * It is asked for in two places that are not usefully related — the provider
 * that renders it, and `StreakProvider`, which has to hold its own celebration
 * back while it plays — and it is decided *once per page load* from two things
 * React cannot see: how old the Clerk session is, and whether this browser has
 * already been welcomed on it.
 *
 * That combination is what makes a module-level store the right shape rather
 * than context. Context would put an ordering requirement between two
 * providers that otherwise have nothing to do with each other, and the value
 * would still have to get into it from an effect — a `setState` in an effect
 * body, which is a cascading render and which this project's lint rules
 * (correctly) refuse. Here the effect updates an external system, the store
 * tells its subscribers, and `useSyncExternalStore` does the rest. Which is
 * exactly the job that hook exists for.
 *
 * The store is per page load by construction, and so is the decision: a full
 * reload is the only thing that can re-ask the question, and `WELCOMED_KEY`
 * is what stops it answering yes twice.
 */

/** How new a Clerk session has to be to count as having just been created. */
const FRESH_MS = 2 * 60 * 1000;

/** Overwritten, never appended to: the only session worth remembering is the
 *  last one that was welcomed. */
const WELCOMED_KEY = "50x:welcomed-session";

let playing = false;
let decided = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribeToWelcome(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isWelcomePlaying() {
  return playing;
}

/** The server has no `localStorage` and no session age, so it never plays one.
 *  Stated rather than inferred, because `useSyncExternalStore` demands it and
 *  because a server that guessed `true` would be a hydration mismatch on the
 *  first paint of the app. */
export function welcomeNeverPlaysOnServer() {
  return false;
}

/**
 * Storage that throws — a locked-down browser, private mode on some engines —
 * falls through to playing it. Repeating a welcome for someone who reloaded
 * inside the first two minutes is a far smaller failure than never showing it.
 */
function alreadyWelcomed(sessionId: string): boolean {
  try {
    return window.localStorage.getItem(WELCOMED_KEY) === sessionId;
  } catch {
    return false;
  }
}

function rememberWelcome(sessionId: string): void {
  try {
    window.localStorage.setItem(WELCOMED_KEY, sessionId);
  } catch {
    // Nothing to do about it, and nothing downstream depends on it having
    // worked — the worst case is one repeat on one reload.
  }
}

/**
 * Asks, once, whether this arrival earns the unlock.
 *
 * ## What counts as "came from auth"
 *
 * Not the URL. Clerk's forms redirect here on their own, and the path that
 * matters most — a deep link intercepted by `auth.protect()`, signed into, and
 * then resumed — arrives at whatever page was originally asked for, carrying
 * nothing to say it came through a form. A query parameter would catch the
 * easy case, miss that one, and survive being bookmarked.
 *
 * The session does say. `createdAt` is the moment the session came into
 * existence, so a session minted seconds ago was just signed into and a
 * session minted on Tuesday is someone coming back. That is the actual
 * question, asked directly, and it does not care which route got them here.
 *
 * ## Why the answer is also written down
 *
 * The window has to be wide enough to survive a slow first paint and a
 * redirect or two, which makes it wide enough that a reload inside it would
 * play the whole thing again. So the session id is recorded the moment the
 * unlock *starts* — not when it finishes, because a reload halfway through is
 * precisely the case being guarded against.
 */
export function decideWelcome(session: {
  id: string;
  createdAt: Date;
} | null): void {
  if (decided) return;
  decided = true;

  if (session === null) return;
  if (Date.now() - session.createdAt.getTime() >= FRESH_MS) return;
  if (alreadyWelcomed(session.id)) return;

  rememberWelcome(session.id);
  playing = true;
  emit();
}

/** The unlock is over — by its own timer, by a click, or by Escape. */
export function endWelcome(): void {
  if (!playing) return;
  playing = false;
  emit();
}
