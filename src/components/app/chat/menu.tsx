/**
 * What a popped-open menu looks like, in the one place both of them read it.
 *
 * There are two menus in chat and they are the same object seen twice: the one
 * on a message, and the one on a person in the tool panel. A menu that is a
 * card here and a plain list there would read as two different mechanisms, and
 * the only thing keeping them the same was a class string that had been typed
 * out twice — so it lives here instead, where changing it changes both.
 *
 * Not a component, because Base UI's `Menu.Popup` and `Menu.Item` already are
 * the components; what varies between the two menus is the layout inside the
 * popup — a row of emoji in one, a column of sentences in the other — and that
 * is a `cn` at the call site rather than a prop.
 */
export const popupClass =
  "popup-slide flex gap-0.5 rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg shadow-black/[0.08] outline-none";

/** One line in a column menu. Destructive ones add their own colour. */
export const menuItemClass =
  "rounded-lg px-2.5 py-1.5 text-left text-[0.875rem] outline-none select-none hover:bg-foreground/[0.06] data-highlighted:bg-foreground/[0.06]";
