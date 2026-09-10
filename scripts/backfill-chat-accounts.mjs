#!/usr/bin/env node
// Run in the production build environment, where Clerk and Convex credentials already live.
// Preflight all accounts before writing anything. No names, emails or credentials in logs.
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL);
client.setAdminAuth(process.env.CONVEX_DEPLOY_KEY);
const accounts = [];
let cursor = null;
do {
  const page = await client.query(
    makeFunctionReference("accountSync:profilePage"),
    { paginationOpts: { cursor, numItems: 50 } },
  );
  for (const id of page.ids) {
    const response = await fetch(
      `https://api.clerk.com/v1/users/${encodeURIComponent(id)}`,
      { headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` } },
    );
    if (!response.ok)
      throw new Error(`Clerk lookup failed: ${response.status}`);
    const data = await response.json();
    if (data.id !== id || !data.username)
      throw new Error(
        "An existing chat account has no Clerk username; migration stopped before writes.",
      );
    accounts.push(data);
  }
  cursor = page.done ? null : page.cursor;
} while (cursor !== null);
console.log(`Chat account preflight passed: ${accounts.length} profiles.`);
if (!process.argv.includes("--dry-run")) {
  for (const data of accounts)
    await client.mutation(makeFunctionReference("users:upsertFromClerk"), {
      data,
    });
  console.log(`Chat account backfill complete: ${accounts.length} profiles.`);
}
