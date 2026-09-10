"use client";

import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { cva, type VariantProps } from "class-variance-authority";

import { popupVariants } from "@/components/ui/popup";
import { cn } from "@/lib/utils";

/**
 * A list of actions behind a trigger.
 *
 * Base UI's parts, dressed once. `MenuContent` folds the portal, positioner
 * and popup into one part because no menu in this app wants two of the three
 * without the third; the popup takes the shared `popupVariants` surface, so
 * a menu on a message and the account menu at the foot of the rail are the
 * same object. Everything else is Base UI's own part with the app's row
 * styling on it.
 *
 * The parts are exported individually rather than as one component with a
 * dozen props because the layouts inside differ — a row of emoji, a column
 * of sentences, a radio group — and that is composition, not configuration.
 */
const Menu = MenuPrimitive.Root;
const MenuTrigger = MenuPrimitive.Trigger;
const MenuGroup = MenuPrimitive.Group;
const MenuGroupLabel = MenuPrimitive.GroupLabel;
const MenuRadioGroup = MenuPrimitive.RadioGroup;
const MenuSubmenu = MenuPrimitive.SubmenuRoot;

/**
 * One row. `destructive` colours the ones that delete or leave something;
 * `muted` is the account menu's resting colour, which lifts to foreground
 * on highlight.
 */
const menuItemVariants = cva(
  "flex cursor-default items-center gap-2.5 rounded-lg px-2.5 text-left text-[0.875rem] outline-none select-none data-highlighted:bg-foreground/[0.06] data-highlighted:text-foreground",
  {
    variants: {
      tone: {
        default: "text-foreground",
        muted: "text-muted-foreground data-checked:text-foreground",
        destructive: "text-destructive data-highlighted:text-destructive",
      },
      size: {
        default: "py-1.5",
        tall: "h-9",
      },
    },
    defaultVariants: { tone: "default", size: "default" },
  },
);

function MenuContent({
  className,
  side = "bottom",
  align = "start",
  sideOffset = 6,
  alignOffset = 0,
  motion,
  padding,
  positionerClassName,
  children,
  ...props
}: MenuPrimitive.Popup.Props &
  Pick<
    MenuPrimitive.Positioner.Props,
    "side" | "align" | "sideOffset" | "alignOffset"
  > &
  VariantProps<typeof popupVariants> & {
    /** For a menu that has to clear a sheet or a lightbox: the z-index goes
     *  on the positioner, which is the element that is actually placed. */
    positionerClassName?: string;
  }) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        data-slot="menu-positioner"
        className={cn("z-50 outline-none", positionerClassName)}
        side={side}
        align={align}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
      >
        <MenuPrimitive.Popup
          data-slot="menu-content"
          className={cn(popupVariants({ motion, padding }), className)}
          {...props}
        >
          {children}
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

function MenuItem({
  className,
  tone,
  size,
  ...props
}: MenuPrimitive.Item.Props & VariantProps<typeof menuItemVariants>) {
  return (
    <MenuPrimitive.Item
      data-slot="menu-item"
      className={cn(menuItemVariants({ tone, size }), className)}
      {...props}
    />
  );
}

function MenuRadioItem({
  className,
  tone,
  size,
  ...props
}: MenuPrimitive.RadioItem.Props & VariantProps<typeof menuItemVariants>) {
  return (
    <MenuPrimitive.RadioItem
      data-slot="menu-radio-item"
      className={cn(menuItemVariants({ tone, size }), className)}
      {...props}
    />
  );
}

function MenuSubmenuTrigger({
  className,
  tone,
  size,
  ...props
}: MenuPrimitive.SubmenuTrigger.Props & VariantProps<typeof menuItemVariants>) {
  return (
    <MenuPrimitive.SubmenuTrigger
      data-slot="menu-submenu-trigger"
      className={cn(menuItemVariants({ tone, size }), className)}
      {...props}
    />
  );
}

function MenuSeparator({ className, ...props }: MenuPrimitive.Separator.Props) {
  return (
    <MenuPrimitive.Separator
      data-slot="menu-separator"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  );
}

export {
  Menu,
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSubmenu,
  MenuSubmenuTrigger,
  MenuTrigger,
  menuItemVariants,
};
