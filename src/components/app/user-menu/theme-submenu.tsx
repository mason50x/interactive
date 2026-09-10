"use client";

import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import {
  CheckIcon,
  ChevronRightIcon,
  ComputerDesktopIcon,
  MoonIcon,
  SunIcon,
} from "@heroicons/react/24/solid";
import {
  MenuContent,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSubmenu,
  MenuSubmenuTrigger,
} from "@/components/ui/menu";
import type { Icon } from "@/lib/icons";
import { themePreferences, type ThemePreference } from "@/lib/theme";

/** Solid throughout: the check on the right is the selected state, so a
 *  second one carried in the icon weight only made the two unchosen rows
 *  look disabled. */
const themeOptions: Record<ThemePreference, { label: string; icon: Icon }> = {
  system: { label: "System", icon: ComputerDesktopIcon },
  light: { label: "Light", icon: SunIcon },
  dark: { label: "Dark", icon: MoonIcon },
};

/**
 * The theme, as a row of the account menu that opens sideways.
 *
 * A submenu rather than a control in the row: three options are one too many
 * to sit inline at this width, and a submenu opens on hover, so reaching the
 * theme costs a pointer move instead of a click. A fixed moon names the row
 * the way the gear names Settings; the current value rides on the label
 * beside the chevron, which is what makes this a select rather than a door.
 *
 * Radio items deliberately do not close the menu. The change lands on the
 * page behind the popup, so it can be seen and corrected without reopening
 * anything.
 *
 * The submenu is the same surface as the popup it steps out of — both are
 * `MenuContent` — so it reads as that surface stepped sideways rather than a
 * second kind of panel. `inline-end` is Base UI's own default for a submenu
 * and has to be said here because `MenuContent` defaults to `bottom`.
 */
export function ThemeSubmenu({
  preference,
  onChange,
}: {
  preference: ThemePreference;
  onChange: (preference: ThemePreference) => void;
}) {
  return (
    <MenuSubmenu>
      <MenuSubmenuTrigger
        tone="muted"
        size="tall"
        className="cursor-default justify-between"
      >
        <span className="flex items-center gap-2.5">
          <MoonIcon className="size-4 shrink-0" />
          Theme
        </span>
        <span className="flex items-center gap-1">
          <span className="text-[0.8125rem] text-faint">
            {themeOptions[preference].label}
          </span>
          <ChevronRightIcon className="size-4 shrink-0 text-faint" />
        </span>
      </MenuSubmenuTrigger>

      <MenuContent
        side="inline-end"
        align="end"
        sideOffset={6}
        className="w-[10.5rem]"
      >
        <MenuRadioGroup
          value={preference}
          onValueChange={(value) => onChange(value as ThemePreference)}
        >
          {themePreferences.map((value) => {
            const { label, icon: Icon } = themeOptions[value];

            return (
              <MenuRadioItem
                key={value}
                value={value}
                tone="muted"
                size="tall"
                className="cursor-pointer justify-between"
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="size-4 shrink-0" />
                  {label}
                </span>
                {/* The one Base UI part `@/components/ui/menu` does not
                    re-export: it is unstyled, and the check is the styling. */}
                <MenuPrimitive.RadioItemIndicator>
                  <CheckIcon className="size-4 shrink-0 text-primary" />
                </MenuPrimitive.RadioItemIndicator>
              </MenuRadioItem>
            );
          })}
        </MenuRadioGroup>
      </MenuContent>
    </MenuSubmenu>
  );
}
