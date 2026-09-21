import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { ChatFrame } from "@/components/app/chat/chat-frame";

export const metadata: Metadata = {
  title: "Chat",
};

/**
 * The shell every chat route sits in.
 *
 * Each page still calls `auth.protect()` for itself, per the rule in
 * `src/app/(app)/activities/page.tsx`: the router does not re-render a shared layout
 * between sibling navigations, so a check that lives only here is a floor.
 */
export default async function ChatLayout({ children }: LayoutProps<"/chat">) {
  await auth.protect();
  return <ChatFrame>{children}</ChatFrame>;
}
