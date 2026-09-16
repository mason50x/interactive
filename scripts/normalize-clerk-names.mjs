#!/usr/bin/env node
// Run with --env-file=.env.local. Defaults to a read-only preflight; --apply writes.
import { createClerkClient } from "@clerk/backend";
import { normalizePersonName } from "../src/lib/person-name.ts";
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
const accounts = [];
for (let offset = 0; ; offset += 100) {
  const { data } = await clerk.users.getUserList({
    limit: 100,
    offset,
    orderBy: "+created_at",
  });
  accounts.push(...data);
  if (data.length < 100) break;
}
const changes = accounts.flatMap((user) => {
  const patch = {};
  for (const key of ["firstName", "lastName"]) {
    const value = normalizePersonName(user[key]);
    if (value && value !== user[key]) patch[key] = value;
  }
  return Object.keys(patch).length ? [{ id: user.id, patch }] : [];
});
console.log(
  `Checked ${accounts.length} Clerk accounts; ${changes.length} need capitalization updates.`,
);
if (process.argv.includes("--apply")) {
  let updated = 0;
  for (const { id, patch } of changes) {
    const user = await clerk.users.updateUser(id, patch);
    for (const [key, value] of Object.entries(patch)) {
      if (user[key] !== value)
        throw new Error("Clerk name verification failed");
    }
    updated++;
  }
  console.log(`Updated and verified ${updated} Clerk accounts.`);
}
