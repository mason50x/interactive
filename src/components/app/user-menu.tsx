"use client";

import { useClerk, useUser } from "@clerk/nextjs";
import { Menu } from "@base-ui/react/menu";
import { Check, ChevronsUpDown, LogOut, Monitor, Moon, Sun } from "lucide-react";
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
          <Menu.Popup className="w-[15rem] origin-[var(--transform-origin)] rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-lg shadow-black/[0.08] outline-none transition-[transform,opacity] duration-150 ease-out data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
            <div className="flex items-center gap-3 px-2 py-2">
              <Avatar src={user.imageUrl} name={name} size={36} />
              <div className="min-w-0">
                <p className="truncate text-[0.875rem] font-medium">
                  {user.fullName ?? name}
                </p>
                {email && (
                  <p className="truncate text-[0.75rem] text-muted-foreground">
                    {email}
                  </p>
                )}
              </div>
            </div>

            <Menu.Separator className="-mx-1.5 my-1.5 h-px bg-border" />

            <Menu.RadioGroup
              value={preference}
              onValueChange={(value) => setPreference(value as ThemePreference)}
            >
              <Menu.GroupLabel className="px-2.5 pt-1 pb-1.5 text-[0.6875rem] font-medium tracking-wide text-faint uppercase">
                Theme
              </Menu.GroupLabel>

              {themePreferences.map((value) => {
                const { label, icon: Icon } = themeLabels[value];

                return (
                  // Radio items keep the menu open on click, so the change can
                  // be seen against the page behind it and corrected without
                  // reopening.
                  <Menu.RadioItem key={value} value={value} className={itemClass}>
                    <Icon className="size-4 shrink-0" aria-hidden />
                    <span className="flex-1">{label}</span>
                    <Menu.RadioItemIndicator>
                      <Check className="size-4 text-primary" aria-hidden />
                    </Menu.RadioItemIndicator>
                  </Menu.RadioItem>
                );
              })}
            </Menu.RadioGroup>

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
