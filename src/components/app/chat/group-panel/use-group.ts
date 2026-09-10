"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type {
  ConversationDetail,
  ConversationMember,
} from "@convex/chat/conversations";

/**
 * The two subscriptions a group panel is drawn from, and why they are two.
 *
 * Both are held only while a panel is open — see `GroupColumn` for the
 * mounting — which is what lets a list of ten groups be no subscriptions at
 * all until one of them is looked at.
 */

/**
 * The group's detail.
 *
 * Subscribed here rather than passed down from whatever opened the panel: the
 * two things that open it are a row in a list and a button in another pane, and
 * only one panel is ever open, so one query at the moment it is looked at costs
 * less than a query per row for panels nobody has opened. It is also the thing
 * that made the thread's copy unnecessary — see `GroupPanel`.
 */
export function useDetail(
  conversationId: Id<"conversations">,
): ConversationDetail | null {
  return useQuery(api.chat.conversations.get, { conversationId }) ?? null;
}

/**
 * The group's people, which are a second subscription rather than a field on
 * the first.
 *
 * They came off `conversations.get` because that query is also the thread
 * header's, and the header is open for as long as the conversation is. Every
 * membership row carries a reading position, so every person reading wrote one
 * on every message — and a header watching the whole member list was recomputed
 * by all of it. Here it is watched only while somebody is looking at the panel
 * that draws it. See `members` in `convex/chat/conversations.ts`.
 */
export function useMembers(
  conversationId: Id<"conversations">,
): ConversationMember[] | null {
  return useQuery(api.chat.conversations.members, { conversationId }) ?? null;
}
