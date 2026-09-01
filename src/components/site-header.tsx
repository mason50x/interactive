"use client";

import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import { Bars3Icon } from "@heroicons/react/24/outline";
import {
  ChevronDownIcon,
  XMarkIcon as XMarkIconSolid,
} from "@heroicons/react/24/solid";
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
                {/* The addresses are long enough to outrun a 320px column, and
                    an email is one unbreakable token — so say where it may
                    break rather than let it push the page sideways. */}
                <p className="mt-1.5 text-[0.8125rem] break-words text-foreground">
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

/**
 * The one breakpoint the desktop navigation menu appears at, as `matchMedia`
 * wants it. `xl` in Tailwind's default scale, and not `lg`, for two reasons.
 *
 * It does not fit at `lg`. Five triggers, the wordmark, a text link and a pill
 * want 1101px between them, and `lg` starts at 1024 — the bar overflowed its
 * own row and gave the whole page a sideways scroll at exactly the width an
 * iPad in landscape reports.
 *
 * And it should not be there anyway. The panels open on hover, which is not a
 * gesture a tablet has; the sheet's accordion is the same content behind a
 * gesture that exists. So the two facts point the same way.
 */
const DESKTOP = "(min-width: 80rem)";

export function SiteHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  /** Which sheet section is expanded, by label. One at a time, which is the
   *  same thing the desktop popup does — it just does it on hover. */
  const [openSection, setOpenSection] = useState<string | null>(null);

  // One per trigger: the mobile sheet's buttons are separate from the bar's,
  // and only the one actually clicked should spin.
  const signIn = useAuthPending();
  const signUp = useAuthPending();
  const mobileSignIn = useAuthPending();
  const mobileSignUp = useAuthPending();

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

  // The sheet is `xl:hidden`, so widening past that point hides it without
  // closing it — and the scroll lock above would outlive the thing that set
  // it. A phone rotated into landscape is the ordinary way to hit this.
  useEffect(() => {
    if (!mobileOpen) return;
    const desktop = window.matchMedia(DESKTOP);
    const close = () => {
      if (desktop.matches) setMobileOpen(false);
    };
    close();
    desktop.addEventListener("change", close);
    return () => desktop.removeEventListener("change", close);
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
        className="mx-auto flex h-[4.5rem] w-full max-w-[1400px] items-center gap-4 px-6 sm:gap-8 lg:px-10"
      >
        <Link
          href="/"
          className="shrink-0"
          aria-label={`${site.name} home`}
          onClick={() => setMobileOpen(false)}
        >
          <Wordmark />
        </Link>

        <NavigationMenu align="center" className="ml-auto hidden xl:flex">
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

        <div className="ml-auto flex items-center gap-2 xl:ml-6">
          <Show when="signed-in">
            <Link
              href="/dashboard"
              className="hidden rounded-full px-3 py-2 text-[0.9375rem] text-foreground/75 transition-colors hover:text-foreground sm:block"
            >
              Dashboard
            </Link>
            <UserButton />
          </Show>

          {/* Both of these are `sm:` and up. Below that the wordmark, a pill
              wide enough to hold "Start Learning" and a menu button do not fit
              across 320px together — the pill was breaking its own label over
              two lines and pushing the page into a sideways scroll. The sheet
              carries the pair instead, and the hero's own call to action is a
              hundred pixels down the page. */}
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
                className="hidden h-10 cursor-pointer items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-medium whitespace-nowrap text-primary-foreground transition-all hover:bg-primary-hover hover:shadow-[0_4px_14px_color-mix(in_oklab,var(--primary)_35%,transparent)] sm:inline-flex"
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
            aria-controls="site-menu"
            onClick={() => setMobileOpen((v) => !v)}
            className="-mr-2.5 inline-flex size-11 cursor-pointer items-center justify-center rounded-full text-foreground transition-colors hover:bg-foreground/[0.06] xl:hidden"
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

      {/* Mobile: the same panels, behind the same one-at-a-time reveal the
          desktop popup gives them — an accordion is what hovering a trigger
          turns into when there is no cursor. Stacking all five open made a
          2,000px column of marketing copy with the labels buried inside it;
          collapsed, the five topics are one screen and you open the one you
          came for.

          `pb-[max(4rem,env(safe-area-inset-bottom))]` keeps the last control
          clear of a phone's home indicator. */}
      <div
        id="site-menu"
        className={`fixed inset-x-0 top-[4.5rem] bottom-0 z-40 overflow-y-auto overscroll-contain border-t border-border bg-background px-6 pt-2 pb-[max(4rem,env(safe-area-inset-bottom))] transition-all duration-300 lg:px-10 xl:hidden ${
          mobileOpen
            ? "visible translate-y-0 opacity-100"
            : "invisible -translate-y-2 opacity-0"
        }`}
      >
        <ul className="flex flex-col divide-y divide-border">
          {headerMenus.map((menu) => {
            const open = openSection === menu.label;
            return (
              <li key={menu.label}>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() =>
                    setOpenSection((current) =>
                      current === menu.label ? null : menu.label,
                    )
                  }
                  className="flex w-full cursor-pointer items-center justify-between gap-4 py-4 text-left text-[1.0625rem] text-foreground"
                >
                  {menu.label}
                  <ChevronDownIcon
                    aria-hidden
                    className={`size-4 shrink-0 text-faint transition-transform duration-300 ease-out motion-reduce:transition-none ${
                      open ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {/* The open/close is a `grid-template-rows` transition from
                    `0fr` to `1fr` — the one way to animate to a height
                    nobody has measured. A row track sized in `fr` resolves
                    against the content, so the panel plays out to its own
                    height without a `max-height` guess that is either too
                    small to finish or too large to look like it eased.

                    Which is why every panel is mounted rather than only the
                    open one: there is nothing to animate from if the content
                    arrives at the same moment the height does. Collapsed, the
                    track is zero and the wrapper clips, so a closed panel adds
                    nothing to the sheet's scroll height — and `inert` keeps it
                    out of the tab order and off the screen reader with it. */}
                <div
                  inert={!open}
                  className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${
                    open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  }`}
                >
                  <div className="overflow-hidden">
                    {/* The reset strips the popup's own padding: in here the
                        sheet owns the margin. */}
                    <div
                      className={`pb-6 transition-opacity duration-200 [&>div]:p-0 motion-reduce:transition-none ${
                        open ? "opacity-100 delay-100" : "opacity-0"
                      }`}
                    >
                      <MenuPanel menu={menu} />
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        {/* Both blocks stop at `sm`, which is exactly where the bar above
            starts carrying the same controls itself. */}
        <Show when="signed-in">
          <Link
            href="/dashboard"
            onClick={() => setMobileOpen(false)}
            className="mt-8 flex h-12 items-center justify-center rounded-full bg-primary text-[0.9375rem] font-medium text-primary-foreground sm:hidden"
          >
            Go to dashboard
          </Link>
        </Show>

        <Show when="signed-out">
          <div className="mt-8 flex flex-col gap-3 sm:hidden">
            <SignUpButton>
              <button
                aria-busy={mobileSignUp.pending}
                onClick={mobileSignUp.start}
                className="inline-flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-primary text-[0.9375rem] font-medium text-primary-foreground"
              >
                {mobileSignUp.pending && (
                  <Spinner aria-hidden className="size-3.5" />
                )}
                Start Learning
              </button>
            </SignUpButton>

            <SignInButton>
              <button
                aria-busy={mobileSignIn.pending}
                onClick={mobileSignIn.start}
                className="inline-flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full text-[0.9375rem] text-muted-foreground"
              >
                {mobileSignIn.pending && (
                  <Spinner aria-hidden className="size-3.5" />
                )}
                Sign in
              </button>
            </SignInButton>
          </div>
        </Show>
      </div>
    </header>
  );
}
