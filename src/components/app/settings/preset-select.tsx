"use client";

import { StopIcon } from "@heroicons/react/24/outline";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * One row that opens into six, shared by the two controls that are a choice
 * between the same handful of sites.
 *
 * A dropdown rather than the grid of tiles this used to be. The grid showed
 * all six at once, which sounds like the better trade until you count what it
 * cost: three rows of tiles under each of two labels, in a page whose other
 * four controls are single lines, so arming the panic key doubled the page's
 * height and the two rarest settings were the two loudest things in it. A
 * closed row states the current answer — which is the only part that is true
 * at rest — and the six live one click behind it.
 *
 * The mark survives the change, in both places. These are not names being
 * read; they are the tab you are hoping to land on, or the tab you are hoping
 * to be mistaken for, and the mark is what that tab looks like in the strip
 * along the top. It sits at favicon size, which is the size it will be seen
 * at for real.
 */
export function PresetSelect({
  label,
  value,
  placeholder,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  placeholder?: string;
  options: { value: string; label: string; icon?: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        // The list is single-select and every option carries a string, so the
        // array and null arms of Base UI's signature are unreachable here.
        if (typeof next === "string") onChange(next);
      }}
    >
      <SelectTrigger aria-label={label} className="w-[11.5rem] max-w-full">
        <SelectValue className="flex min-w-0 items-center gap-2">
          {(current: string | null) => {
            const option = options.find((entry) => entry.value === current);

            return option ? (
              <>
                <PresetMark icon={option.icon} />
                <span className="truncate">{option.label}</span>
              </>
            ) : (
              // A destination that predates this list: shown as the address it
              // actually is, so nobody reads the control as saying "Gmail"
              // when the key would take them somewhere else.
              <span className="truncate text-muted-foreground">
                {placeholder}
              </span>
            );
          }}
        </SelectValue>
      </SelectTrigger>

      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <PresetMark icon={option.icon} />
            <span className="truncate">{option.label}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * A site's favicon, or the absence of one.
 *
 * No plate behind the mark: every icon in `public/brand/escape` is transparent
 * and light enough to read on the popup itself, in either theme, so the logo
 * sits on the panel rather than on a white sticker stuck to it. A site whose
 * mark cannot do that does not belong in this list.
 */
export function PresetMark({ icon }: { icon?: string }) {
  return (
    <span className="flex size-4 shrink-0 items-center justify-center">
      {icon ? (
        // Not `next/image`: a 64px favicon served from `public/` has nothing
        // left to optimise, and the loader would put a request in front of
        // five files worth 5 kB together.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={icon}
          alt=""
          width={16}
          height={16}
          className="size-full object-contain"
        />
      ) : (
        <StopIcon className="size-4 text-faint" />
      )}
    </span>
  );
}
