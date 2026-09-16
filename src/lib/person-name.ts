/** App name casing, independent of the spelling supplied by a sign-in provider. */
export function normalizePersonName(
  name: string | null | undefined,
): string | undefined {
  const trimmed = name?.trim().replace(/\s+/g, " ");
  if (!trimmed) return undefined;
  return trimmed
    .toLowerCase()
    .replace(/(^|[\s\-'’])\p{L}/gu, (letter) => letter.toUpperCase());
}
