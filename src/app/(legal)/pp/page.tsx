/** The privacy policy, read from `legalDocuments`. */
import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { legalDocuments } from "@/lib/legal";

const { document, sibling } = legalDocuments.pp;

export const metadata: Metadata = {
  title: document.title,
  description:
    "What Interactive Learning collects, why, who else handles it, and what you can do about it.",
};

export default function PrivacyPage() {
  return <LegalDocument doc={document} sibling={sibling} />;
}
