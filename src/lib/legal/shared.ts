/**
 * What both legal documents are built from: the role addresses they name,
 * the date they share, and the block vocabulary the renderer draws.
 */
import { brand } from "@/lib/brand";

/** Role addresses. Deliberately not a person, on any of these. */
export const legalContacts = {
  privacy: `privacy@${brand.domain}`,
  legal: `legal@${brand.domain}`,
  copyright: `copyright@${brand.domain}`,
} as const;

/**
 * Both documents carry the same date, because they were written together
 * and a reader comparing them should not have to wonder which is current.
 */
export const LEGAL_UPDATED = "2026-08-31";

/** `YYYY-MM-DD` rendered the way a reader reads it, in a fixed zone so the
 *  server and the browser cannot disagree about which day it is. */
export function formatLegalDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * A paragraph, or a list of points under the paragraph before it.
 *
 * There is no heading block and no callout block on purpose. A legal
 * document that emphasises three of its clauses has told the reader the
 * other forty do not matter, and an emphasised clause is the first one a
 * court reads as the whole agreement. Everything here is set at one weight.
 */
export type LegalBlock =
  { kind: "p"; text: string } | { kind: "list"; items: readonly string[] };

export type LegalSection = {
  /** The fragment this section answers to, so a clause can be linked. */
  id: string;
  heading: string;
  blocks: readonly LegalBlock[];
};

export type LegalDocument = {
  title: string;
  /** Shown under the title, unnumbered, and part of the agreement. */
  lede: string;
  sections: readonly LegalSection[];
};
