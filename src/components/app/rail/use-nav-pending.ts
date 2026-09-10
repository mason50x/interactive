"use client";

import { useLinkStatus } from "next/link";
import { useCallback, useEffect, useState } from "react";

/**
 * The row that has been clicked and is waiting on the server, if any.
 *
 * State on the rail rather than something each row reads for itself, because
 * the pill is one element for the whole list, so the list is what has to know
 * which row to send it to. See `NavPending` for the half that does the
 * reading.
 *
 * `report` is functional, and matched on the way down, so two rows reporting
 * in either order cannot leave a stale one lit: only the row that claimed the
 * pending state can release it.
 */
export function useNavPending() {
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  const report = useCallback((href: string, pending: boolean) => {
    setPendingHref((current) =>
      pending ? href : current === href ? null : current,
    );
  }, []);

  return { pendingHref, report };
}

/**
 * Reports whether the row it sits in has been clicked and is still waiting.
 *
 * `useLinkStatus` only answers inside a `Link`, so this has to be a child of
 * one — which is also why the pending row is state on `AppSidebar` and not on
 * each row: the pill is one element for the whole list, so the list is what has
 * to know which row to send it to.
 *
 * Renders nothing. The visible half of this is the pill and the ink, which the
 * rail already knows how to move.
 *
 * The cleanup releases the claim as well as the effect, so a row unmounting
 * mid-navigation cannot leave the rail lit on a destination nobody is going to.
 * Both paths report the same thing, which is why it is safe for them to run
 * back to back on the commit that resolves the click.
 */
export function NavPending({
  href,
  report,
}: {
  href: string;
  report: (href: string, pending: boolean) => void;
}) {
  const { pending } = useLinkStatus();

  useEffect(() => {
    report(href, pending);
    return () => report(href, false);
  }, [href, pending, report]);

  return null;
}
