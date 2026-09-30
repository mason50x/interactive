import {
  ShieldCheckIcon,
  StarIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/solid";
import { AdminCrown } from "@/components/ui/admin-crown";

/** Shared badge contents for the chat byline and sidebar chip. */
export function StaffBadge({
  role,
  sidebar = false,
}: {
  role: "ceo" | "co_owner" | "head_moderator" | "moderator" | "builder";
  sidebar?: boolean;
}) {
  return (
    <>
      {role === "ceo" ? (
        <AdminCrown className="size-3.5 shrink-0" />
      ) : role === "co_owner" ? (
        <StarIcon className="size-3.5 shrink-0" aria-hidden="true" />
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
            : role === "co_owner"
              ? "CO-OWNER"
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
