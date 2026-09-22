"use client";

import { useEffect, useRef, useState } from "react";
import { useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ConvexError } from "convex/values";
import {
  MAX_PUBLISHED_HTML_BYTES,
  MAX_PUBLISHED_DESCRIPTION,
  validatePublishedHtml,
} from "@config/published-html";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

export type PublishedDraft = {
  id?: Id<"publishedHtmlSimulators">;
  expectedRevision?: number;
  label: string;
  description: string;
  source: string;
};
export function publishingError(error: unknown) {
  return error instanceof ConvexError && typeof error.data === "string"
    ? error.data
    : error instanceof Error
      ? error.message
      : "Could not save your changes. Please retry.";
}
export function PublishedHtmlEditor({
  draft,
  close,
}: {
  draft: PublishedDraft;
  close: () => void;
}) {
  const save = useAction(api.simulator.published.save);
  const [label, setLabel] = useState(draft.label);
  const [description, setDescription] = useState(draft.description);
  const [source, setSource] = useState(draft.source);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const request = useRef<{ fingerprint: string; id: string } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    <form
      className="space-y-4 rounded-xl border border-border bg-background p-5"
      onDrop={(event) => event.stopPropagation()}
      onSubmit={async (event) => {
        event.preventDefault();
        if (lock.current) return;
        lock.current = true;
        setBusy(true);
        setError("");
        try {
          validatePublishedHtml(source);
          // Keep the same request ID when retrying a failed response, avoiding duplicates.
          const fingerprint = JSON.stringify([label, description, source]);
          if (request.current?.fingerprint !== fingerprint)
            request.current = { fingerprint, id: crypto.randomUUID() };
          await save({
            ...draft,
            label,
            description,
            source,
            operationId: request.current.id,
          });
          close();
        } catch (e) {
          setError(publishingError(e));
        } finally {
          lock.current = false;
          setBusy(false);
        }
      }}
    >
      <h3
        ref={heading}
        tabIndex={-1}
        className="text-lg font-semibold outline-none"
      >
        {draft.id ? "Edit published simulation" : "Publish HTML simulation"}
      </h3>
      <p className="text-sm text-muted-foreground">
        Self-contained HTML, up to 2 MiB. Scripts run in the simulator sandbox
        without network access. Publishing shares code, never your progress.
      </p>
      {draft.id && (
        <p className="text-sm text-muted-foreground">
          Changing the code starts fresh device progress for this template.
          Renaming it keeps progress.
        </p>
      )}
      {error && <Alert>{error}</Alert>}
      <fieldset disabled={busy} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="published-title" className="text-sm font-medium">
            Name
          </label>
          <Input
            id="published-title"
            required
            maxLength={60}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <label
            htmlFor="published-description"
            className="text-sm font-medium"
          >
            Description
          </label>
          <Input
            id="published-description"
            maxLength={MAX_PUBLISHED_DESCRIPTION}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="published-file" className="text-sm font-medium">
            Replace code from an HTML file
          </label>
          <Input
            id="published-file"
            type="file"
            accept=".html,.htm,text/html"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              try {
                if (
                  !/\.html?$/i.test(file.name) ||
                  file.size > MAX_PUBLISHED_HTML_BYTES
                )
                  throw new Error("Choose an .html or .htm file up to 2 MiB.");
                const text = new TextDecoder("utf-8", { fatal: true }).decode(
                  await file.arrayBuffer(),
                );
                validatePublishedHtml(text);
                setSource(text);
                setError("");
                if (!label.trim())
                  setLabel(file.name.replace(/\.html?$/i, "").slice(0, 60));
              } catch (e) {
                setError(publishingError(e));
              }
            }}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="published-source" className="text-sm font-medium">
            HTML code
          </label>
          <Textarea
            id="published-source"
            required
            value={source}
            maxLength={MAX_PUBLISHED_HTML_BYTES}
            spellCheck={false}
            className="h-80 overflow-auto font-mono text-sm"
            onChange={(e) => setSource(e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              if (window.confirm("Discard this editor's unsaved changes?"))
                close();
            }}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={!source.trim() || !label.trim()}>
            {busy ? "Saving…" : draft.id ? "Save changes" : "Publish"}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
