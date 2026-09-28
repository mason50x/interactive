import { protectPage } from "@/lib/session";
import { redirect } from "next/navigation";

import { SETTINGS_DEFAULT_HREF } from "@/lib/nav";

/** `/settings` on its own opens the first tab. */
export default async function Settings() {
  await protectPage();
  redirect(SETTINGS_DEFAULT_HREF);
}
