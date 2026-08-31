import { auth } from "@clerk/nextjs/server";
import { EmptyPane } from "@/components/app/chat/empty-pane";

/**
 * What fills the right-hand pane when nothing is open — which, at `md` and up,
 * is the room. The pane itself explains why; see `EmptyPane`.
 *
 * Only ever seen at `md` and up: below that the conversation list takes the
 * whole width at this route and this page is not rendered at all. See
 * `ChatFrame`.
 */
export default async function ChatIndexPage() {
  await auth.protect();

  return <EmptyPane />;
}
