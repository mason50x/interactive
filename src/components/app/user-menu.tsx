"use client";

import { useClerk, useUser } from "@clerk/nextjs";
import { ChevronRightIcon } from "@heroicons/react/24/outline";
import { ShieldCheckIcon } from "@heroicons/react/16/solid";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { useAccountModal } from "@/components/app/account-modal";
import { useChat } from "@/components/app/chat/chat-provider";
import { Avatar } from "@/components/app/user-menu/avatar";
import { SignOutRow } from "@/components/app/user-menu/sign-out-row";
import { ThemeSubmenu } from "@/components/app/user-menu/theme-submenu";
import { StaffBadge } from "@/components/ui/staff-badge";
import { useTheme } from "@/components/theme-provider";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLinkItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { useClickOutside } from "@/lib/use-click-outside";
import { useCachedAdminBadge } from "@/lib/use-cached-admin-badge";
import { cn } from "@/lib/utils";
import { normalizePersonName } from "@/lib/person-name";

/**
 * The account control at the end of the header: who you are, and the two
 * things you can do about it.
 *
 * This replaces Clerk's `<UserButton />` rather than restyling it. The stock
 * component is an avatar and a menu we do not control the contents of, and
 * the theme switch has to live *in* that menu — there is nowhere else in this
 * layout for it to go. What is left of Clerk here is the data (`useUser`),
 * the modal behind the Settings row (`useAccountModal`) and the one action it
 * owns (`signOut`).
 */
export function UserMenu() {
  const { isLoaded, user } = useUser();
  const { staffRoles, adminBadgesLoaded } = useChat();
  const showAdminBadge = useCachedAdminBadge(
    user?.id,
    user && adminBadgesLoaded
      ? (staffRoles.find(
          (entry) => entry.clerkId === user.id && !entry.hideBadge,
        )?.role ?? "member")
      : undefined,
  );
  const hasAdminPanel = staffRoles.some(
    (entry) =>
      entry.clerkId === user?.id &&
      (entry.role === "ceo" || entry.role === "head_moderator"),
  );
  const { signOut } = useClerk();
  const { preference, setPreference } = useTheme();
  const { open: openAccount, pages: accountPages } = useAccountModal();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const signOutRef = useRef<HTMLDivElement>(null);

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
    return <div className="size-11 shrink-0" aria-hidden />;
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
        <MenuTrigger
          aria-label={`Account: ${name}`}
          className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full backdrop-blur-[3px] transition-opacity outline-none hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <Avatar src={user.imageUrl} name={name} size={36} />
        </MenuTrigger>

        <MenuContent side="bottom" align="end" sideOffset={8} className="w-60">
          {/* The trigger is only a face, so the popup opens by saying whose
            account it is — and wears the staff chip that used to sit under
            the name in the rail. */}
          <div className="flex min-w-0 items-center gap-2 px-2.5 pt-1.5 pb-2">
            <span className="min-w-0 truncate text-[0.875rem] font-medium">
              {normalizePersonName(user.fullName) ?? name}
            </span>
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
          </div>

          <MenuSeparator className="-mx-1.5 mb-1.5" />

          {/* One door. Behind it is Clerk's account modal with the site's
            settings as its first page and Clerk's own — profile, email
            addresses, password, connected accounts, devices — after it;
            see `useAccountModal`. This used to be two rows, "Account" and
            "Settings", and the line between them was one only the code
            could see.

            The avatar leads the row rather than a gear: the row is the
            door to your account as much as to the site's settings, and
            the face is what says so. `MenuItem` closes the
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

          {hasAdminPanel && (
            <MenuLinkItem
              closeOnClick
              render={<Link href="/admin" />}
              tone="muted"
              size="tall"
              className="justify-between"
            >
              <span className="flex items-center gap-2.5">
                <ShieldCheckIcon className="size-4 shrink-0" />
                Admin
              </span>
              <ChevronRightIcon
                strokeWidth={3}
                className="size-4 shrink-0 text-faint"
              />
            </MenuLinkItem>
          )}

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
