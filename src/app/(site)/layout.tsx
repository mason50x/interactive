import { AppProviders } from "@/components/app-providers";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { brand } from "@/lib/brand";

/** Tells search engines what this site is, in the vocabulary they read. */
const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "EducationalOrganization",
  name: brand.name,
  url: brand.url,
  logo: `${brand.url}/brand/logo-tile.svg`,
  description: brand.description,
  slogan: brand.tagline,
};

/**
 * The marketing/app chrome. It lives in a route group rather than in the root
 * layout so `/auth` can opt out of the header and footer entirely and render
 * its own full-bleed split screen.
 */
export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <AppProviders>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
      />
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </AppProviders>
  );
}
