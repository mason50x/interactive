"use client";

import { useState } from "react";
import { useConvex, useMutation } from "convex/react";
import { CodeBracketSquareIcon } from "@heroicons/react/24/solid";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAuthedQuery } from "@/lib/use-authed-query";
import { downloadPublishedHtml } from "@/lib/simulator/published-html";
import { CatalogueCard } from "@/components/app/catalogue-card";
import { CatalogueGrid } from "@/components/app/activities/activity-grid";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import {
  PublishedHtmlEditor,
  publishingError,
  type PublishedDraft,
} from "./published-html-editor";

export function PublishedHtmlLibrary({
  canManage,
  draft,
  setDraft,
}: {
  canManage: boolean;
  draft: PublishedDraft | null;
  setDraft: (draft: PublishedDraft | null) => void;
}) {
  const entries = useAuthedQuery(api.simulator.published.list, {});
  const convex = useConvex();
  const remove = useMutation(api.simulator.published.remove);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function edit(id: Id<"publishedHtmlSimulators">) {
    setBusy(true);
    setError("");
    try {
      const entry = await convex.query(api.simulator.published.get, { id });
      if (!entry) throw new Error("This simulation was removed.");
      const program = await downloadPublishedHtml(entry);
      setDraft({
        id,
        expectedRevision: entry.revision,
        label: entry.label,
        description: entry.description,
        source: new TextDecoder().decode(program.bytes),
      });
    } catch (e) {
      setError(publishingError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-labelledby="published-html-heading" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 id="published-html-heading" className="text-xl font-semibold">
            Published simulations
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Ready to play. Your progress stays private on this device.
          </p>
        </div>
        {canManage && (
          <Button
            disabled={busy || !!draft}
            onClick={() =>
              setDraft({
                label: "",
                description: "",
                source:
                  '<!doctype html>\n<html lang="en">\n<head><meta charset="utf-8"><title>My simulation</title></head>\n<body>\n<h1>My simulation</h1>\n</body>\n</html>',
              })
            }
          >
            Publish HTML
          </Button>
        )}
      </div>
      {error && <Alert>{error}</Alert>}
      {canManage && draft && (
        <PublishedHtmlEditor draft={draft} close={() => setDraft(null)} />
      )}
      {entries === undefined ? (
        <p className="text-sm text-muted-foreground">
          Loading published simulations…
        </p>
      ) : !entries.length ? (
        <p className="rounded-xl border border-border p-8 text-sm text-muted-foreground">
          No published simulations yet.
        </p>
      ) : (
        <CatalogueGrid
          shown={entries.map((entry) => ({ ...entry, slug: entry._id }))}
          renderCard={(entry) => (
            <div className="space-y-2">
              <CatalogueCard
                title={entry.label}
                href={`/learning-simulator/published/${entry._id}`}
                thumbnail=""
                category="HTML simulation"
                hueColor="#22d3ee"
                icon={CodeBracketSquareIcon}
                note={entry.description || "Open simulation"}
              />
              {canManage && (
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    disabled={busy || !!draft}
                    onClick={() => void edit(entry._id)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busy || !!draft}
                    onClick={async () => {
                      if (
                        !window.confirm(
                          `Remove “${entry.label}” from the published library? Personal copies are not affected.`,
                        )
                      )
                        return;
                      setBusy(true);
                      setError("");
                      try {
                        await remove({
                          id: entry._id,
                          expectedRevision: entry.revision,
                        });
                      } catch (e) {
                        setError(publishingError(e));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Remove
                  </Button>
                </div>
              )}
            </div>
          )}
        />
      )}
    </section>
  );
}
