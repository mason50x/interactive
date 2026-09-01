import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { terms } from "@/lib/legal";

export const metadata: Metadata = {
  title: terms.title,
  description:
    "The agreement between you and Interactive Learning for your use of the site and everything on it.",
};

export default function TermsPage() {
  return <LegalDocument doc={terms} />;
}
