import { Fragment } from "react";

/**
 * Renders copy where _wrapped_ words get the accent underline treatment.
 * Keeps the emphasis decision in the content file rather than in markup.
 */
export function MarkedText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(_[^_]+_)/g).map((chunk, i) =>
        chunk.startsWith("_") && chunk.endsWith("_") && chunk.length > 2 ? (
          <span key={i} className="underline-marker">
            {chunk.slice(1, -1)}
          </span>
        ) : (
          <Fragment key={i}>{chunk}</Fragment>
        ),
      )}
    </>
  );
}
