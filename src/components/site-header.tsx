"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bars2Icon } from "@heroicons/react/24/outline";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Wordmark } from "@/components/wordmark";
import { navigation } from "@/lib/content";
import { cn } from "@/lib/utils";

/**
 * The public site's header: the lockup, the section links, and the two ways
 * in. It floats over the page on a translucent ground and takes a hairline
 * once the page has scrolled under it, so at the top of the landing page the
 * hero reads as one surface and further down the header reads as chrome.
 *
 * A client component for two reasons only: the scroll flag, and the phone
 * menu, which is a sheet. Everything it renders is otherwise static.
 */
export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 8);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b transition-[border-color,background-color] duration-300",
        scrolled
          ? "border-border bg-background/80 backdrop-blur-md supports-backdrop-filter:bg-background/70"
          : "border-transparent bg-transparent",
      )}
    >
      <Container>
        <div className="flex h-16 items-center justify-between gap-6">
          <Link
            href="/"
            className="-ml-1 rounded-lg px-1 py-1 text-foreground"
            aria-label="Interactive Learning home"
          >
            <Wordmark className="text-[1.125rem]" />
          </Link>

          <nav
            aria-label="Primary"
            className="hidden items-center gap-1 md:flex"
          >
            {navigation.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="rounded-lg px-3 py-2 text-[0.9375rem] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            <ButtonLink href="/auth/sign-in" variant="ghost" size="md">
              Sign in
            </ButtonLink>
            <ButtonLink href="/auth/sign-up" size="md">
              Get started
            </ButtonLink>
          </div>

          <MobileMenu />
        </div>
      </Container>
    </header>
  );
}

function MobileMenu() {
  return (
    <Sheet>
      <SheetTrigger
        aria-label="Open menu"
        className="-mr-2 inline-flex size-10 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-muted md:hidden"
      >
        <Bars2Icon className="size-5" />
      </SheetTrigger>
      <SheetContent side="right" className="w-[min(100%-1.5rem,22rem)]">
        <div className="flex flex-col gap-1 p-4 pt-14">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SheetDescription className="sr-only">
            Site navigation
          </SheetDescription>
          {navigation.map((item) => (
            <SheetClose
              key={item.label}
              render={<Link href={item.href} />}
              className="rounded-lg px-3 py-3 text-[1.0625rem] font-medium text-foreground transition-colors hover:bg-muted"
            >
              {item.label}
            </SheetClose>
          ))}
          <SheetClose
            render={<Link href="/contact" />}
            className="rounded-lg px-3 py-3 text-[1.0625rem] font-medium text-foreground transition-colors hover:bg-muted"
          >
            Contact
          </SheetClose>
        </div>
        <div className="mt-auto flex flex-col gap-2 border-t border-border p-4">
          <ButtonLink href="/auth/sign-up" size="md" className="w-full">
            Get started
          </ButtonLink>
          <ButtonLink
            href="/auth/sign-in"
            variant="outline"
            size="md"
            className="w-full"
          >
            Sign in
          </ButtonLink>
        </div>
      </SheetContent>
    </Sheet>
  );
}
