import { auth } from "@clerk/nextjs/server";

/**
 * What fills the right-hand pane when nothing is open.
 *
 * Only ever seen at `md` and up: below that the conversation list takes the
 * whole width at this route and this page is not rendered at all. See
 * `ChatFrame`.
 */
export default async function ChatIndexPage() {
  await auth.protect();

  return (
    <div className="flex size-full items-center justify-center p-6">
      <p className="max-w-xs text-center text-[0.9375rem] leading-relaxed text-muted-foreground">
        Pick a conversation, or start one from People.
      </p>
    </div>
  );
}
