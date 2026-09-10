/**
 * The simulations that ship with the app, looked up by content hash.
 *
 * Empty today: every entry is one the reader brought. The shape is kept so a
 * built-in can be added as a row here without the player learning anything
 * new — it already takes a `Builtin` where it would otherwise take a file.
 */
import "server-only";
import type { Builtin } from "./types";
export const BUILTINS: Builtin[] = [];
export const findBuiltin = (hash: string) =>
  BUILTINS.find((b) => b.contentHash === hash) ?? null;
