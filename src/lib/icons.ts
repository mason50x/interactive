import type { ComponentProps, ComponentType } from "react";

/**
 * A Heroicon, as this app uses them.
 *
 * Heroicons ship no `width`/`height`, so they take their size from a class
 * like `size-5` and their colour from `currentColor`. Each one already sets
 * `aria-hidden`, so nothing that renders one needs to say so again.
 */
export type Icon = ComponentType<ComponentProps<"svg">>;

/**
 * The two cuts of one Heroicon.
 *
 * The rule across the app: solid is the selected state, outline is
 * everything else. Anything that has no selected state — a chevron, a close
 * button, a bullet — is imported solid on its own and never needs a pair.
 *
 * Both cuts must come from the 24px set: it is the only size Heroicons draws
 * an outline for, and mixing sets would change the weight between states.
 */
export type IconPair = {
  outline: Icon;
  solid: Icon;
};
