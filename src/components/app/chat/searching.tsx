import { Spinner } from "@/components/ui/spinner";

/**
 * The wait for a handle search, wherever one is being waited for.
 *
 * A file rather than a snippet in each place, because the two searches — the
 * tools panel's and the group sheet's — sit one click apart and are asking the
 * same question of the same index. A wait that looked different in each would
 * read as two different features.
 *
 * Centred, and deliberately the same shape as the answer that replaces it, so
 * nothing under the heading moves sideways when the results arrive. The word
 * shimmers rather than a row of grey bars pulsing: this is a wait of a couple
 * of hundred milliseconds for one short list, and a skeleton of a list whose
 * length nobody can predict is a bigger lie than a spinner. See `.text-shimmer`
 * in `globals.css` for why the highlight is painted on the text itself.
 */
export function Searching() {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-7">
      <Spinner aria-hidden className="size-4 text-faint" />
      <span className="text-shimmer text-[0.8125rem]">Searching</span>
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
