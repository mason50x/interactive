import {
  ShieldCheckIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/solid";
import { AdminCrown } from "@/components/ui/admin-crown";

/** Shared badge contents for the chat byline and sidebar chip. */
export function StaffBadge({
  role,
  sidebar = false,
}: {
  role: "ceo" | "head_moderator" | "moderator" | "builder";
  sidebar?: boolean;
}) {
  return (
    <>
      {role === "ceo" ? (
        <AdminCrown className="size-3.5 shrink-0" />
      ) : role === "builder" ? (
        <WrenchScrewdriverIcon
          className="size-3.5 shrink-0"
          aria-hidden="true"
        />
      ) : (
        <ShieldCheckIcon className="size-3.5 shrink-0" aria-hidden="true" />
      )}
      {sidebar ? (
        <span className="text-[0.5625rem] leading-none font-bold">
          {role === "ceo"
            ? "CEO"
            : role === "head_moderator"
              ? "HEAD MOD"
              : role === "builder"
                ? "Builder"
                : "MOD"}
        </span>
      ) : null}
    </>
  );
}
