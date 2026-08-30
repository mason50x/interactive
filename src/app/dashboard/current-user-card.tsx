"use client";

import { useQuery } from "convex/react";
import Image from "next/image";
import { api } from "../../../convex/_generated/api";

export function CurrentUserCard() {
  const user = useQuery(api.users.current);

  if (user === undefined) {
    return (
      <div className="h-32 animate-pulse rounded-xl border border-black/[.08] dark:border-white/[.12]" />
    );
  }

  if (user === null) {
    return (
      <div className="rounded-xl border border-black/[.08] p-5 text-sm text-foreground/55 dark:border-white/[.12]">
        No Convex user record yet — it is written on your first authenticated
        request.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 rounded-xl border border-black/[.08] p-5 dark:border-white/[.12]">
      <div className="flex items-center gap-4">
        {user.imageUrl && (
          <Image
            src={user.imageUrl}
            alt=""
            width={48}
            height={48}
            className="rounded-full"
            unoptimized
          />
        )}
        <div className="min-w-0">
          <p className="truncate font-medium">{user.name ?? "Unnamed user"}</p>
          <p className="truncate text-sm text-foreground/55">{user.email}</p>
        </div>
      </div>

      <dl className="grid gap-2 border-t border-black/[.08] pt-4 text-sm dark:border-white/[.12]">
        {(
          [
            ["Convex document ID", user._id],
            ["Clerk user ID", user.clerkId],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="flex flex-wrap gap-x-3">
            <dt className="w-44 shrink-0 text-foreground/55">{label}</dt>
            <dd className="font-mono text-xs break-all">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
