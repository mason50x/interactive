import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { privacy } from "@/lib/legal";

export const metadata: Metadata = {
  title: privacy.title,
  description:
    "What Interactive Learning collects, why, who else handles it, and what you can do about it.",
};

export default function PrivacyPage() {
  return <LegalDocument doc={privacy} />;
}
