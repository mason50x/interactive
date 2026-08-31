/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agreement from "../agreement.js";
import type * as chat_blocks from "../chat/blocks.js";
import type * as chat_conversations from "../chat/conversations.js";
import type * as chat_friends from "../chat/friends.js";
import type * as chat_groups from "../chat/groups.js";
import type * as chat_messages from "../chat/messages.js";
import type * as chat_profiles from "../chat/profiles.js";
import type * as chat_reports from "../chat/reports.js";
import type * as chat_shared from "../chat/shared.js";
import type * as chat_sweep from "../chat/sweep.js";
import type * as crons from "../crons.js";
import type * as days from "../days.js";
import type * as http from "../http.js";
import type * as invites from "../invites.js";
import type * as moderation_confusables from "../moderation/confusables.js";
import type * as moderation_inspect from "../moderation/inspect.js";
import type * as moderation_lexicon from "../moderation/lexicon.js";
import type * as moderation_limits from "../moderation/limits.js";
import type * as moderation_normalize from "../moderation/normalize.js";
import type * as moderation_patterns from "../moderation/patterns.js";
import type * as moderation_rules from "../moderation/rules.js";
import type * as moderation_standing from "../moderation/standing.js";
import type * as moderation_verdict from "../moderation/verdict.js";
import type * as preferences from "../preferences.js";
import type * as streaks from "../streaks.js";
import type * as users from "../users.js";
import type * as views from "../views.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agreement: typeof agreement;
  "chat/blocks": typeof chat_blocks;
  "chat/conversations": typeof chat_conversations;
  "chat/friends": typeof chat_friends;
  "chat/groups": typeof chat_groups;
  "chat/messages": typeof chat_messages;
  "chat/profiles": typeof chat_profiles;
  "chat/reports": typeof chat_reports;
  "chat/shared": typeof chat_shared;
  "chat/sweep": typeof chat_sweep;
  crons: typeof crons;
  days: typeof days;
  http: typeof http;
  invites: typeof invites;
  "moderation/confusables": typeof moderation_confusables;
  "moderation/inspect": typeof moderation_inspect;
  "moderation/lexicon": typeof moderation_lexicon;
  "moderation/limits": typeof moderation_limits;
  "moderation/normalize": typeof moderation_normalize;
  "moderation/patterns": typeof moderation_patterns;
  "moderation/rules": typeof moderation_rules;
  "moderation/standing": typeof moderation_standing;
  "moderation/verdict": typeof moderation_verdict;
  preferences: typeof preferences;
  streaks: typeof streaks;
  users: typeof users;
  views: typeof views;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
