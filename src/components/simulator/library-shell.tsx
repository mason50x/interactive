"use client";

import type { ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { HiddenFileInput, type FilePicker } from "./file-picker";

/**
 * The outer frame of a simulator library: the whole page is a drop target,
 * the file input the "Choose file" button opens lives here out of sight, and
 * any error the library has to show sits above everything else.
 *
 * `dragover` is only claimed for drags that carry files, so dragging text
 * across the page keeps its normal behaviour. A drop and a chosen file take
 * the same path through the picker, which is what keeps the two from
 * drifting apart in what they accept.
 */
export function LibraryShell({
  picker,
  accept,
  inputLabel,
  busy,
  error,
  children,
}: {
  picker: FilePicker;
  accept: string;
  inputLabel: string;
  busy: boolean;
  error: string;
  children: ReactNode;
}) {
  return (
    <div
      className="space-y-10"
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        const file = event.dataTransfer.files[0];
        if (file) picker.onFile(file);
      }}
    >
      <HiddenFileInput
        picker={picker}
        accept={accept}
        aria-label={inputLabel}
        disabled={busy}
      />
      {error && <Alert>{error}</Alert>}
      {children}
    </div>
  );
}
