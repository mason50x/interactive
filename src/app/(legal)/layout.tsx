import { AppProviders } from "@/components/app-providers";

/**
 * The legal shell: the page, and nothing around it.
 *
 * It sits in its own route group rather than in `(site)` for one reason —
 * `(site)` owns the header and the footer, and these pages are meant to be
 * read rather than navigated away from. The commonest way in is the line
 * under the sign-up form, where a full site header offering five other
 * destinations is an invitation to abandon the thing you were doing.
 *
 * `AppProviders` still mounts, so a signed-in reader keeps their accent and
 * so these pages are counted like every other page on the app host. What it
 * must never do is mount on `/player`; see the note in that file.
 */
export default function LegalLayout({ children }: LayoutProps<"/">) {
  return <AppProviders>{children}</AppProviders>;
}
