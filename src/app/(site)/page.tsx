import type { Metadata } from "next";
import { ClosingCta } from "@/components/landing/closing-cta";
import { Educators } from "@/components/landing/educators";
import { Faq } from "@/components/landing/faq";
import { Features } from "@/components/landing/features";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Practice } from "@/components/landing/practice";
import { Pricing } from "@/components/landing/pricing";
import { Stats } from "@/components/landing/stats";
import { Testimonials } from "@/components/landing/testimonials";
import { TrustStrip } from "@/components/landing/trust-strip";
import { brand } from "@/lib/brand";

export const metadata: Metadata = {
  title: `${brand.name} — ${brand.tagline}`,
  description: brand.metaDescription,
};

export default function Home() {
  return (
    <>
      <Hero />
      <TrustStrip />
      <Features />
      <HowItWorks />
      <Practice />
      <Educators />
      <Stats />
      <Testimonials />
      <Pricing />
      <Faq />
      <ClosingCta />
    </>
  );
}
