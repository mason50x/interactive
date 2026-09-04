import type { Metadata } from "next";
import { Hero } from "@/components/landing/hero";
import { Showcase } from "@/components/landing/showcase";

export const metadata: Metadata = {
  title: "The new way of learning",
  description: "Explore activities, find your people, and come back for more.",
};

export default function Home() {
  return (
    <>
      <Hero />
      <Showcase />
    </>
  );
}
