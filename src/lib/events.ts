/**
 * A typed message between two parts of the page that share no ancestor worth
 * a context.
 *
 * The shape comes up whenever the thing that asks and the thing that answers
 * are far apart in the tree and nothing in between wants to re-render for
 * them: the rail's search asking the account menu to open, a thread header
 * asking the conversation column for a group's settings. A `window` event is
 * the honest tool for that — callers depend only on this module, the listener
 * mounts itself, and nothing happens where nobody is listening.
 *
 * `request` fires; `subscribe` returns the unsubscribe, for an effect's
 * cleanup. Both are tied to one event name, so the two sides cannot drift.
 */
export function channel<Detail>(name: string) {
  return {
    request(detail: Detail) {
      window.dispatchEvent(new CustomEvent<Detail>(name, { detail }));
    },
    subscribe(handler: (detail: Detail) => void): () => void {
      const listener = (event: Event) =>
        handler((event as CustomEvent<Detail>).detail);
      window.addEventListener(name, listener);
      return () => window.removeEventListener(name, listener);
    },
  };
}
