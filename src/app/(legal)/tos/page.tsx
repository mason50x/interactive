/** The terms of service, read from `legalDocuments`. */
import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { legalDocuments } from "@/lib/legal";

const { document, sibling } = legalDocuments.tos;

export const metadata: Metadata = {
  title: document.title,
  description:
    "The agreement between you and Interactive Learning for your use of the site and everything on it.",
};

export default function TermsPage() {
  return <LegalDocument doc={document} sibling={sibling} />;
}
