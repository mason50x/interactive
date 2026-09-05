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
import type * as chat_attachments from "../chat/attachments.js";
import type * as chat_blocks from "../chat/blocks.js";
import type * as chat_bot from "../chat/bot.js";
import type * as chat_botConfig from "../chat/botConfig.js";
import type * as chat_conversations from "../chat/conversations.js";
import type * as chat_erase from "../chat/erase.js";
import type * as chat_friends from "../chat/friends.js";
import type * as chat_groups from "../chat/groups.js";
import type * as chat_messages from "../chat/messages.js";
import type * as chat_presence from "../chat/presence.js";
import type * as chat_profiles from "../chat/profiles.js";
import type * as chat_reports from "../chat/reports.js";
import type * as chat_shared from "../chat/shared.js";
import type * as chat_sweep from "../chat/sweep.js";
import type * as chat_typing from "../chat/typing.js";
import type * as crons from "../crons.js";
import type * as days from "../days.js";
import type * as features from "../features.js";
import type * as http from "../http.js";
import type * as invites from "../invites.js";
import type * as moderation_confusables from "../moderation/confusables.js";
import type * as moderation_images from "../moderation/images.js";
import type * as moderation_inspect from "../moderation/inspect.js";
import type * as moderation_lexicon from "../moderation/lexicon.js";
import type * as moderation_limits from "../moderation/limits.js";
import type * as moderation_mentions from "../moderation/mentions.js";
import type * as moderation_normalize from "../moderation/normalize.js";
import type * as moderation_patterns from "../moderation/patterns.js";
import type * as moderation_rate from "../moderation/rate.js";
import type * as moderation_rules from "../moderation/rules.js";
import type * as moderation_verdict from "../moderation/verdict.js";
import type * as preferences from "../preferences.js";
import type * as simulator_cleanup from "../simulator/cleanup.js";
import type * as simulator_library from "../simulator/library.js";
import type * as simulator_limits from "../simulator/limits.js";
import type * as simulator_model from "../simulator/model.js";
import type * as simulator_saves from "../simulator/saves.js";
import type * as simulator_shared from "../simulator/shared.js";
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
  "chat/attachments": typeof chat_attachments;
  "chat/blocks": typeof chat_blocks;
  "chat/bot": typeof chat_bot;
  "chat/botConfig": typeof chat_botConfig;
  "chat/conversations": typeof chat_conversations;
  "chat/erase": typeof chat_erase;
  "chat/friends": typeof chat_friends;
  "chat/groups": typeof chat_groups;
  "chat/messages": typeof chat_messages;
  "chat/presence": typeof chat_presence;
  "chat/profiles": typeof chat_profiles;
  "chat/reports": typeof chat_reports;
  "chat/shared": typeof chat_shared;
  "chat/sweep": typeof chat_sweep;
  "chat/typing": typeof chat_typing;
  crons: typeof crons;
  days: typeof days;
  features: typeof features;
  http: typeof http;
  invites: typeof invites;
  "moderation/confusables": typeof moderation_confusables;
  "moderation/images": typeof moderation_images;
  "moderation/inspect": typeof moderation_inspect;
  "moderation/lexicon": typeof moderation_lexicon;
  "moderation/limits": typeof moderation_limits;
  "moderation/mentions": typeof moderation_mentions;
  "moderation/normalize": typeof moderation_normalize;
  "moderation/patterns": typeof moderation_patterns;
  "moderation/rate": typeof moderation_rate;
  "moderation/rules": typeof moderation_rules;
  "moderation/verdict": typeof moderation_verdict;
  preferences: typeof preferences;
  "simulator/cleanup": typeof simulator_cleanup;
  "simulator/library": typeof simulator_library;
  "simulator/limits": typeof simulator_limits;
  "simulator/model": typeof simulator_model;
  "simulator/saves": typeof simulator_saves;
  "simulator/shared": typeof simulator_shared;
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

export declare const components: {
  agent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"agent">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
