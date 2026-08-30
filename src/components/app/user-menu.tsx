"use client";

import { useClerk, useUser } from "@clerk/nextjs";
import { Menu } from "@base-ui/react/menu";
import { ChevronsUpDown, LogOut, Monitor, Moon, Sun } from "lucide-react";
import Image from "next/image";
import { useTheme } from "@/components/theme-provider";
import { themePreferences, type ThemePreference } from "@/lib/theme";
import { cn } from "@/lib/utils";

const themeLabels: Record<
  ThemePreference,
  { label: string; icon: typeof Monitor }
> = {
  system: { label: "System", icon: Monitor },
  light: { label: "Light", icon: Sun },
  dark: { label: "Dark", icon: Moon },
};

const itemClass =
  "flex h-9 cursor-default items-center gap-2.5 rounded-lg px-2.5 text-[0.875rem] text-muted-foreground outline-none select-none data-highlighted:bg-foreground/[0.05] data-highlighted:text-foreground";

function Avatar({ src, name, size }: { src?: string; name: string; size: number }) {
  if (!src) {
    return (
      <span
        aria-hidden
        style={{ width: size, height: size }}
        className="flex shrink-0 items-center justify-center rounded-full bg-muted text-[0.75rem] font-medium text-muted-foreground"
      >
        {name.charAt(0).toUpperCase()}
      </span>
    );
  }

  return (
    <Image
      src={src}
      alt=""
      width={size}
      height={size}
      // Clerk serves these from its own CDN already sized by the `width`
      // query it puts on the URL; running them back through the optimizer
      // would be a second hop for no gain.
      unoptimized
      style={{ width: size, height: size }}
      className="shrink-0 rounded-full object-cover"
    />
  );
}

/**
 * The account control at the foot of the rail: who you are, and the two
 * things you can do about it.
 *
 * This replaces Clerk's `<UserButton />` rather than restyling it. The stock
 * component is an avatar and a menu we do not control the contents of, and
 * the theme switch has to live *in* that menu — there is nowhere else in this
 * layout for it to go. What is left of Clerk here is the data (`useUser`) and
 * the one action it owns (`signOut`).
 *
 * Collapsed, below `lg`, it is the avatar alone; the name and the affordance
 * appear with the rail.
 */
export function UserMenu() {
  const { isLoaded, user } = useUser();
  const { signOut } = useClerk();
  const { preference, setPreference } = useTheme();

  if (!isLoaded || !user) {
    // Holds the row's exact height so the rail does not jump when the session
    // resolves. Not a spinner: this is usually a single frame.
    return <div className="h-11" aria-hidden />;
  }

  const name = user.firstName ?? user.username ?? "Account";
  const email = user.primaryEmailAddress?.emailAddress;

  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={`Account: ${name}`}
        className="flex h-11 w-full cursor-pointer items-center justify-center gap-2.5 rounded-lg text-[0.9375rem] text-foreground transition-colors outline-none hover:bg-foreground/[0.05] data-popup-open:bg-foreground/[0.05] lg:justify-start lg:px-2"
      >
        <Avatar src={user.imageUrl} name={name} size={28} />
        <span className="hidden min-w-0 flex-1 truncate text-left lg:block">
          {name}
        </span>
        <ChevronsUpDown
          className="hidden size-4 shrink-0 text-faint lg:block"
          aria-hidden
        />
      </Menu.Trigger>

      <Menu.Portal>
        <Menu.Positioner side="top" align="start" sideOffset={8} className="z-50 outline-none">
          {/* Once the rail is open the popup takes the trigger's exact width,
              so the two share both edges instead of the menu hanging over
              into the shell. Collapsed, the trigger is a 4.5rem icon and
              there is nothing useful to match, so it falls back to a width
              of its own. */}
          <Menu.Popup className="w-[15rem] origin-[var(--transform-origin)] lg:w-[var(--anchor-width)] rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-lg shadow-black/[0.08] outline-none transition-[transform,opacity] duration-150 ease-out data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
            <div className="flex items-center gap-2.5 px-1.5 py-2">
              <Avatar src={user.imageUrl} name={name} size={32} />
              <div className="min-w-0">
                <p className="truncate text-[0.875rem] font-medium">
                  {user.fullName ?? name}
                </p>
                {/* The popup is only as wide as the trigger, so a long address
                    truncates. The title is the way back to the whole of it. */}
                {email && (
                  <p
                    title={email}
                    className="truncate text-[0.75rem] text-muted-foreground"
                  >
                    {email}
                  </p>
                )}
              </div>
            </div>

            <Menu.Separator className="-mx-1.5 my-1.5 h-px bg-border" />

            <div className="flex h-9 items-center justify-between gap-2 pr-0.5 pl-2.5">
              <span className="text-[0.875rem] text-muted-foreground">
                Theme
              </span>

              {/* Three states in one control rather than three rows of menu.
                  Radio items keep the menu open on click, so the change can be
                  seen against the page behind it and corrected in place — the
                  reason this is worth a segmented control and not a button
                  that cycles blindly through the options.

                  The selected segment has to be *lighter* than the track to
                  read as raised, and `--surface` is only lighter than `--muted`
                  in the light theme — in the dark one it is a step down, which
                  turns the pill into a hole. Hence the explicit dark value. */}
              <Menu.RadioGroup
                value={preference}
                onValueChange={(value) => setPreference(value as ThemePreference)}
                className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5"
              >
                {themePreferences.map((value) => {
                  const { label, icon: Icon } = themeLabels[value];

                  return (
                    <Menu.RadioItem
                      key={value}
                      value={value}
                      aria-label={label}
                      className="flex size-7 cursor-pointer items-center justify-center rounded-[0.4375rem] text-muted-foreground outline-none transition-colors select-none data-checked:bg-surface data-checked:text-foreground data-checked:shadow-sm dark:data-checked:bg-border dark:data-checked:shadow-none data-highlighted:text-foreground not-data-checked:data-highlighted:bg-foreground/[0.06]"
                    >
                      <Icon className="size-4" aria-hidden />
                    </Menu.RadioItem>
                  );
                })}
              </Menu.RadioGroup>
            </div>

            <Menu.Separator className="-mx-1.5 my-1.5 h-px bg-border" />

            <Menu.Item
              className={cn(itemClass, "data-highlighted:text-destructive")}
              onClick={() => signOut({ redirectUrl: "/" })}
            >
              <LogOut className="size-4 shrink-0" aria-hidden />
              Sign out
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
