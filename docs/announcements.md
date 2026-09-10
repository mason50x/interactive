# Announcements

In the Convex dashboard, add a document to `announcements`:

```json
{
  "title": "Welcome to the updates board",
  "body": "Put your announcement here.\nLine breaks are supported.",
  "status": "published"
}
```

Use `draft` while writing, `published` to show it, and `archived` to hide it.
Only the newest three documents are retained (including drafts and archived posts).
The sidebar shows published posts within those three, newest created first.
Older documents and their read records are automatically deleted within about a minute.
Creating a fourth document permanently removes the oldest; editing does not change order.
Content is plain text. No code change or redeploy is needed to publish a post.

`announcementReads` is managed by the app. It stores the signed-in user's Clerk
ID, the announcement ID, and the time they clicked **Mark as read**. Read posts
remain available, but no longer count as new. Editing an existing post preserves
its read state; create a new document when an update should be new to everyone.
