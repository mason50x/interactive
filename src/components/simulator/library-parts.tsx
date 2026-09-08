"use client";
import { useRef, useState, type ReactNode } from "react";
import { ArrowUpTrayIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import styles from "./library.module.css";

export function ImportPanel({
  html = false,
  busy,
  choose,
  paste,
}: {
  html?: boolean;
  busy: boolean;
  choose: () => void;
  paste?: (code: string, label: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const editor = useRef<HTMLTextAreaElement>(null);
  return (
    <section className={`${styles.uploadPanel} rounded-2xl p-6 sm:p-8`}>
      <ArrowUpTrayIcon className="mb-5 size-7 text-muted-foreground" />
      <h2 className="text-lg font-semibold">
        Bring your own {html ? "HTML" : "file"}
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {html
          ? "Drop a self-contained .html file here, choose one, or paste your code. Files and progress stay on this device."
          : "Drop a .gb or .gbc file here, or choose one from your device."}
      </p>
      <div className="mt-6 flex gap-3">
        <Button variant="outline" onClick={choose} disabled={busy}>
          Choose file
        </Button>
        {html && (
          <Button
            variant="ghost"
            disabled={busy}
            aria-expanded={expanded}
            aria-controls="html-code-editor"
            onClick={() => {
              setExpanded(!expanded);
              if (!expanded)
                requestAnimationFrame(() => editor.current?.focus());
            }}
          >
            {expanded ? "Close editor" : "Paste code"}
          </Button>
        )}
      </div>
      {html && (
        <div
          className={styles.codeReveal}
          data-open={expanded}
          inert={!expanded}
        >
          <div className="min-h-0 overflow-hidden" id="html-code-editor">
            <form
              className="flex flex-col gap-3 pt-6"
              onSubmit={(e) => {
                e.preventDefault();
                if (code.trim() && !busy) paste?.(code, label);
              }}
            >
              <label className="text-sm font-medium" htmlFor="html-label">
                Simulation name
              </label>
              <input
                id="html-label"
                maxLength={60}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Untitled HTML"
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              />
              <label className="text-sm font-medium" htmlFor="html-code">
                HTML code
              </label>
              <textarea
                ref={editor}
                id="html-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                spellCheck={false}
                placeholder="<!doctype html>"
                className="h-64 w-full resize-none overflow-y-auto rounded-xl border border-border bg-background p-4 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              />
              <div className="flex justify-end">
                <Button type="submit" disabled={busy || !code.trim()}>
                  Open HTML
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

export function ProgressSection({
  search,
  setSearch,
  actions,
  children,
}: {
  search: string;
  setSearch: (value: string) => void;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">Your progress</h2>
        <div className="flex min-w-0 items-center gap-3">
          {actions}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a simulation"
            aria-label="Find a simulation"
            className="h-9 w-full max-w-64 rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>
      {children}
    </section>
  );
}
