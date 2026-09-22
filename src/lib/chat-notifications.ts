/** Keep notification eligibility independent of browser permission prompts. */
export function shouldNotifyMessage({
  previous,
  current,
  accountId,
  unread,
  visibleConversation,
}: {
  previous: { id: string; at: number } | undefined;
  current: { id: string; at: number; authorId: string };
  accountId: string;
  unread: number;
  visibleConversation: boolean;
}): boolean {
  return (
    previous !== undefined &&
    current.id !== previous.id &&
    current.at > previous.at &&
    current.authorId !== accountId &&
    unread > 0 &&
    !visibleConversation
  );
}
