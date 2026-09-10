import type { LegalBlock } from "@/lib/legal";

/**
 * The body of one clause: paragraphs, and lists of points under them.
 *
 * Two block kinds and one weight, which is all `LegalBlock` allows and is
 * deliberate — see the type's note in `src/lib/legal.ts`.
 *
 * `break-words` on both kinds: the prose names contact addresses, and an
 * email is a single unbreakable token long enough to push a 320px page
 * sideways.
 */
export function LegalBlocks({ blocks }: { blocks: readonly LegalBlock[] }) {
  return blocks.map((block, j) =>
    block.kind === "p" ? (
      <p
        key={j}
        className="text-[1rem] leading-[1.75] break-words text-muted-foreground"
      >
        {block.text}
      </p>
    ) : (
      <ul
        key={j}
        className="flex list-disc flex-col gap-2.5 pl-5 marker:text-faint"
      >
        {block.items.map((item) => (
          <li
            key={item}
            className="pl-1 text-[1rem] leading-[1.75] break-words text-muted-foreground"
          >
            {item}
          </li>
        ))}
      </ul>
    ),
  );
}
