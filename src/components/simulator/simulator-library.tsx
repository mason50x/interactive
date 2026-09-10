"use client";

import { Suspense, useEffect } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { CodeBracketSquareIcon, CpuChipIcon } from "@heroicons/react/24/solid";
import styles from "./library.module.css";
import { GameBoyLibrary } from "./library";
import { CenteredSpinner } from "@/components/ui/spinner";
import { readStorage, writeStorage } from "@/lib/storage";

// The HTML library is the default view, and the Game Boy one is small; only
// the HTML library is split out because its store and its player pull in
// code the Game Boy tab never needs.
const HtmlLibrary = dynamic(() => import("./html-library"), {
  loading: () => <CenteredSpinner />,
});

const MODES = [
  { value: "html", label: "HTML", Icon: CodeBracketSquareIcon },
  { value: "gb", label: "Game Boy", Icon: CpuChipIcon },
] as const;

/**
 * The simulators page: a heading, the HTML / Game Boy switch, and whichever
 * library is chosen.
 *
 * The mode lives in the URL so a link to `?mode=gb` lands on the right tab,
 * and the last choice is remembered per account so a return visit without
 * a query opens where it left off. The switch is a hand-rolled segmented
 * control rather than the shared one because its indicator slides between
 * the options; the libraries are keyed by user so a sign-out and sign-in
 * starts them fresh.
 */
function Library() {
  const router = useRouter();
  const params = useSearchParams();
  const { userId } = useAuth();
  const selected = params.get("mode");
  const mode = selected === "gb" ? "gb" : "html";
  useEffect(() => {
    if (!userId) return;
    const key = `simulator-tab:${userId}`;
    if (!selected && readStorage(key) === "gb") {
      router.replace("?mode=gb", { scroll: false });
    } else if (selected) {
      writeStorage(key, mode);
    }
  }, [selected, mode, userId, router]);
  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-6 py-8 sm:px-8 lg:px-10">
      <header className="flex flex-wrap items-center justify-between gap-5">
        <h1 className="text-display text-display-title text-3xl sm:text-4xl">
          Interactive Simulators
        </h1>
        <div
          role="group"
          aria-label="Simulation format"
          className={styles.modeSwitch}
          data-mode={mode}
        >
          <span aria-hidden="true" className={styles.modeIndicator} />
          {MODES.map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() =>
                router.replace(`?mode=${value}`, { scroll: false })
              }
              className={styles.modeButton}
            >
              <Icon aria-hidden="true" className="size-[18px]" />
              {label}
            </button>
          ))}
        </div>
      </header>
      {mode === "html" ? (
        <HtmlLibrary key={userId} />
      ) : (
        <GameBoyLibrary key={userId} />
      )}
    </div>
  );
}

/** `useSearchParams` suspends during static rendering, so the page is
 *  wrapped once here rather than at every route that shows it. */
export function SimulatorLibrary() {
  return (
    <Suspense fallback={<CenteredSpinner />}>
      <Library />
    </Suspense>
  );
}
