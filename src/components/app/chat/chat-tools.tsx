"use client";

import { ArrowLeftIcon, PlusIcon } from "@heroicons/react/24/solid";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { NewGroupPanel } from "@/components/app/chat/chat-tools/new-group-panel";
import { CHAT_HREF } from "@/lib/nav";

export type Panel = "group";

export function ChatTools({
  open,
  onOpenChange,
}: {
  open: Panel | null;
  onOpenChange: (panel: Panel | null) => void;
}) {
  const router = useRouter();
  return (
    <div className={open ? "flex min-h-0 flex-1 flex-col" : "shrink-0"}>
      <div className="flex items-center px-4 pt-4 pb-2">
        <h2 className="min-w-0 flex-1 truncate text-[1.0625rem] font-semibold">
          {open ? "New group" : "My Feed"}
        </h2>
        <Button
          variant="ghost"
          size="sm"
          aria-label={open ? "Back to feed" : "New group"}
          onClick={() => onOpenChange(open ? null : "group")}
        >
          {open ? (
            <ArrowLeftIcon className="size-4" />
          ) : (
            <PlusIcon className="size-4" />
          )}
        </Button>
      </div>
      {open ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          <NewGroupPanel
            open
            onCreated={(id) => {
              onOpenChange(null);
              router.push(`${CHAT_HREF}/${id}`);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
