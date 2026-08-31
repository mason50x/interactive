import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { ChatFrame } from "@/components/app/chat/chat-frame";

export const metadata: Metadata = {
  title: { default: "Chat", template: "%s — Chat" },
};

/**
 * The shell every chat route sits in.
 *
 * There is no agreement check here, and that is the second version of this
 * file. The first one called `hasAgreed()` on the server, which is where the
 * activity routes make the same check — but an activity route is handing out a
 * URL, so the server is the side that has to decide. Chat hands out nothing:
 * the browser talks to Convex directly, so a check in Next protects nothing and
 * a check in a *server component* cannot even redraw when the acceptance lands.
 *
 * So the gate moved to both ends of where it belongs. `ChatFrame` draws it from
 * the live subscription, and `chat.messages.send` and `chat.profiles.claimHandle`
 * enforce it where it cannot be talked around.
 *
 * Each page still calls `auth.protect()` for itself, per the rule in
 * `src/app/dashboard/page.tsx`: the router does not re-render a shared layout
 * between sibling navigations, so a check that lives only here is a floor.
 */
export default async function ChatLayout({
  children,
}: LayoutProps<"/dashboard/chat">) {
  await auth.protect();
  return <ChatFrame>{children}</ChatFrame>;
}
