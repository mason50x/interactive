"use client";

import { useClerk } from "@clerk/nextjs";
import { Cog6ToothIcon } from "@heroicons/react/24/solid";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { SettingsPanel } from "@/components/app/settings-panel";
import type { SettingsPage } from "@/lib/preferences";

/**
 * Clerk's account modal, with this site's settings as its first page.
 *
 * A hook, not a component, though the file is named for the modal: the modal
 * is Clerk's and is opened imperatively, so what this module exports is
 * `useAccountModal` — the `open` that launches it and the `pages` that have
 * to be rendered somewhere for the settings page to be React — and nothing
 * else. The name stays because it names the thing the hook is the door to.
 *
 * The modal is Clerk's and so is everything on its Account and Security
 * pages — profile, email addresses, password, connected accounts, devices —
 * none of which is worth rebuilding. What is ours is one page ahead of those,
 * registered through `customPages`, and this hook is the join between the two
 * frameworks that has to exist for that page to be React.
 *
 * Clerk's custom-page API is imperative: it hands over a `<div>` to fill and
 * asks for it back later. The naive answer, a second React root rendered into
 * that div, would put the page outside every provider it depends on — the
 * settings are a Convex subscription and the accent is a context — so the
 * div is held in state instead and the page is a portal into it. That keeps
 * it in this tree, under `PreferencesProvider`, with Clerk none the wiser.
 *
 * `open` takes the page to land on. Both doors — the row in the account menu
 * and the search's "account" result — go through here, because the pages have
 * to be registered on every call: `openUserProfile` with no custom pages
 * would open the same modal one page short.
 */
export function useAccountModal() {
  const { openUserProfile } = useClerk();
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  const [iconSlot, setIconSlot] = useState<HTMLDivElement | null>(null);

  const customPages = useMemo(
    () => [
      {
        label: "Settings",
        url: "settings",
        mount: (el: HTMLDivElement) => setSlot(el),
        unmount: () => setSlot(null),
        mountIcon: (el: HTMLDivElement) => setIconSlot(el),
        unmountIcon: () => setIconSlot(null),
      },
      // Named so they follow rather than lead: the modal opens on whichever
      // page is first, and the row that opens it says "Settings".
      { label: "account" },
      { label: "security" },
    ],
    [],
  );

  const open = useCallback(
    (page: SettingsPage = "settings") => {
      openUserProfile({
        customPages,
        // With a custom page first, Clerk's own account page moves off the
        // root and on to its own path.
        __experimental_startPath: page === "account" ? "/account" : undefined,
      });
    },
    [customPages, openUserProfile],
  );

  const pages: ReactNode = (
    <>
      {slot && createPortal(<SettingsPanel />, slot)}
      {iconSlot &&
        createPortal(<Cog6ToothIcon className="size-4 shrink-0" />, iconSlot)}
    </>
  );

  return { open, pages };
}
