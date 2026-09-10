"use client";

import { useRef, useState, type ReactNode } from "react";
import { ArrowUpTrayIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Reveal } from "./reveal";
import styles from "./library.module.css";

/**
 * The two panels every simulator library is made of: the "bring your own"
 * card at the top and the "your progress" section under it. The Game Boy
 * and HTML libraries differ in what they accept and what they list, not in
 * how the page is laid out, so the layout lives here and each library fills
 * in its own copy and its own rows.
 */

/** The import card: an icon, a heading, a sentence, and the choose button.
 *  `actions` is for a second button beside it and `children` for anything
 *  the card unfolds underneath — the HTML library's paste editor. */
export function ImportPanel({
  heading,
  description,
  busy,
  choose,
  actions,
  children,
}: {
  heading: string;
  description: string;
  busy: boolean;
  choose: () => void;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className={cn(styles.uploadPanel, "rounded-2xl p-6 sm:p-8")}>
      <ArrowUpTrayIcon className="mb-5 size-7 text-muted-foreground" />
      <h2 className="text-lg font-semibold">{heading}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {description}
      </p>
      <div className="mt-6 flex gap-3">
        <Button variant="outline" onClick={choose} disabled={busy}>
          Choose file
        </Button>
        {actions}
      </div>
      {children}
    </section>
  );
}

/**
 * The HTML library's import card, which also takes code typed straight in.
 * The editor is folded away until asked for, and takes focus when it opens
 * so the next keystroke lands in it; `aria-controls` ties the toggle to the
 * region for anyone who cannot see it unfold.
 */
export function HtmlImportPanel({
  busy,
  choose,
  paste,
}: {
  busy: boolean;
  choose: () => void;
  paste: (code: string, label: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const editor = useRef<HTMLTextAreaElement>(null);
  return (
    <ImportPanel
      heading="Bring your own HTML"
      description="Drop a self-contained .html file here, choose one, or paste your code. Files and progress stay on this device."
      busy={busy}
      choose={choose}
      actions={
        <Button
          variant="ghost"
          disabled={busy}
          aria-expanded={expanded}
          aria-controls="html-code-editor"
          onClick={() => {
            setExpanded(!expanded);
            if (!expanded) requestAnimationFrame(() => editor.current?.focus());
          }}
        >
          {expanded ? "Close editor" : "Paste code"}
        </Button>
      }
    >
      <Reveal id="html-code-editor" open={expanded}>
        <form
          className="flex flex-col gap-3 pt-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (code.trim() && !busy) paste(code, label);
          }}
        >
          <label className="text-sm font-medium" htmlFor="html-label">
            Simulation name
          </label>
          <Input
            id="html-label"
            maxLength={60}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Untitled HTML"
          />
          <label className="text-sm font-medium" htmlFor="html-code">
            HTML code
          </label>
          <Textarea
            ref={editor}
            id="html-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            spellCheck={false}
            placeholder="<!doctype html>"
            className="h-64 overflow-y-auto rounded-xl p-4 font-mono"
          />
          <div className="flex justify-end">
            <Button type="submit" disabled={busy || !code.trim()}>
              Open HTML
            </Button>
          </div>
        </form>
      </Reveal>
    </ImportPanel>
  );
}

/** The "Your progress" heading with its search box and, before the box,
 *  whatever action the library puts up there — the clear-all button. */
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
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Find a simulation"
            aria-label="Find a simulation"
            className="max-w-64"
          />
        </div>
      </div>
      {children}
    </section>
  );
}
