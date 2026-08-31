"use client";

// TEMPORARY — visual check. Delete before committing.
import { AgreementRequired } from "@/components/app/agreement-required";

export default function HandlePreviewPage() {
  return (
    <div className="h-svh w-full">
      <AgreementRequired title="Chat" />
    </div>
  );
}
