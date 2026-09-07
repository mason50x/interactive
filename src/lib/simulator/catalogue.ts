import "server-only";
import type { Builtin } from "./types";
export const BUILTINS: Builtin[] = [];
export const findBuiltin = (hash: string) =>
  BUILTINS.find((b) => b.contentHash === hash) ?? null;
