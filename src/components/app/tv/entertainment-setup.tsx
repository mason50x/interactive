"use client";

import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { InformationCircleIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const KEY = "entertainment-setup-completed-v1";
const EVENT = "entertainment-setup-changed";
let sessionCompleted = false;
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(EVENT, callback);
  };
}
function snapshot() {
  try {
    return window.localStorage.getItem(KEY) === "1" || sessionCompleted;
  } catch {
    return sessionCompleted;
  }
}
export function EntertainmentSetup({
  children,
}: {
  children: React.ReactNode;
}) {
  const completed = useSyncExternalStore(subscribe, snapshot, () => null);
  const titleId = useId();
  const [saveFailed, setSaveFailed] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
  const [returnedToTab, setReturnedToTab] = useState(false);

  useEffect(() => {
    if (completed === true) return;
    let leftTab = document.hidden || !document.hasFocus();
    const checkFocus = () => {
      if (document.hidden || !document.hasFocus()) {
        leftTab = true;
      } else if (leftTab) {
        setReturnedToTab(true);
      }
    };
    const onBlur = () => {
      leftTab = true;
    };
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", checkFocus);
    document.addEventListener("visibilitychange", checkFocus);
    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", checkFocus);
      document.removeEventListener("visibilitychange", checkFocus);
    };
  }, [completed]);

  function finish() {
    if (!returnedToTab) return;
    try {
      window.localStorage.setItem(KEY, "1");
    } catch {
      setSaveFailed(true);
    }
    sessionCompleted = true;
    window.dispatchEvent(new Event(EVENT));
  }
  return (
    <>
      {completed === true && children}
      {saveFailed && (
        <div
          role="status"
          className="fixed bottom-4 left-1/2 z-50 w-[min(90vw,28rem)] -translate-x-1/2 rounded-xl border bg-popover p-4 text-sm text-popover-foreground shadow-lg"
        >
          Your browser couldn’t save setup. It will stay dismissed for this
          session, but may appear next visit.
          <button
            onClick={() => setSaveFailed(false)}
            className="ml-2 underline"
          >
            Dismiss
          </button>
        </div>
      )}
      {completed !== true && (
        <section
          aria-labelledby={titleId}
          className="grid min-h-full w-full items-center gap-10 p-6 sm:p-10 lg:grid-cols-[minmax(16rem,0.8fr)_minmax(0,1.4fr)] lg:gap-12 xl:p-14"
        >
          <div className="min-w-0 text-left">
            <h1
              id={titleId}
              className="max-w-sm text-3xl font-semibold sm:text-4xl"
            >
              We need some permissions
            </h1>
            <p className="mt-4 max-w-sm text-base leading-relaxed text-muted-foreground">
              Follow the steps{" "}
              <span className="hidden lg:inline">on the right</span>
              <span className="lg:hidden">below</span> to set up entertainment.
            </p>
            <TooltipProvider>
              <Tooltip open={whyOpen} onOpenChange={setWhyOpen}>
                <TooltipTrigger
                  onClick={() => setWhyOpen((open) => !open)}
                  className="mt-5 inline-flex items-center gap-2 rounded-sm text-sm text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4"
                >
                  <InformationCircleIcon className="size-4 shrink-0" />
                  Why we need this
                </TooltipTrigger>
                <TooltipContent
                  side="bottom"
                  align="start"
                  className="max-w-80 p-4 text-sm leading-relaxed"
                >
                  Videos use Google Drive. Allowing third-party cookies for this
                  site lets the player recognize your Google sign-in. Sign in to
                  Google Drive in the same browser first. This app cannot read
                  your Google password or cookies, or change browser
                  permissions. The exception applies to embedded services on
                  this site and can be removed in your browser settings.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <div className="mt-10">
              <Button onClick={finish} disabled={!returnedToTab}>
                I’ve enabled it — continue
              </Button>
              {!returnedToTab && (
                <p className="mt-2 text-sm text-muted-foreground">
                  After changing the setting, return to this tab to continue.
                </p>
              )}
            </div>
          </div>
          <article className="min-w-0 rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-8">
            <p className="text-xs font-semibold text-muted-foreground">
              Chrome · desktop
            </p>
            <h2 className="mt-2 text-xl font-semibold">
              Allow this site to use third-party cookies
            </h2>
            <ol className="mt-6 list-decimal space-y-4 pl-5 text-sm leading-relaxed marker:font-semibold">
              <li>
                Sign in to{" "}
                <a
                  className="font-medium underline underline-offset-2"
                  href="https://drive.google.com"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Google Drive
                </a>{" "}
                in this browser.
              </li>
              <li>
                Open Chrome’s <strong>⋮ menu</strong>, then{" "}
                <strong>Settings</strong> →{" "}
                <strong>Privacy and security</strong> →{" "}
                <strong>Third-party cookies</strong>.
              </li>
              <li>
                Under <strong>Sites allowed to use third-party cookies</strong>,
                choose <strong>Add</strong>. Enter this site’s address from the
                tab, without a path, and save.
              </li>
              <li>
                Return to this tab and choose{" "}
                <strong>I’ve enabled it — continue</strong>.
              </li>
            </ol>
            <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
              If Chrome is managed by a school or workplace, an administrator
              may control this setting. You can remove the exception later in
              the same settings page.
            </p>
            <a
              className="mt-4 inline-block text-xs font-medium underline underline-offset-2"
              href="https://support.google.com/chrome/answer/95647"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google Chrome’s current instructions ↗
            </a>
          </article>
        </section>
      )}
    </>
  );
}
