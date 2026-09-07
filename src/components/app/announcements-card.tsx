"use client";

import { ChevronDownIcon, MegaphoneIcon } from "@heroicons/react/24/solid";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export function AnnouncementsCard() {
  const { isAuthenticated } = useConvexAuth();
  const posts = useQuery(api.announcements.list, isAuthenticated ? {} : "skip");
  const markRead = useMutation(api.announcements.markRead);
  const [open, setOpen] = useState(false);
  const [readOpen, setReadOpen] = useState(false);
  const readPanelId = useId();
  const readTrigger = useRef<HTMLButtonElement>(null);
  const [panel, setPanel] = useState<HTMLDivElement | null>(null);
  const [height, setHeight] = useState(0);
  const [saving, setSaving] = useState<Id<"announcements"> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const unreadPosts = posts?.filter(post => !post.read) ?? [];
  const readPosts = posts?.filter(post => post.read) ?? [];
  const unread = unreadPosts.length;

  useEffect(() => {
    if (!panel) return;
    const observer = new ResizeObserver(() => setHeight(panel.offsetHeight));
    observer.observe(panel);
    return () => observer.disconnect();
  }, [panel]);

  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  async function acknowledge(announcementId: Id<"announcements">) {
    setSaving(announcementId);
    setError(null);
    try {
      await markRead({ announcementId });
      readTrigger.current?.focus();
    }
    catch { setError("That did not save. Try again."); }
    finally { setSaving(null); }
  }

  function toggle(event: React.MouseEvent<HTMLButtonElement>) {
    trigger.current = event.currentTarget;
    setOpen(value => !value);
  }

  return (
    <div ref={root} className="relative shrink-0 pb-1 pl-3">
      <button type="button" onClick={toggle} aria-expanded={open} aria-controls={panelId}
        aria-label={`Announcements${unread ? `, ${unread} unread` : ""}`}
        className="rail-narrow relative flex h-11 w-full cursor-pointer items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-foreground/[0.05] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset wide:hidden">
        <MegaphoneIcon className="size-5" />
        {unread > 0 && <span className="absolute top-2.5 right-3.5 size-2 rounded-full bg-primary" />}
      </button>
      <Card className={cn(
        "relative",
        unread > 0 && "announcement-unread-glow",
        "overflow-hidden rounded-xl transition-[width,box-shadow,opacity,visibility] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
        open ? "z-30 shadow-lg shadow-black/[0.08] wide:relative wide:w-[21rem]" : "wide:w-[14.25rem]",
        "narrow:absolute narrow:bottom-full narrow:left-3 narrow:mb-1 narrow:w-72 narrow:shadow-lg",
        !open && "narrow:invisible narrow:opacity-0", "wide:delay-[0s,0s,150ms,150ms]", !open && "collapsed:duration-0",
      )}>
        <button type="button" onClick={toggle} aria-expanded={open} aria-controls={panelId}
          className="w-full cursor-pointer px-3 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset">
          <div className="flex items-center gap-2">
            <MegaphoneIcon className="size-4 shrink-0 text-primary" />
            <span className="flex-1 text-[0.875rem] font-medium text-foreground">Announcements</span>
            <ChevronDownIcon className={cn("size-4 shrink-0 text-faint transition-transform duration-300", open && "rotate-180")} />
          </div>
          <p className={cn("mt-2 text-[0.75rem]", unread > 0 ? "text-primary" : "text-muted-foreground")}>
            {posts ? (unread > 0 ? `${unread} new` : "All caught up!") : "Loading…"}
          </p>
        </button>
        <div id={panelId} inert={!open} style={{ height: open ? height : 0 }}
          className="overflow-hidden transition-[height] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none">
          {/* Lay out at the final width so text does not rewrap as the card opens. */}
          <div ref={setPanel} className={cn("w-[calc(18rem-2px)] wide:w-[calc(21rem-2px)] max-h-[min(24rem,45dvh)] overflow-y-auto [scrollbar-gutter:stable] border-t border-border px-3 py-3 transition-opacity duration-200", open ? "opacity-100 delay-150" : "opacity-0")}>
            {!posts || !posts.length ? <p className="text-[0.8125rem] text-muted-foreground">{posts ? "No announcements yet. Check back soon." : "Loading announcements…"}</p> : (
              <div className="flex flex-col gap-4">
                {unreadPosts.map(post => (
                  <article key={post._id} className="border-b border-border pb-3 last:border-0 last:pb-0">
                    <h3 className="break-words text-[0.875rem] font-bold text-foreground/80 dark:text-white">{post.title}</h3>
                    <p className="mt-1.5 whitespace-pre-wrap break-words text-[0.8125rem] leading-relaxed text-muted-foreground">{post.body}</p>
                    {(
                      <Button size="sm" variant="outline" className="mt-2" disabled={saving !== null} onClick={() => acknowledge(post._id)}>
                        {saving === post._id ? "Saving…" : "Mark as read"}
                      </Button>
                    )}
                  </article>
                ))}
                {readPosts.length > 0 && (
                  <div>
                    <button ref={readTrigger} type="button" onClick={() => setReadOpen(value => !value)}
                      aria-expanded={readOpen} aria-controls={readPanelId}
                      className="flex w-full cursor-pointer items-center gap-1.5 rounded-md py-1 text-left text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
                      <ChevronDownIcon className={cn("size-3 transition-transform duration-300 motion-reduce:transition-none", readOpen && "rotate-180")} />
                      <span>Read</span>
                      <span className="text-faint">{readPosts.length}</span>
                    </button>
                    <div id={readPanelId} inert={!readOpen}
                      className={cn("grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none", readOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
                      <div className="min-h-0 overflow-hidden">
                        <div className="flex flex-col gap-3 pt-2">
                          {readPosts.map(post => (
                            <article key={post._id} className="border-b border-border pb-3 last:border-0 last:pb-0">
                              <h3 className="break-words text-[0.8125rem] font-bold text-foreground/80 dark:text-white">{post.title}</h3>
                              <p className="mt-1.5 whitespace-pre-wrap break-words text-[0.8125rem] leading-relaxed text-muted-foreground">{post.body}</p>
                            </article>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            {error && <p role="status" className="mt-2 text-[0.8125rem] text-destructive">{error}</p>}
          </div>
        </div>
      </Card>
    </div>
  );
}
