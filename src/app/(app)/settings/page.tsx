import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { SETTINGS_DEFAULT_SECTION } from "@/components/app/settings/sections";
import { SETTINGS_HREF } from "@/lib/nav";

/** `/settings` on its own opens the first tab. */
export default async function Settings() {
  await auth.protect();
  redirect(`${SETTINGS_HREF}/${SETTINGS_DEFAULT_SECTION}`);
}
