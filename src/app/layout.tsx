import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Inter } from "next/font/google";
import { brand } from "@/lib/brand";
import { consoleGreetingScript } from "@/lib/console-greeting";
import { preferencesScript } from "@/lib/preferences";
import { themeScript } from "@/lib/theme";
import "./globals.css";
import { cn } from "@/lib/utils";

// Inter is the brand typeface: the monogram is drawn from its letterforms, so
// the wordmark beside it has to be the same face for the lockup to hold.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const displaySerif = Instrument_Serif({
  variable: "--font-display-serif",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Lets every URL-based field below be written as a relative path.
  metadataBase: new URL(brand.url),
  title: {
    default: `${brand.name} — ${brand.tagline}`,
    template: `%s — ${brand.name}`,
  },
  description: brand.metaDescription,
  applicationName: brand.name,
  authors: [{ name: brand.name, url: brand.url }],
  creator: brand.name,
  publisher: brand.name,
  // No `keywords`, no `category`, and no `alternates.canonical`. All three
  // exist only to be read by a search engine, and this site is asking not to
  // be read by one — see `robots` below and `src/app/robots.ts`. A canonical
  // link on a page that must not be indexed is a contradiction anyway: it
  // nominates the URL to index.
  openGraph: {
    type: "website",
    siteName: brand.name,
    title: `${brand.name} — ${brand.tagline}`,
    description: brand.metaDescription,
    url: "/",
    locale: brand.locale,
  },
  twitter: {
    card: "summary_large_image",
    title: `${brand.name} — ${brand.tagline}`,
    description: brand.metaDescription,
  },
  /**
   * The whole site, not just the signed-in half.
   *
   * `/dashboard`, `/auth`, and `/learn` each already set this in their own
   * layout, and those stay: a nested `robots` overrides rather than merges,
   * so removing them would leave those trees inheriting this and nothing
   * else. What changed is that the default is now the same answer, so the
   * marketing page and the two legal pages are covered too.
   *
   * `index: false` is the only directive most crawlers need. The rest close
   * the doors that stay open after de-indexing: `noarchive` and `nocache`
   * stop a cached copy being served from a search result after the page is
   * gone from it, `nosnippet` stops the description being quoted, and
   * `noimageindex` keeps the OG image out of image search — that image is
   * still emitted, because a link preview in a chat is not a search result
   * and an invitation that unfurls as a bare URL is a worse invitation.
   */
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
    noimageindex: true,
    nocache: true,
    notranslate: true,
    googleBot: {
      index: false,
      follow: false,
      noarchive: true,
      nosnippet: true,
      noimageindex: true,
      "max-image-preview": "none",
      "max-snippet": 0,
      "max-video-preview": 0,
    },
  },
  appleWebApp: {
    capable: true,
    title: brand.shortName,
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false, address: false, email: false },
};

export const viewport: Viewport = {
  // No `themeColor` here on purpose. A static pair keyed to
  // `prefers-color-scheme` cannot follow a theme the user has overridden in
  // the app, so the tag is written by the theme script instead — see
  // `src/lib/theme.ts`. `colorScheme` stays as the pre-script default; the
  // script narrows it to the resolved theme.
  colorScheme: "light dark",
};

/**
 * The document shell, and nothing else.
 *
 * Fonts, the stylesheet, and the site-wide metadata belong to every route this
 * deployment serves — including `/learn`, the bare shell an activity is framed
 * in. Auth, Convex, and analytics deliberately do not: they live in
 * `AppProviders`, mounted by each of the app's own route trees, and the
 * `/learn` shell is kept clear of them on purpose — see
 * `src/app/learn/layout.tsx`.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "h-full scroll-smooth antialiased font-sans",
        inter.variable,
        displaySerif.variable,
      )}
    >
      <body className="flex min-h-full flex-col">
        {/* Before anything paints: reads the stored preference and puts the
            resolved theme on <html>. A component could not do this — the
            server has no storage to read, so React would paint light first
            and snap to dark on hydration. */}
        <script
          dangerouslySetInnerHTML={{ __html: themeScript }}
          suppressHydrationWarning
        />
        {/* And the accent and tab mask the account was last seen in, from the
            `localStorage` cache `PreferencesProvider` keeps. Same bind as the
            theme: the settings arrive over a Convex subscription that is still
            opening while the page is on screen, so without this every refresh
            starts in the default blue, under the app's own name in the tab
            strip. It sits here rather than in `AppProviders`, whose routes are
            the only ones this touches, because this is the one layout a
            client-side navigation never re-renders — a `<script>` React creates
            on the client is a tag that never runs. The script skips `/learn` on
            its own instead. */}
        <script
          dangerouslySetInnerHTML={{ __html: preferencesScript }}
          suppressHydrationWarning
        />
        {/* After the scripts racing the first paint, never before them; this
            one is not. Nothing else logs this early, so the greeting is still
            the first line in the console. */}
        <script
          dangerouslySetInnerHTML={{ __html: consoleGreetingScript }}
          suppressHydrationWarning
        />
        {children}
      </body>
    </html>
  );
}
