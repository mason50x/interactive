import "server-only";
import builtins from "../../../convex/simulator/builtins.json";
export const BUILTINS = builtins;
export const findBuiltin = (hash: string) =>
  BUILTINS.find((b) => b.contentHash === hash) ?? null;
