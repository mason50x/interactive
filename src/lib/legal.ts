/**
 * The two legal documents, as data.
 *
 * They live here for the same reason the marketing copy lives in
 * `content.ts` — so the words can be revised without touching the layout
 * that sets them — but they carry one thing marketing copy does not: a
 * clause is a promise, and a page that renders a promise it invented would
 * be worse than no page. So the renderer has no prose of its own. Every
 * sentence a reader sees is in this file.
 *
 * Two rules held throughout, both of them load-bearing:
 *
 *   1. Nothing here identifies a person. The operator is "we"; the
 *      addresses are roles on the brand domain, not anyone's mailbox.
 *   2. Nothing here claims a compliance status the Service does not have.
 *      A false certification is not a shield — it is the thing a school's
 *      lawyer reads back to you. The protection in these documents comes
 *      from the clauses that are *true*: no affiliation, no institutional
 *      contract by osmosis, no education records held, and the network's
 *      own rules being a matter between the reader and their network.
 */

import { privacy } from "@/lib/legal/privacy";
import { type LegalDocument } from "@/lib/legal/shared";
import { terms } from "@/lib/legal/terms";

export {
  formatLegalDate,
  LEGAL_UPDATED,
  type LegalBlock,
  type LegalDocument,
  type LegalSection,
} from "@/lib/legal/shared";
export { privacy, terms };

/**
 * The two documents by the route that serves them, each with the other as
 * its sibling. `/pp` and `/tos` are the same page with these two values
 * swapped, and this is the one place that swap is written down.
 */
export type LegalSlug = "pp" | "tos";

export const legalDocuments: Record<
  LegalSlug,
  { document: LegalDocument; sibling: { title: string; href: string } }
> = {
  pp: { document: privacy, sibling: { title: terms.title, href: "/tos" } },
  tos: { document: terms, sibling: { title: privacy.title, href: "/pp" } },
};
