/** Keep the conversation list interactive while only the next thread loads. */
export default function ChatLoading() {
  return (
    <div
      data-slot="chat-loading"
      role="status"
      aria-label="Loading conversation"
      className="flex size-full flex-col"
    >
      <div
        aria-hidden
        className="flex items-center gap-3 border-b border-border px-5 py-4"
      >
        <div className="size-9 rounded-full bg-foreground/5" />
        <div className="h-3 w-28 rounded bg-foreground/5" />
      </div>
      <div
        aria-hidden
        className="flex flex-1 flex-col justify-end gap-3 p-5 motion-safe:animate-pulse"
      >
        <div className="h-10 w-2/5 rounded-2xl bg-foreground/5" />
        <div className="h-14 w-3/5 rounded-2xl bg-foreground/5" />
        <div className="h-10 w-1/2 self-end rounded-2xl bg-foreground/5" />
      </div>
      <div
        aria-hidden
        className="m-3 h-12 rounded-xl border border-border bg-foreground/[0.02]"
      />
    </div>
  );
}
