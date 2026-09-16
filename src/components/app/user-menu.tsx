"use client";

import { useClerk, useUser } from "@clerk/nextjs";
import { ChevronRightIcon, ChevronUpIcon } from "@heroicons/react/24/outline";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAccountModal } from "@/components/app/account-modal";
import { useChat } from "@/components/app/chat/chat-provider";
import { Avatar } from "@/components/app/user-menu/avatar";
import { SignOutRow } from "@/components/app/user-menu/sign-out-row";
import { ThemeSubmenu } from "@/components/app/user-menu/theme-submenu";
import { GitHubIcon } from "@/components/ui/github-icon";
import { StaffBadge } from "@/components/ui/staff-badge";
import { useTheme } from "@/components/theme-provider";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { signOutRequest } from "@/lib/search-actions";
import { onSettingsRequest } from "@/lib/preferences";
import { useClickOutside } from "@/lib/use-click-outside";
import { useCachedAdminBadge } from "@/lib/use-cached-admin-badge";
import { cn } from "@/lib/utils";
import { normalizePersonName } from "@/lib/person-name";

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
  const { staffRoles, adminBadgesLoaded } = useChat();
  const showAdminBadge = useCachedAdminBadge(
    user?.id,
    user && adminBadgesLoaded
      ? (staffRoles.find((entry) => entry.clerkId === user.id)?.role ??
          "member")
      : undefined,
  );
  const { signOut } = useClerk();
  const { preference, setPreference } = useTheme();
  const { open: openAccount, pages: accountPages } = useAccountModal();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const signOutRef = useRef<HTMLDivElement>(null);

  // The rail's search can name a setting — "constellation", "panic key" — or
  // the account, and what it does with either is open the modal on that page.
  // See `requestSettings`.
  useEffect(() => onSettingsRequest(openAccount), [openAccount]);

  useEffect(
    () =>
      signOutRequest.subscribe(() => {
        setMenuOpen(true);
        setConfirmingSignOut(true);
      }),
    [],
  );

  // A press on anything but the sign-out row puts it back. This listens on the
  // document rather than on the popup because the theme submenu is portalled
  // out of it — a press on a theme option never passes through the popup the
  // row lives in — and because a press outside the menu should disarm the row
  // on the way out, not leave it armed under the close.
  const disarm = useCallback(() => setConfirmingSignOut(false), []);
  useClickOutside(signOutRef, disarm, confirmingSignOut);

  if (!isLoaded || !user) {
    // Holds the row's exact height so the rail does not jump when the session
    // resolves. Not a spinner: this is usually a single frame.
    return <div className="h-14" aria-hidden />;
  }

  const name =
    normalizePersonName(user.firstName) ?? user.username ?? "Account";
  const chipClassName =
    "inline-flex shrink-0 items-center gap-1 rounded-full border border-zinc-200 bg-gradient-to-b from-white to-zinc-100 px-1.5 py-0.5 text-[0.5625rem] leading-none font-bold shadow-[0_1px_2px_rgb(0_0_0/0.16),inset_0_1px_0_rgb(255_255_255/0.9)] dark:border-zinc-600 dark:from-zinc-700 dark:to-zinc-800 dark:shadow-[0_2px_3px_rgb(0_0_0/0.4),inset_0_1px_0_rgb(255_255_255/0.12)]";

  return (
    <>
      {/* Deferred to `onOpenChangeComplete` rather than `onOpenChange`: an
        armed row that reverts the instant the menu is dismissed plays the
        turn backwards through the closing popup. This waits for the popup to
        be gone, so the row is simply back the next time it is opened. */}
      <Menu
        open={menuOpen}
        onOpenChange={setMenuOpen}
        onOpenChangeComplete={(open) => {
          if (!open) setConfirmingSignOut(false);
        }}
      >
        <div className="relative">
          <MenuTrigger
            aria-label={`Account: ${name}`}
            className="group flex h-14 w-full cursor-pointer items-center gap-2.5 rounded-xl px-2 text-foreground backdrop-blur-[3px] transition-colors outline-none hover:bg-foreground/[0.05] data-popup-open:bg-foreground/[0.05]"
          >
            {/* The margin centres the avatar in the icon rail's 60px row and
              eases away as the name arrives, the same 8px slide the nav rows'
              icons make; see `AppSidebar`. */}
            <span className="ml-1 flex shrink-0 transition-[margin] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] wide:ml-0">
              <Avatar src={user.imageUrl} name={name} size={36} />
            </span>
            <span className="hidden min-w-0 flex-1 pb-5 text-left rail-wide wide:block">
              <span className="block truncate text-[0.9375rem] leading-tight">
                {normalizePersonName(user.fullName) ?? name}
              </span>
            </span>
            {/* Points at the popup: up while it is closed because that is where
              it will appear, and flipped once it is open because from there
              the only thing left to do is put it away. Wrapped so the swap's
              transition list and the turn's are on different elements. */}
            <span className="hidden shrink-0 rail-wide wide:block">
              <ChevronUpIcon
                strokeWidth={3}
                className="size-4 text-faint transition-transform duration-[260ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-data-popup-open:rotate-180"
              />
            </span>
          </MenuTrigger>
          {/* Separate from the menu button so the source link stays a native link. */}
          <div
            className={cn(
              "absolute bottom-2 left-[3.375rem] hidden items-center gap-1.5 rail-wide wide:flex",
              showAdminBadge === null && "invisible",
            )}
          >
            {showAdminBadge && showAdminBadge !== "member" ? (
              <span
                className={cn(
                  chipClassName,
                  "release-unread-glow relative text-orange-600 [--release-rim-color:var(--color-orange-500)] [--release-rim-duration:4s] [--release-rim-glow:1px] [--release-rim-width:1px] dark:text-orange-400",
                )}
              >
                <StaffBadge role={showAdminBadge} sidebar />
              </span>
            ) : null}
            <a
              href="https://github.com/mason50x/interactive"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="OSS — source code on GitHub"
              className={cn(
                chipClassName,
                "text-zinc-600 transition-colors hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring dark:text-zinc-200 dark:hover:text-white",
              )}
            >
              <GitHubIcon className="size-3 shrink-0" />
              OSS
            </a>
          </div>
        </div>

        {/* Once the rail is wide the popup takes the trigger's exact width,
          so the two share both edges instead of the menu hanging over
          into the shell. Narrow, the trigger is a 4.5rem icon and there
          is nothing useful to match, so it falls back to a width of its
          own. `lg:` matches the sidebar’s responsive breakpoint. */}
        <MenuContent
          side="top"
          align="start"
          sideOffset={8}
          className="w-[15rem] lg:w-[var(--anchor-width)]"
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
            restatements of a question nobody had. `MenuItem` closes the
            menu on click, which is what keeps it from sitting open behind
            the modal it launches. */}
          <MenuItem
            onClick={() => openAccount("settings")}
            tone="muted"
            size="tall"
            className="justify-between"
          >
            <span className="flex items-center gap-2.5">
              <Avatar src={user.imageUrl} name={name} size={16} />
              Settings
            </span>
            <ChevronRightIcon
              strokeWidth={3}
              className="size-4 shrink-0 text-faint"
            />
          </MenuItem>

          <ThemeSubmenu preference={preference} onChange={setPreference} />

          <MenuSeparator className="-mx-1.5 my-1.5" />

          <SignOutRow
            ref={signOutRef}
            confirming={confirmingSignOut}
            onClick={() => {
              if (!confirmingSignOut) {
                setConfirmingSignOut(true);
                return;
              }

              signOut({ redirectUrl: "/" });
            }}
          />
        </MenuContent>
      </Menu>

      {/* The settings page and its nav icon, portalled into the modal while
        it is open and nothing at all while it is not. */}
      {accountPages}
    </>
  );
}
