"use client";

import { Button, ButtonLink } from "@/components/ui/button";
import type { FilePicker } from "./file-picker";

/**
 * What the HTML player shows instead of a frame when it has nothing to put
 * in one: the device has no copy of this file, or opening it failed.
 *
 * The HTML never leaves the device it was opened on, so an entry the
 * account knows about can arrive here on a second device with progress
 * and no page. The picker it is handed already checks that the chosen file
 * hashes to this entry. With an error the heading changes, the sentence
 * becomes the error and is announced, and a retry button appears beside
 * the way back.
 */
export function HtmlFilePrompt({
  error,
  picker,
  back,
  retry,
}: {
  error: string;
  picker: FilePicker;
  back: string;
  retry: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 p-8 text-center">
      <h1 className="text-2xl font-semibold">
        {error ? "HTML couldn’t open" : "Open the original HTML"}
      </h1>
      <p
        role={error ? "alert" : undefined}
        className="max-w-md text-sm text-muted-foreground"
      >
        {error ||
          "This device doesn’t have the file yet. Choose the matching original HTML. Progress is stored separately on each device."}
      </p>
      <label className="cursor-pointer rounded-lg border border-border bg-background px-4 py-2 text-sm">
        Choose HTML
        <input
          type="file"
          accept=".html,.htm"
          className="sr-only"
          onChange={picker.onChange}
        />
      </label>
      <div className="flex gap-3">
        <ButtonLink href={back} variant="ghost">
          Back to HTML
        </ButtonLink>
        {error && (
          <Button onClick={retry} variant="outline">
            Retry
          </Button>
        )}
      </div>
    </div>
  );
}
