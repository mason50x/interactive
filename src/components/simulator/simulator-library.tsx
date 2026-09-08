"use client";
import { Suspense, useEffect } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { CodeBracketSquareIcon, CpuChipIcon } from "@heroicons/react/24/solid";
import styles from "./library.module.css";
import { GameBoyLibrary } from "./library";
import { CenteredSpinner } from "@/components/ui/spinner";
const HtmlLibrary = dynamic(() => import("./html-library"), {
  loading: () => <CenteredSpinner />,
});
function Library() {
  const router = useRouter(),
    params = useSearchParams(),
    { userId } = useAuth();
  const selected = params.get("mode"),
    mode = selected === "gb" ? "gb" : "html";
  useEffect(() => {
    if (!userId) return;
    try {
      const key = `simulator-tab:${userId}`;
      if (!selected && localStorage.getItem(key) === "gb")
        router.replace("?mode=gb", { scroll: false });
      else if (selected) localStorage.setItem(key, mode);
    } catch {
      /* Device preference is optional. */
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
          {(["html", "gb"] as const).map((value) => {
            const Icon = value === "html" ? CodeBracketSquareIcon : CpuChipIcon;
            return (
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
                {value.toUpperCase()}
              </button>
            );
          })}
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
export function SimulatorLibrary() {
  return (
    <Suspense fallback={<CenteredSpinner />}>
      <Library />
    </Suspense>
  );
}
