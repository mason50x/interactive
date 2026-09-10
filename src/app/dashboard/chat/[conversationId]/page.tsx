import { auth } from "@clerk/nextjs/server";
import { Thread } from "@/components/app/chat/thread";
import type { Id } from "@convex/_generated/dataModel";

/**
 * One conversation.
 *
 * The id is taken from the URL and handed straight to the query without being
 * checked here, which is deliberate: a Convex id is guessable enough that
 * validating its shape proves nothing, and the only check worth making is
 * whether the caller is a member — which is a question only the server can
 * answer, and which `messages.list` and `conversations.get` both ask. A
 * fabricated id gets an empty conversation and a refusal, which is what it
 * should get.
 */
export default async function ConversationPage({
  params,
}: PageProps<"/dashboard/chat/[conversationId]">) {
  await auth.protect();
  const { conversationId } = await params;

  return <Thread conversationId={conversationId as Id<"conversations">} />;
}
