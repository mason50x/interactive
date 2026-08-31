"use client";

import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import { Bars3Icon } from "@heroicons/react/24/outline";
import { XMarkIcon as XMarkIconSolid } from "@heroicons/react/24/solid";
import Link from "next/link";
import { useEffect, useState } from "react";
import { headerMenus, site, type HeaderMenu } from "@/lib/content";
import { useAuthPending } from "@/components/auth-button";
import { Spinner } from "@/components/ui/spinner";
import { Wordmark } from "@/components/wordmark";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";

/**
 * Panels are deliberately different widths. The navigation menu animates its
 * popup between them, so the size change is the morph you see when moving
 * from one trigger to the next.
 */
const panelWidth: Record<HeaderMenu["kind"], string> = {
  about: "w-[30rem]",
  capabilities: "w-[34rem]",
  steps: "w-[32rem]",
  pricing: "w-[36rem]",
  contact: "w-[30rem]",
};

/**
 * Panel bodies. These are read, not clicked — there is no link or control
 * inside any of them, so the whole panel is inert content.
 */
function MenuPanel({ menu }: { menu: HeaderMenu }) {
  switch (menu.kind) {
    case "about":
      return (
        <div className="p-5">
          <p className="text-[0.9375rem] leading-snug font-medium text-foreground">
            {menu.heading}
          </p>
          <p className="mt-2.5 text-[0.8125rem] leading-relaxed text-muted-foreground">
            {menu.body}
          </p>
          <dl className="mt-5 grid grid-cols-3 gap-4 border-t border-border pt-4">
            {menu.facts.map((fact) => (
              <div key={fact.label}>
                <dt className="text-[1.375rem] font-semibold text-foreground">
                  {fact.value}
                </dt>
                <dd className="mt-0.5 text-[0.75rem] leading-snug text-muted-foreground">
                  {fact.label}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      );

    case "capabilities":
      return (
        <div className="grid gap-x-6 gap-y-5 p-5 sm:grid-cols-2">
          {menu.items.map((item) => (
            <div key={item.title}>
              <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                />
                {item.title}
              </p>
              <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-muted-foreground">
                {item.body}
              </p>
            </div>
          ))}
        </div>
      );

    case "steps":
      return (
        <div className="grid gap-x-6 gap-y-5 p-5 sm:grid-cols-2">
          {menu.steps.map((step) => (
            <div key={step.number}>
              <p className="label-small text-primary">{step.number}</p>
              <p className="mt-2 text-sm font-medium text-foreground">
                {step.title}
              </p>
              <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted-foreground">
                {step.body}
              </p>
            </div>
          ))}
        </div>
      );

    case "pricing":
      return (
        <div className="p-5">
          <div className="grid gap-5 sm:grid-cols-3">
            {menu.plans.map((plan) => (
              <div key={plan.name}>
                <p className="label-small text-faint">{plan.name}</p>
                <p className="mt-2 flex items-baseline gap-1">
                  <span className="text-[1.75rem] font-semibold text-foreground">
                    {plan.price}
                  </span>
                  <span className="text-[0.75rem] text-muted-foreground">
                    {plan.cadence}
                  </span>
                </p>
                <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-muted-foreground">
                  {plan.note}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-5 border-t border-border pt-4 text-[0.75rem] text-faint">
            {menu.footnote}
          </p>
        </div>
      );

    case "contact":
      return (
        <div className="p-5">
          <div className="flex flex-col gap-4">
            {menu.details.map((detail) => (
              <div key={detail.label}>
                <p className="label-small text-faint">{detail.label}</p>
                <p className="mt-1.5 text-[0.8125rem] text-foreground">
                  {detail.value}
                </p>
                <p className="mt-0.5 text-[0.8125rem] text-muted-foreground">
                  {detail.note}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-5 border-t border-border pt-4 text-[0.75rem] text-faint">
            {menu.footnote}
          </p>
        </div>
      );
  }
}

export function SiteHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // One per trigger: the mobile sheet's "Sign in" is a separate button from the
  // bar's, and only the one actually clicked should spin.
  const signIn = useAuthPending();
  const signUp = useAuthPending();
  const mobileSignIn = useAuthPending();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Lock the page while the mobile sheet is open.
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "border-b border-border bg-background/85 backdrop-blur-xl"
          : "border-b border-transparent bg-background"
      }`}
    >
      <nav
        aria-label="Primary"
        className="mx-auto flex h-[4.5rem] w-full max-w-[1400px] items-center gap-8 px-6 lg:px-10"
      >
        <Link
          href="/"
          className="shrink-0"
          aria-label={`${site.name} home`}
          onClick={() => setMobileOpen(false)}
        >
          <Wordmark />
        </Link>

        <NavigationMenu align="center" className="ml-auto hidden lg:flex">
          <NavigationMenuList className="gap-0.5">
            {headerMenus.map((menu) => (
              <NavigationMenuItem key={menu.label}>
                <NavigationMenuTrigger className="rounded-full px-3.5 text-[0.9375rem] font-normal text-foreground/75 hover:bg-foreground/[0.05] hover:text-foreground data-popup-open:bg-foreground/[0.05] data-popup-open:text-foreground">
                  {menu.label}
                </NavigationMenuTrigger>

                <NavigationMenuContent className={panelWidth[menu.kind]}>
                  <MenuPanel menu={menu} />
                </NavigationMenuContent>
              </NavigationMenuItem>
            ))}
          </NavigationMenuList>
        </NavigationMenu>

        <div className="ml-auto flex items-center gap-2 lg:ml-6">
          <Show when="signed-in">
            <Link
              href="/dashboard"
              className="hidden rounded-full px-3 py-2 text-[0.9375rem] text-foreground/75 transition-colors hover:text-foreground sm:block"
            >
              Dashboard
            </Link>
            <UserButton />
          </Show>

          <Show when="signed-out">
            <SignInButton>
              <button
                aria-busy={signIn.pending}
                onClick={signIn.start}
                className="hidden cursor-pointer items-center gap-2 rounded-full px-3 py-2 text-[0.9375rem] text-foreground/75 transition-colors hover:text-foreground sm:inline-flex"
              >
                {signIn.pending && <Spinner aria-hidden className="size-3.5" />}
                Sign in
              </button>
            </SignInButton>
            <SignUpButton>
              <button
                aria-busy={signUp.pending}
                onClick={signUp.start}
                className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary-hover hover:shadow-[0_4px_14px_color-mix(in_oklab,var(--primary)_35%,transparent)]"
              >
                {signUp.pending && <Spinner aria-hidden className="size-3.5" />}
                Start Learning
              </button>
            </SignUpButton>
          </Show>

          <button
            type="button"
            aria-label="Toggle menu"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
            className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-foreground transition-colors hover:bg-foreground/[0.06] lg:hidden"
          >
            {/* Open is the button's selected state, so it takes the solid
                cut; closed stays outline. */}
            {mobileOpen ? (
              <XMarkIconSolid className="size-5" />
            ) : (
              <Bars3Icon className="size-5" />
            )}
          </button>
        </div>
      </nav>

      {/* Mobile: the same panels, stacked open rather than in a popup. */}
      <div
        className={`fixed inset-x-0 top-[4.5rem] bottom-0 z-40 overflow-y-auto overscroll-contain border-t border-border bg-background px-6 pt-2 pb-16 transition-all duration-300 lg:hidden ${
          mobileOpen
            ? "visible translate-y-0 opacity-100"
            : "invisible -translate-y-2 opacity-0"
        }`}
      >
        <ul className="flex flex-col divide-y divide-border">
          {headerMenus.map((menu) => (
            <li key={menu.label} className="py-4">
              <p className="label-small px-1 text-faint">{menu.label}</p>
              <div className="-mx-1 [&>div]:px-1">
                <MenuPanel menu={menu} />
              </div>
            </li>
          ))}
        </ul>

        <Show when="signed-out">
          <SignInButton>
            <button
              aria-busy={mobileSignIn.pending}
              onClick={mobileSignIn.start}
              className="mt-6 inline-flex cursor-pointer items-center gap-2 text-[0.9375rem] text-muted-foreground"
            >
              {mobileSignIn.pending && (
                <Spinner aria-hidden className="size-3.5" />
              )}
              Sign in
            </button>
          </SignInButton>
        </Show>
      </div>
    </header>
  );
}
