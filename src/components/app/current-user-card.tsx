"use client";

import { useQuery } from "convex/react";
import Image from "next/image";
import { api } from "../../../convex/_generated/api";

/**
 * The Convex record for whoever is signed in, read live.
 *
 * `useQuery` returns `undefined` while the subscription is opening and `null`
 * when the document genuinely does not exist yet — a real gap, since the row
 * is written by the Clerk webhook rather than at sign-up — so the three states
 * are rendered separately instead of being collapsed into one empty case.
 */
export function CurrentUserCard() {
  const user = useQuery(api.users.current);

  if (user === undefined) {
    return (
      <div className="h-40 animate-pulse rounded-xl border border-border bg-surface" />
    );
  }

  if (user === null) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-[0.9375rem] leading-relaxed text-muted-foreground">
        No Convex user record yet — it is written on your first authenticated
        request.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 rounded-xl border border-border bg-surface p-6">
      <div className="flex items-center gap-4">
        {user.imageUrl && (
          <Image
            src={user.imageUrl}
            alt=""
            width={52}
            height={52}
            className="rounded-full"
            unoptimized
          />
        )}
        <div className="min-w-0">
          <p className="truncate font-medium">{user.name ?? "Unnamed user"}</p>
          <p className="truncate text-sm text-muted-foreground">{user.email}</p>
        </div>
      </div>

      <dl className="grid gap-2.5 border-t border-border pt-5 text-sm">
        {(
          [
            ["Convex document ID", user._id],
            ["Clerk user ID", user.clerkId],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="flex flex-wrap gap-x-3">
            <dt className="w-44 shrink-0 text-muted-foreground">{label}</dt>
            <dd className="font-mono text-xs break-all text-foreground">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
