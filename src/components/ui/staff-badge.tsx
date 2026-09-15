import { ShieldCheckIcon } from "@heroicons/react/24/solid";
import { AdminCrown } from "@/components/ui/admin-crown";

/** Shared badge contents for the chat byline and sidebar chip. */
export function StaffBadge({
  role,
  sidebar = false,
}: {
  role: "ceo" | "moderator";
  sidebar?: boolean;
}) {
  return (
    <>
      {role === "ceo" ? (
        <AdminCrown className="size-3.5 shrink-0" />
      ) : (
        <ShieldCheckIcon className="size-3.5 shrink-0" aria-hidden="true" />
      )}
      {role === "ceo" || sidebar ? (
        <span className="text-[0.5625rem] leading-none font-bold">
          {role === "ceo" ? "CEO" : "MOD"}
        </span>
      ) : null}
    </>
  );
}
