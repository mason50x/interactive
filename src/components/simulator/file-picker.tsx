"use client";

import {
  useRef,
  type ChangeEvent,
  type ComponentProps,
  type RefObject,
} from "react";

/**
 * The simulator pages take files three ways — a hidden `<input type="file">`
 * behind a button, a drop onto the page, and a labelled input on the
 * "insert the original" screen — and every one of them ends in the same
 * three lines: take the first file, clear the input so choosing the same
 * file again still fires `change`, and hand the file on. This module is
 * those lines, once, plus the small shape that lets a button open the input
 * without every caller holding its own ref.
 */

/** The first chosen file, with the input reset so a re-pick of the same
 *  file is still a change. */
export function pickFile(event: ChangeEvent<HTMLInputElement>): File | null {
  const file = event.target.files?.[0] ?? null;
  event.target.value = "";
  return file;
}

export type FilePicker = {
  input: RefObject<HTMLInputElement | null>;
  /** Opens the native chooser — for the visible button. */
  open: () => void;
  /** The `change` handler for the input itself. */
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  /** The callback the picker was made with, exposed so a drop zone can feed
   *  it a dropped file by the same path a chosen one takes. */
  onFile: (file: File) => void;
};

/**
 * A ref, an opener, and a change handler that together are one file input.
 * `onFile` is read on every change rather than captured, so the caller may
 * pass a fresh closure each render without the input going stale.
 */
export function useFilePicker(onFile: (file: File) => void): FilePicker {
  const input = useRef<HTMLInputElement>(null);
  return {
    input,
    onFile,
    open: () => input.current?.click(),
    onChange: (event) => {
      const file = pickFile(event);
      if (file) onFile(file);
    },
  };
}

/** The input a `FilePicker` drives, kept out of sight; the visible control
 *  is whichever button calls `picker.open()`. */
export function HiddenFileInput({
  picker,
  ...props
}: Omit<ComponentProps<"input">, "type" | "onChange" | "ref"> & {
  picker: FilePicker;
}) {
  // Read as two names up front: the compiler lint sees an object holding a
  // ref as a ref, and would flag either property read in the JSX below.
  const { input, onChange } = picker;
  return (
    <input
      ref={input}
      type="file"
      className="hidden"
      onChange={onChange}
      {...props}
    />
  );
}

/**
 * The picker both players use to get their original file back.
 *
 * Progress is keyed by the file's content hash, and a device that has the
 * progress but not the file asks for it again. Whatever is chosen has to
 * hash to the same value, or it is a different program and the progress
 * would be meaningless against it — so the check is here, once, and each
 * player only says what to do with a file that matches.
 */
export function useOriginalFilePicker<T extends { contentHash: string }>({
  contentHash,
  open,
  mismatch,
  onOpen,
  onError,
}: {
  contentHash: string;
  open: (file: File) => Promise<T>;
  /** The message for a file that opens but is not this one. */
  mismatch: string;
  onOpen: (program: T) => Promise<void>;
  onError: (message: string) => void;
}): FilePicker {
  return useFilePicker((file) => {
    void (async () => {
      try {
        const program = await open(file);
        if (program.contentHash !== contentHash) throw new Error(mismatch);
        await onOpen(program);
      } catch (error) {
        onError(
          error instanceof Error ? error.message : "Could not open file.",
        );
      }
    })();
  });
}
