"use client";

import { useEffect, type CSSProperties } from "react";
import type { FunctionReturnType } from "convex/server";

import type { api } from "@convex/_generated/api";

export type Restriction = NonNullable<
  FunctionReturnType<typeof api.restrictions.mine>
>;

/**
 * The page a restricted account sees instead of the site: an unstyled HTML
 * error page, the kind a server hands back when something has gone wrong
 * rather than anything that looks like this app. So nothing from the app's
 * type or colour survives here — the browser's default serif, black on white,
 * the user agent's own heading and paragraph spacing written out longhand
 * because the reset stylesheet has taken them away.
 *
 * `banned` says that word and nothing else. `error` is whatever the CEO wrote:
 * a heading, paragraphs, and an Apache-style footer under a rule.
 *
 * `preview` draws it in place for the admin console rather than over the
 * viewport, and leaves the tab title alone.
 */
export function RestrictionScreen({
  restriction,
  preview = false,
}: {
  restriction: Restriction;
  preview?: boolean;
}) {
  const banned = restriction.kind === "banned";
  const heading = banned ? "Banned" : restriction.heading;
  const title = banned ? "Banned" : restriction.title || restriction.heading;
  const paragraphs = banned
    ? []
    : (restriction.message ?? "")
        .split(/\n\s*\n/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean);
  const footer = banned ? undefined : restriction.footer;

  useEffect(() => {
    if (preview || !title) return;
    const previous = document.title;
    document.title = title;
    // Something else writing the title — a tab mask, a route's metadata —
    // doesn't get to take it back while this is up.
    const observer = new MutationObserver(() => {
      if (document.title !== title) document.title = title;
    });
    observer.observe(document.head, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    const { overflow } = document.documentElement.style;
    document.documentElement.style.overflow = "hidden";
    return () => {
      observer.disconnect();
      document.title = previous;
      document.documentElement.style.overflow = overflow;
    };
  }, [preview, title]);

  return (
    <div
      role={preview ? undefined : "alertdialog"}
      aria-modal={preview ? undefined : true}
      aria-label={preview ? undefined : (heading ?? "Error")}
      style={preview ? previewStyle : overlayStyle}
    >
      <div style={bodyStyle}>
        {heading && <h1 style={h1Style}>{heading}</h1>}
        {paragraphs.map((paragraph, index) => (
          <p key={index} style={pStyle}>
            {paragraph}
          </p>
        ))}
        {footer && (
          <>
            <hr style={hrStyle} />
            <address style={addressStyle}>{footer}</address>
          </>
        )}
      </div>
    </div>
  );
}

const pageStyle: CSSProperties = {
  background: "#fff",
  color: "#000",
  colorScheme: "light",
  fontFamily: '"Times New Roman", Times, serif',
  fontSize: 16,
  lineHeight: "normal",
  textAlign: "left",
  WebkitFontSmoothing: "auto",
  MozOsxFontSmoothing: "auto",
};
const overlayStyle: CSSProperties = {
  ...pageStyle,
  position: "fixed",
  inset: 0,
  zIndex: 2147483647,
  overflow: "auto",
  overscrollBehavior: "contain",
};
const previewStyle: CSSProperties = { ...pageStyle, minHeight: "100%" };
const bodyStyle: CSSProperties = { margin: 8 };
const h1Style: CSSProperties = {
  fontSize: "2em",
  fontWeight: "bold",
  margin: "0.67em 0",
  lineHeight: "normal",
  overflowWrap: "anywhere",
};
const pStyle: CSSProperties = {
  margin: "1em 0",
  whiteSpace: "pre-line",
  overflowWrap: "anywhere",
};
const hrStyle: CSSProperties = {
  margin: "0.5em 0",
  border: 0,
  borderTop: "1px solid #999",
  borderBottom: "1px solid #eee",
  height: 0,
};
const addressStyle: CSSProperties = {
  fontStyle: "italic",
  overflowWrap: "anywhere",
};
