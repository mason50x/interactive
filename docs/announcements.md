# Site announcement

One notice for the whole site, on or off for everyone at once. It lives on
the **Announcement** tab of `/admin`, which CEOs and Head Moderators both
see. There is no per-account version: the old per-account restrictions and
their imitation browser error pages are gone.

## What members see

- **Full screen**: the announcement takes the place of the app, drawn in the
  app's own design (`AnnouncementScreen`), with a sign-out button. While it
  is live every public Convex function refuses a member, so the screen is the
  server's and not an overlay a client could delete. Good for maintenance.
- **Card over the app**: a dismissible card at the top of the app
  (`AnnouncementCard`). Nothing is refused. Good for news. Dismissing it is
  per version and per page load: an edit, or a reload, brings it back.

## Safeguards

- Only CEOs and Head Moderators can read or write it
  (`requireAnnouncementManager` in `convex/roles.ts`), and not while timed
  out.
- Turning it on opens a confirmation under the switch that says who will see
  what. A heading is required before it can go live. Unsaved edits go live
  with it, so nobody is shown the old text for a beat.
- Turning it off is one click, with no confirmation: it is the safe
  direction. While a full-screen announcement is live, every manager sees a
  card over the app with a **Turn off** button, wherever they are.
- Managers are exempt from the lockout on the server and the client, so an
  announcement can never shut out the people who lift it.
- The row records who last changed it and who turned it on, and when; the
  status card shows both.

## Where it lives

- `convex/schema.ts`: the single-row `siteAnnouncement` table.
- `convex/announcement.ts`: `mine` (raw query, what the caller should see),
  `get`, `save` and `turnOff`.
- `convex/announcementLock.ts` and `convex/functions.ts`: the lockout every
  public function applies.
- `src/components/announcement-gate.tsx`: swaps the app for the screen, or
  floats the card. `src/app/learn/[slug]/page.tsx` makes the same check on
  the server for the framed activity page.
- `src/components/app/admin/announcement-config.tsx`: the admin tab.
- `scripts/tests/announcement.test.ts`.

The retired `accountRestrictions` table stays declared in the schema until it
is empty in every deployment; see the note beside it.
