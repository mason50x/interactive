/**
 * The greeting the devtools console gets.
 *
 * Anyone who opens the console on a learning site is curious by definition,
 * so the first thing they find is a joke at the expense of the warning they
 * were expecting — the big red "do not paste anything here" box — and then an
 * offer, which is the only reason the joke is worth the bytes.
 *
 * It ships as an inline script rather than a component effect because a
 * component logs after hydration, by which time React, Clerk, and Convex have
 * all had a chance to write to the console first. Inline, it is the first
 * line in the console and costs two `console.log` calls of frozen strings —
 * no listeners, no state, nothing retained.
 */

const CAUTION = "⚠︎ Nothing to hide here..";
const OFFER = "Try out a free map with code ";
const CODE = "CONSOLE20";

/**
 * Console CSS is its own small dialect: Chrome and Firefox honour the box
 * properties below and drop the rest, and Safari renders the text unstyled.
 * Every colour is stated outright, background included, so the box reads the
 * same whether devtools is in its light theme or its dark one.
 */
const CAUTION_STYLE = [
  "background:#141210",
  "color:#f2b03d",
  "border:1px solid #f2b03d",
  "border-radius:8px",
  "padding:14px 20px",
  "font:600 18px/1.4 ui-sans-serif,system-ui,sans-serif",
].join(";");

const OFFER_STYLE = [
  "color:#8a8f98",
  "font:14px/1.6 ui-sans-serif,system-ui,sans-serif",
].join(";");

const CODE_STYLE = [
  "background:#f2b03d",
  "color:#141210",
  "border-radius:4px",
  "padding:2px 7px",
  "font:600 14px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace",
].join(";");

const args = [
  [`%c${CAUTION}`, CAUTION_STYLE],
  [`%c${OFFER}%c${CODE}%c.`, OFFER_STYLE, CODE_STYLE, OFFER_STYLE],
];

/**
 * `try` because a console is not guaranteed — some embedded webviews ship
 * without one — and a greeting is never worth taking the page down for.
 */
export const consoleGreetingScript = `(function(){try{${args
  .map((line) => `console.log(${line.map((a) => JSON.stringify(a)).join(",")})`)
  .join(";")}}catch(_){}})()`;
