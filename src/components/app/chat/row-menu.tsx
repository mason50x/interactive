"use client";

import { EllipsisHorizontalIcon } from "@heroicons/react/24/solid";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";

/**
 * The things you can do to a person that are not the main thing.
 *
 * An ellipsis rather than a cog, and always drawn rather than revealed on
 * hover: it is what the same menu on a message is already called, and drawing
 * it always is what makes it exist on a touch screen.
 */
export function RowMenu({
  label,
  items,
}: {
  label: string;
  items: readonly { label: string; onClick: () => void; danger?: boolean }[];
}) {
  return (
    <Menu>
      <MenuTrigger
        aria-label={label}
        className="flex size-7 items-center justify-center rounded-lg text-faint transition-colors outline-none hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring data-popup-open:bg-foreground/[0.06] data-popup-open:text-foreground"
      >
        <EllipsisHorizontalIcon className="size-4" />
      </MenuTrigger>
      <MenuContent
        side="bottom"
        align="end"
        padding="xs"
        positionerClassName="z-[60]"
        className="w-44 flex-col"
      >
        {items.map((item) => (
          <MenuItem
            key={item.label}
            onClick={item.onClick}
            tone={item.danger ? "destructive" : "default"}
          >
            {item.label}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}
