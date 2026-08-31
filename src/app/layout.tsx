import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Inter } from "next/font/google";
import { brand } from "@/lib/brand";
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
  keywords: [...brand.keywords],
  authors: [{ name: brand.name, url: brand.url }],
  creator: brand.name,
  publisher: brand.name,
  category: "education",
  alternates: { canonical: "/" },
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
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
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
 * deployment serves — including `/player`, which answers on its own hostname.
 * Auth, Convex, and analytics deliberately do not: they live in `AppProviders`,
 * mounted by each of the app's own route trees. See `src/lib/player.ts`.
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
        {children}
      </body>
    </html>
  );
}
