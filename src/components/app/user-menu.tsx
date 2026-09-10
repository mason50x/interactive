"use client";

import { useClerk, useUser } from "@clerk/nextjs";
import { Menu } from "@base-ui/react/menu";
import {
  CheckIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  ComputerDesktopIcon,
  ExclamationTriangleIcon,
  MoonIcon,
  SunIcon,
} from "@heroicons/react/24/solid";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useAccountModal } from "@/components/app/account-modal";
import { useRail } from "@/components/app/rail-context";
import { useTheme } from "@/components/theme-provider";
import type { Icon } from "@/lib/icons";
import { onSettingsRequest } from "@/lib/preferences";
import { themePreferences, type ThemePreference } from "@/lib/theme";
import { cn } from "@/lib/utils";

/** Solid throughout: the check on the right is the selected state, so a
 *  second one carried in the icon weight only made the two unchosen rows
 *  look disabled. */
const themeOptions: Record<ThemePreference, { label: string; icon: Icon }> = {
  system: { label: "System", icon: ComputerDesktopIcon },
  light: { label: "Light", icon: SunIcon },
  dark: { label: "Dark", icon: MoonIcon },
};

/**
 * Sign out, drawn here rather than imported.
 *
 * Every row in this menu is a solid Heroicon, and Heroicons' own
 * `arrow-right-start-on-rectangle` breaks that: its solid cut is the outline
 * cut — a hairline door and a hairline arrow — so next to a filled gear it
 * reads as the one unfinished row in the popup. This is the same idea at the
 * weight the rest of the menu is set in: a filled door with the handle knocked
 * out of it, and a solid arrow leaving through the side it opens.
 */
const SignOutIcon: Icon = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
    <path
      fillRule="evenodd"
      d="M4.5 3h3.75a2.25 2.25 0 0 1 2.25 2.25v13.5a2.25 2.25 0 0 1-2.25 2.25H4.5a2.25 2.25 0 0 1-2.25-2.25V5.25A2.25 2.25 0 0 1 4.5 3Zm3.375 8.1a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8Z"
      clipRule="evenodd"
    />
    <path d="M13.65 10.95h3.75v2.1h-3.75a1.05 1.05 0 0 1 0-2.1Z" />
    <path d="M16.65 8.25 21.75 12l-5.1 3.75Z" />
  </svg>
);

const itemClass =
  "flex h-9 cursor-default items-center gap-2.5 rounded-lg px-2.5 text-[0.875rem] text-muted-foreground outline-none select-none data-highlighted:bg-foreground/[0.05] data-highlighted:text-foreground";

/** Shared by the account popup and the theme submenu, so a submenu reads as
 *  the same surface stepped sideways rather than a second kind of panel. */
const popupClass =
  // The open/close motion is `.popup-slide` in globals.css rather than
  // utilities here — that rule explains why Tailwind cannot express it.
  "popup-slide rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-lg shadow-black/[0.08] outline-none";

/** One of the two faces of the sign-out row. Both are dealt into the same grid
 *  cell so the row keeps its width and the menu never resizes mid-turn; the
 *  scale and the blur are what carry one out and the other in. `scale` is its
 *  own property in Tailwind v4, so it is named in the transition rather than
 *  covered by `transform`. */
const signOutFaceClass =
  "pointer-events-none col-start-1 row-start-1 flex origin-left items-center gap-2.5 transition-[opacity,scale,filter] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)]";

function Avatar({
  src,
  name,
  size,
}: {
  src?: string;
  name: string;
  size: number;
}) {
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
 * layout for it to go. What is left of Clerk here is the data (`useUser`),
 * the modal behind the Settings row (`useAccountModal`) and the one action it
 * owns (`signOut`).
 *
 * Collapsed, below `lg`, it is the avatar alone; the name and the affordance
 * appear with the rail.
 */
export function UserMenu() {
  const { isLoaded, user } = useUser();
  const { signOut } = useClerk();
  const { preference, setPreference } = useTheme();
  const { open: openAccount, pages: accountPages } = useAccountModal();
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const signOutRef = useRef<HTMLElement>(null);

  // The rail's search can name a setting — "constellation", "panic key" — or
  // the account, and what it does with either is open the modal on that page.
  // See `requestSettings`.
  useEffect(() => onSettingsRequest(openAccount), [openAccount]);

  // A press on anything but the sign-out row puts it back. This listens on the
  // document rather than on the popup because the theme submenu is portalled
  // out of it — a press on a theme option never passes through the popup the
  // row lives in — and because a press outside the menu should disarm the row
  // on the way out, not leave it armed under the close.
  useEffect(() => {
    if (!confirmingSignOut) return;

    const disarm = (event: PointerEvent) => {
      if (signOutRef.current?.contains(event.target as Node)) return;
      setConfirmingSignOut(false);
    };

    document.addEventListener("pointerdown", disarm, true);
    return () => document.removeEventListener("pointerdown", disarm, true);
  }, [confirmingSignOut]);

  // Read for the popup alone. It is portalled to the body, where the `wide:`
  // variant's attribute is out of sight, and it is the one thing here whose
  // shape depends on the rail's width without being inside it.
  const { rail } = useRail();

  if (!isLoaded || !user) {
    // Holds the row's exact height so the rail does not jump when the session
    // resolves. Not a spinner: this is usually a single frame.
    return <div className="h-14" aria-hidden />;
  }

  const name = user.firstName ?? user.username ?? "Account";

  return (
    <>
      {/* Deferred to `onOpenChangeComplete` rather than `onOpenChange`: an
        armed row that reverts the instant the menu is dismissed plays the
        turn backwards through the closing popup. This waits for the popup to
        be gone, so the row is simply back the next time it is opened. */}
      <Menu.Root
        onOpenChangeComplete={(open) => {
          if (!open) setConfirmingSignOut(false);
        }}
      >
        <Menu.Trigger
          aria-label={`Account: ${name}`}
          className="group flex h-14 w-full cursor-pointer items-center gap-2.5 rounded-xl px-2 text-foreground backdrop-blur-[3px] transition-colors outline-none hover:bg-foreground/[0.05] data-popup-open:bg-foreground/[0.05]"
        >
          {/* The margin centres the avatar in the icon rail's 60px row and
              eases away as the name arrives, the same 8px slide the nav rows'
              icons make; see `AppSidebar`. */}
          <span className="ml-1 flex shrink-0 transition-[margin] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] wide:ml-0">
            <Avatar src={user.imageUrl} name={name} size={36} />
          </span>
          <span className="hidden min-w-0 flex-1 text-left rail-wide wide:block">
            <span className="block truncate text-[0.9375rem] leading-tight">
              {user.fullName ?? name}
            </span>
          </span>
          {/* Points at the popup: up while it is closed because that is where
              it will appear, and flipped once it is open because from there
              the only thing left to do is put it away. Wrapped so the swap's
              transition list and the turn's are on different elements. */}
          <span className="hidden shrink-0 rail-wide wide:block">
            <ChevronUpIcon className="size-4 text-faint transition-transform duration-[260ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-data-popup-open:rotate-180" />
          </span>
        </Menu.Trigger>

        <Menu.Portal>
          <Menu.Positioner
            side="top"
            align="start"
            sideOffset={8}
            className="z-50 outline-none"
          >
            {/* Once the rail is wide the popup takes the trigger's exact width,
              so the two share both edges instead of the menu hanging over
              into the shell. Narrow, the trigger is a 4.5rem icon and there
              is nothing useful to match, so it falls back to a width of its
              own. `lg:` and the rail state together are `wide:`, written out
              because the portal cannot see the attribute. */}
            <Menu.Popup
              className={cn(
                popupClass,
                "w-[15rem]",
                rail === "open" && "lg:w-[var(--anchor-width)]",
              )}
            >
              {/* One door. Behind it is Clerk's account modal with the site's
                settings as its first page and Clerk's own — profile, email
                addresses, password, connected accounts, devices — after it;
                see `useAccountModal`. This used to be two rows, "Account" and
                "Settings", and the line between them was one only the code
                could see.

                The avatar leads the row rather than a gear: the row is the
                door to your account as much as to the site's settings, and
                the face is what says so. It is a row and not a portrait: the
                trigger below already says whose account this is, so repeating
                the name and the address inside the popup as well was three
                restatements of a question nobody had. `Menu.Item` closes the menu on click, which is what
                keeps it from sitting open behind the modal it launches. */}
              <Menu.Item
                onClick={() => openAccount("settings")}
                className={cn(itemClass, "justify-between")}
              >
                <span className="flex items-center gap-2.5">
                  <Avatar src={user.imageUrl} name={name} size={16} />
                  Settings
                </span>
                <ChevronRightIcon className="size-4 shrink-0 text-faint" />
              </Menu.Item>

              {/* A submenu rather than a control in the row: three options are
                one too many to sit inline at this width, and a submenu opens on
                hover, so reaching the theme costs a pointer move instead of a
                click. A fixed moon names the row the way the gear
                names Settings; the current value rides on the label beside the
                chevron, which is what makes this a select rather than a door.

                Radio items deliberately do not close the menu. The change lands
                on the page behind the popup, so it can be seen and corrected
                without reopening anything. */}
              <Menu.SubmenuRoot>
                <Menu.SubmenuTrigger
                  className={cn(itemClass, "cursor-default justify-between")}
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
                </Menu.SubmenuTrigger>

                <Menu.Portal>
                  <Menu.Positioner
                    align="end"
                    sideOffset={6}
                    className="z-50 outline-none"
                  >
                    <Menu.Popup className={cn(popupClass, "w-[10.5rem]")}>
                      <Menu.RadioGroup
                        value={preference}
                        onValueChange={(value) =>
                          setPreference(value as ThemePreference)
                        }
                      >
                        {themePreferences.map((value) => {
                          const { label, icon: Icon } = themeOptions[value];

                          return (
                            <Menu.RadioItem
                              key={value}
                              value={value}
                              className={cn(
                                itemClass,
                                "cursor-pointer justify-between data-checked:text-foreground",
                              )}
                            >
                              <span className="flex items-center gap-2.5">
                                <Icon className="size-4 shrink-0" />
                                {label}
                              </span>
                              <Menu.RadioItemIndicator>
                                <CheckIcon className="size-4 shrink-0 text-primary" />
                              </Menu.RadioItemIndicator>
                            </Menu.RadioItem>
                          );
                        })}
                      </Menu.RadioGroup>
                    </Menu.Popup>
                  </Menu.Positioner>
                </Menu.Portal>
              </Menu.SubmenuRoot>

              <Menu.Separator className="-mx-1.5 my-1.5 h-px bg-border" />

              {/* Sign out asks first, and asks in place. The confirmation is
                not a second row or a dialog: it is the same row turned over,
                the label shrinking away behind a blur while a filled checkbox
                comes forward out of one. Nothing around it moves.

                `closeOnClick` is the row's own state, which is what makes the
                first click inert to the menu — it arms the row and no more —
                and lets the second one close the popup on its way out. */}
              <Menu.Item
                ref={signOutRef}
                // Both faces are in the DOM at all times, so typeahead is told
                // which one to match on rather than being left to read the
                // hidden one too.
                label="Sign out"
                closeOnClick={confirmingSignOut}
                // Armed, the row fills red with white on it and holds that
                // under the highlight: the warning is the row's own state,
                // not a hover effect, and it should not flicker back to grey
                // when the pointer leaves. Unarmed it is a row like the
                // others. The fill is transitioned on the face's clock so it
                // arrives with the words rather than a frame before them.
                className={cn(
                  itemClass,
                  "transition-colors duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
                  confirmingSignOut &&
                    "bg-destructive text-destructive-foreground data-highlighted:bg-destructive data-highlighted:text-destructive-foreground",
                )}
                onClick={() => {
                  if (!confirmingSignOut) {
                    setConfirmingSignOut(true);
                    return;
                  }

                  signOut({ redirectUrl: "/" });
                }}
              >
                <span className="grid flex-1 grid-cols-1 grid-rows-1 items-center">
                  <span
                    aria-hidden={confirmingSignOut}
                    className={cn(
                      signOutFaceClass,
                      confirmingSignOut
                        ? "scale-[0.94] opacity-0 blur-[3px]"
                        : "scale-100 opacity-100 blur-[0px]",
                    )}
                  >
                    <SignOutIcon className="size-4 shrink-0" />
                    Sign out
                  </span>
                  <span
                    aria-hidden={!confirmingSignOut}
                    className={cn(
                      signOutFaceClass,
                      confirmingSignOut
                        ? "scale-100 opacity-100 blur-[0px]"
                        : "scale-[1.08] opacity-0 blur-[3px]",
                    )}
                  >
                    {/* The warning arrives on its own scale, bigger than the
                      face's: it springs up from small with an overshoot a
                      beat after the words settle, so the eye lands on it.
                      Disarmed it shrinks back ahead of the face fading. */}
                    <ExclamationTriangleIcon
                      className={cn(
                        "size-4 shrink-0 transition-[scale] duration-[320ms] ease-[cubic-bezier(0.34,1.56,0.64,1)]",
                        confirmingSignOut
                          ? "scale-100 delay-[60ms]"
                          : "scale-[0.4] delay-0 duration-[160ms] ease-in",
                      )}
                    />
                    Confirm?
                  </span>
                </span>
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>

      {/* The settings page and its nav icon, portalled into the modal while
        it is open and nothing at all while it is not. */}
      {accountPages}
    </>
  );
}
