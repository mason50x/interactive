/**
 * The release notes, hardcoded.
 *
 * One post per release, newest first. This is what the rail's version chip
 * and the "What's new" sheet read: the chip shows the version and the
 * title, and the sheet shows the post. Releases ship with the code, so
 * their notes live in the code: shipping one is a new entry at the top of
 * this list in the same change, and the chip turns over on deploy with
 * nothing to publish and no table to keep tidy.
 *
 * Written for the person using the app, not the person who built it: what
 * is different for them, and nothing about how. `body` is paragraphs
 * separated by blank lines; a paragraph whose lines all start with `- ` is
 * a list.
 */
export type Release = {
  version: string;
  /** Minor updates inherit the previous release's read state. Defaults to important. */
  importance?: "important" | "minor";
  /** ISO date. */
  date: string;
  title: string;
  body: string;
};

export const releases: readonly Release[] = [
  {
    version: "1.2",
    importance: "important",
    date: "2026-09-22",
    title: "More ways to connect and create.",
    body: `A major update to Chat, new shared simulators, more to explore in Experience, and better tools for keeping everything running. Here’s what’s changed since v1.1.1.

- Chat now keeps each day’s conversation together. New messages arrive in the same thread, without a separate context view or a “return to latest” banner.
- A blue line marks where new messages begin, making it easier to pick up where you left off.
- Conversations mark themselves read as you catch up. The optional read and unread buttons no longer leave you stuck marking everything manually.
- Opening an older message takes you to its place in the conversation, including the correct day.
- Format messages with bold, italics, lists, and code using the new message editor.
- Edit your sent messages to fix a typo or clarify what you meant.
- Create polls, see the results, and change your vote.
- Unsent text drafts are saved for each conversation, including replies and poll drafts.
- Sending messages has clearer progress and recovery options when something goes wrong.
- Search past messages and open a result directly in its conversation.
- Favorite conversations and filter your inbox to show favorites or unread chats.
- Turn on optional browser notifications for new messages.
- Messages from the same person are grouped more neatly, with clearer message controls.
- Mentions in direct messages stay as ordinary text. In Everyone, only staff can use @everyone.

- Meet Wizard: the assistant has a new name, personality, and avatar. Mention @wizard to chat; @bot and @verity still work.
- Wizard no longer posts the automatic morning greeting in Everyone.
- Empty Wizard replies now get another attempt, with a readable message if the request still fails.
- Improved failure tracking makes recurring Wizard problems easier to investigate.

- A shared HTML simulator library is now available to everyone who is signed in.
- Open published simulators without importing a file yourself.
- Builders and CEOs can publish simulators, update their names and descriptions, and manage the shared collection.
- Publish a personal simulator without sharing your personal progress. Each player keeps their own progress on their device.
- Added BlackJack to the activity collection.
- Improved support for Entertainment videos whose Google Drive links need an additional access key.

- Added Xbox Cloud Gaming to Experience with its official logo and support for its catalog and Microsoft sign-in pages. Playing games still depends on your account, browser, and network.
- Improved how Experience handles sign-in cookies and popups across supported services.
- Fixed a startup problem that could stop Experience opening while an update was waiting.
- Fixed a compatibility issue that prevented the Xbox catalog from loading.
- Improved troubleshooting for service failures. Some TikTok playback and other service sign-in restrictions remain unresolved.

- Added the Builder role, with publishing access and higher daily allowances.
- Added the Head Moderator role and clearer staff permissions.
- Staff now have a refreshed admin workspace with a searchable account directory and controls that fit smaller screens.
- CEOs can manage account roles and reset daily allowances for an individual or everyone.
- Authorized staff can set temporary account timeouts, with a clear reason and end time shown to the affected person.
- Access hours are now enforced Monday–Friday, 7:35 a.m.–2:55 p.m. Central, with a clear message outside those hours.
- Saved appearance preferences apply more consistently across the site.
- Reduced unnecessary background animation work and made smaller loading, navigation, and reliability improvements throughout the app.`,
  },
  {
    version: "1.1.1",
    importance: "minor",
    date: "2026-09-17",
    title: "More to watch. Fewer hiccups.",
    body: `TikTok fixes, a full Entertainment gallery, and a round of improvements across the app.

- Improved TikTok compatibility in Experience, including support for additional European TikTok services. Some issues may still remain.
- The full Entertainment gallery is now available to everyone, with cover artwork and dedicated pages for watching.
- Find something to watch with title search, category filters, and featured or alphabetical sorting.
- Browse animation and anime with episode counts shown on gallery cards, then choose an episode directly from the player.
- Added a video setup guide for Entertainment, with captions and an explanation of the Google Drive sign-in and cookie settings used for playback.
- Entertainment remembers completed setup in your browser, with a fallback for the current session when preferences cannot be saved.
- Watching now uses a dark viewing theme, while keeping your saved appearance preference for the rest of the app.
- Entertainment playback includes controls to reload, return to the gallery, and enter fullscreen where supported.
- Refreshed the activity gallery with a shared card layout and consistent search, filtering, and sorting controls.
- Simplified the sidebar so it adapts to the available screen width, with updated navigation styling.
- Improved player controls on smaller screens so long titles take up less space.
- Cleaned up account-name formatting when saving and syncing profiles.
- Fixed the activity-request icon’s appearance in dark mode.`,
  },
  {
    version: "1.1",
    importance: "important",
    date: "2026-09-15",
    title: "More to explore.",
    body: `More to explore, easier ways to connect, and a fresh starting point. Here’s everything that changed since v1.0.1.

- Home has a new layout. The starting page now brings together game suggestions, recently opened games, a daily quote, and a preview of the community conversation.
- A greeting that fits your day. Home welcomes you by name and changes its greeting for the morning, afternoon, and evening.
- Discover something to play. A new Suggestions shelf puts games directly on Home, giving you somewhere to start without opening the full collection.
- Jump back into recent games. Switch to “Jump back in” to find games you recently opened.
- Browse games in a carousel. Home presents games in a scrollable shelf with large artwork and controls for moving through the selection.
- Suggestions reflect community activity. As games collect views, the Suggestions shelf uses their popularity to help decide what to show.
- A fresh quote each day. The new Quote of the Day card adds a little encouragement to Home and refreshes when the day changes.
- Catch up before opening Chat. Home previews recent messages from Everyone, with links that take you into the conversation.
- See when you joined. A new account card on Home displays your join date.
- A simpler Home experience. The old weather, streak, and activity-stat cards have been removed as part of the redesign.
- No more daily streak counter. Visiting the app no longer builds or maintains the old streak system.

- Popular games now follow actual views. The activity collection ranks games using views from the last seven days, with overall views helping break ties.
- See what people are opening. Activity cards now show recent view counts, with ranking labels for games that have views.
- Request an activity from the collection. A new “Request an activity” card gives you a direct way to suggest something you want added.
- Tell us why your suggestion belongs here. Requests include the activity’s name and your reason for wanting it, with room for a working link and extra details.
- Two activity requests per day. Each signed-in account can submit up to two requests daily, with the allowance resetting at midnight UTC.
- Clear feedback after submitting. The request form shows a confirmation when your suggestion is sent and explains when delivery cannot be confirmed.
- Activity browsing does less work up front. Changes to how the collection loads and displays reduce unnecessary work when opening a large catalogue.

- Experience has a new browser-style layout. Supported services now open inside a shared space with tabs and a toolbar.
- Keep several services open. Add tabs to move between different services without replacing everything you already have open.
- Switch tabs without restarting the page. Moving between Experience tabs keeps their pages loaded while your session remains active.
- Close tabs individually. Remove a tab when you are finished, and Experience takes you to another open tab.
- Always have somewhere to start. Closing your last tab opens a fresh start page.
- Meet the Interoogle start page. Experience now has a central starting point with recognizable service icons and a search box.
- Find a service by name. Filter the available services from the start page instead of scanning the whole collection.
- Return to the start page from the toolbar. The Home button brings you back to an existing start tab or opens one for you.
- Reload the service you are using. A dedicated reload button refreshes the current Experience tab.
- Use Experience in fullscreen. The browser controls include a fullscreen option where your browser supports it.
- Navigate Experience tabs with your keyboard. Arrow keys move between tabs, while Home and End jump to the first and last.
- More services to choose from. The Experience collection has expanded to include Netflix, Spotify, Apple Music, Gemini, and TikTok alongside YouTube.
- Updated service icons. The expanded collection includes recognizable icons to make services easier to spot in search and tabs.
- More daily Experience time for members. The member allowance increased from five minutes to thirty minutes per day.
- A separate allowance for staff. CEO and moderator accounts receive two hours of Experience time per day.
- A smaller, clearer time display. A circular indicator in the toolbar gives you quick access to your remaining daily time.
- Time pauses when the app’s browser tab is hidden. Experience stops counting active use while you are away from that tab.
- Experience tabs share one allowance. Opening several services inside Experience does not give each one a separate timer.
- Clearer messages when a service cannot open. Experience explains when a service is unavailable, when it is checking your time, and when your daily allowance has run out.
- More reliable service startup. Fixes address cases where an Experience page or popup could try to open before its connection was ready.
- Better handling of service popups. Compatibility work improves how supported sites open additional windows.

- Start a direct message without a friend request. You can now find another account and open a conversation immediately.
- Browse people directly in Chat. An account directory makes other members available alongside your existing conversations.
- Search for someone by name or username. The people list helps you find the person you want to message.
- Load more people as you browse. The directory can reveal additional accounts without putting everyone on screen at once.
- Chat now uses your main account identity. Your username, first name, and account picture appear in conversations.
- One place to manage your identity. Separate chat profiles and custom chat-profile uploads have been removed.
- Friend requests have been retired. The old friendship system is no longer required for direct messages or finding people.
- Blocking and message reporting have been removed. These controls are no longer part of Chat; automatic message checks and staff message deletion remain.
- Private conversations remain limited to their participants. Opening messaging to other accounts does not make direct messages publicly readable.
- Announcements have their own conversation. Official updates now have a dedicated place in Chat.
- Staff publish announcements. Members can read the announcement conversation, while posting is limited to staff.
- New announcements stand out in the sidebar. A red “NEW!” indicator helps distinguish official updates from ordinary unread messages.
- Staff roles are more clearly defined. CEO and moderator roles now determine staff access and allowances.
- Staff badge preferences stick. Fixes preserve the chosen badge state more reliably.

- Search reaches more of the app. The main search now includes Experience services, useful actions, and more destinations.
- Open an Experience service from search. Search for a service such as YouTube or Spotify and go straight to it.
- Reach the right simulator library faster. Search includes direct shortcuts to the Game Boy and HTML simulator libraries.
- Find activity requests through search. Searching for an activity request or suggestion can take you straight to the request form.
- Start a group from search. A “New group” result opens the group-creation flow.
- Find the people directory from search. Searches for people, members, or direct messages can take you into Chat.
- Find account help and information pages. About, Contact, Privacy Policy, and Terms of Service are now included among searchable destinations.
- Find tab disguise settings more easily. Search recognizes terms for changing the browser tab’s title and icon.
- Find your escape destination settings. Search can take you to the setting that controls where the panic shortcut sends you.
- Sign out through search. A dedicated result opens the sign-out confirmation.

- Shorter page addresses. Home, Activities, Chat, Experience, and Learning Simulator now use simpler addresses without the old dashboard prefix.
- Older dashboard links redirect. Existing links are directed toward their corresponding new locations.
- The invitation interface has been removed. Invitation cards, invite management, and the separate invitation-acceptance page are no longer part of the app.
- The sign-up page is simpler. The custom invitation messaging has been removed from the account-creation screen.
- The public website has been refreshed. Updates cover the opening section, feature descriptions, getting-started information, pricing presentation, and supporting sections.
- A clearer opening action. The public homepage now puts more emphasis on its main sign-up button.
- Updated About and Contact pages. Their wording and presentation have been adjusted alongside the broader website changes.
- Updated account and privacy explanations. The site’s policies now describe the revised chat identity and messaging behavior and remove references to retired features.
- The project’s source link is easier to reach. The open-source link has moved into the account area of the sidebar.
- Account menus display correctly above their window. A fix prevents selection menus from appearing behind the account panel.
- Simulator playback does less unnecessary work. Rendering and saved-preview changes reduce background work during play.
- Lighter sidebar animation. The animated background has been adjusted to reduce unnecessary work.
- A dedicated page for missing destinations. Invalid links now have an app-specific not-found page.`,
  },
  {
    version: "1.0.1",
    importance: "minor",
    date: "2026-09-13",
    title: "A smoother start.",
    body: `A few updates to keep things running smoothly.

What's in it:

- We've moved to Cloudflare, with a focus on performance and stronger security.
- Experience brings supported sites into the app through our proxy.
- Verity is now Bot, with a new avatar. Mention @bot to chat; @verity still works.
- Bot now kicks off the Everyone chat with a fresh, playful morning greeting every day at 7:30 a.m. Central.
- Unread indicators no longer flash when you send a message or while you're reading the live conversation.
- Security fixes strengthen access-hour enforcement, tighten protection around learning activities, and disable alternate public hosting URLs.`,
  },
  {
    version: "1.0",
    date: "2026-09-08",
    title: "Locked in?",
    body: `You've probably been using this for a few days now. We're working on making it an end-to-end product, and this is the first proper release.

What's in it:

- The bot says hi when you start a chat with it, and the plus button in the composer shows how many bot tags you have left today.
- Messaging is simpler. Direct messages are friends only, for everyone, and anyone can be found by their handle.
- The sidebar tells you when someone mentions you in a group, and unread rooms glint now and then so you notice without watching.
- The icons in the sidebar have small animations of their own.
- The security check has a new look: the letter fills with water while the constellation drifts behind it, then bursts apart as it lets you in.
- Pictures upload more reliably, and quoting a long message no longer stretches the chat.
- Release notes, right here. The version in the sidebar lights up when there is something new.`,
  },
];

export const currentRelease = releases[0];

/** Newest first. Consecutive minor updates share the preceding important release's key. */
export function releaseSeenVersion(history: readonly Release[]): string {
  const release =
    history.find((entry) => entry.importance !== "minor") ?? history.at(-1);
  if (!release) throw new Error("At least one release is required");
  return release.version;
}

/** How a version is written wherever it is shown: `v1.1`. */
export function versionLabel(version: string) {
  return `v${version}`;
}
