import { Spinner } from "@/components/ui/spinner";

export function Searching() {
  return (
    <div className="flex items-center justify-center py-7">
      <Spinner className="size-4 text-faint" />
    </div>
  );
}

/**
 * What a search that found nobody says, in the same block the spinner was in.
 *
 * Nobody is discoverable by accident — see `discoverable` on the profile — so a
 * search finding nothing is as likely to be somebody who has turned themselves
 * off as a handle typed wrong. Where that matters the caller says so; where it
 * does not, `Nobody found.` is the whole of it.
 */
export function FoundNobody({ children }: { children?: React.ReactNode }) {
  return (
    <p className="py-7 text-center text-[0.8125rem] leading-relaxed text-muted-foreground">
      {children ?? "Nobody found."}
    </p>
  );
}
