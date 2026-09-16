"use client";

import {
  createContext,
  useContext,
  useState,
  useSyncExternalStore,
} from "react";
import Image from "next/image";
import { Dialog } from "@base-ui/react/dialog";
import {
  FilmIcon,
  QuestionMarkCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/solid";
import { Button } from "@/components/ui/button";

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
const HelpContext = createContext<() => void>(() => {});

export function PlaybackHelpButton() {
  const open = useContext(HelpContext);
  return (
    <button
      type="button"
      onClick={open}
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium hover:bg-current/10 focus-visible:outline-2 focus-visible:outline-offset-2"
      aria-label="Playback setup and help"
    >
      <QuestionMarkCircleIcon className="size-4" />
      Playback help
    </button>
  );
}

export function EntertainmentSetup({
  children,
}: {
  children: React.ReactNode;
}) {
  const completed = useSyncExternalStore(subscribe, snapshot, () => null);
  const [manualOpen, setManualOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [step, setStep] = useState(0);
  const [saveFailed, setSaveFailed] = useState(false);
  const open = manualOpen || (completed === false && !dismissed);
  function close() {
    setManualOpen(false);
    setDismissed(true);
  }
  function finish() {
    try {
      window.localStorage.setItem(KEY, "1");
    } catch {
      setSaveFailed(true);
    }
    sessionCompleted = true;
    window.dispatchEvent(new Event(EVENT));
    close();
  }
  return (
    <HelpContext.Provider
      value={() => {
        setStep(0);
        setManualOpen(true);
      }}
    >
      {children}
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
      <Dialog.Root
        open={open}
        onOpenChange={(next) => {
          if (!next) close();
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
          <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 flex max-h-[92dvh] w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-2xl">
            <header className="relative border-b p-5 pr-14 sm:p-7">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <FilmIcon className="size-5" />
                Entertainment · Setup {step + 1} of 3
              </div>
              <Dialog.Title className="text-2xl font-semibold">
                {
                  [
                    "Get ready to watch",
                    "Allow cookies for this site",
                    "You’re ready to try playback",
                  ][step]
                }
              </Dialog.Title>
              <Dialog.Description className="mt-2 text-sm text-muted-foreground">
                A one-time guide for this browser. Already playing successfully?
                You can mark setup complete.
              </Dialog.Description>
              <Dialog.Close
                aria-label="Close setup for now"
                className="absolute top-5 right-5 rounded-full p-2 hover:bg-muted"
              >
                <XMarkIcon className="size-5" />
              </Dialog.Close>
            </header>
            <div
              className="min-h-0 overflow-y-auto p-5 text-sm leading-relaxed sm:p-7"
              key={step}
            >
              {step === 0 && (
                <div className="space-y-5">
                  <p>
                    Videos here play through an embedded Google Drive player.
                    Google can limit viewing for people who aren’t signed in. If
                    that limit is reached, the player needs to recognize your
                    Google account to continue.
                  </p>
                  <section className="rounded-xl border bg-muted/40 p-5">
                    <h3 className="mb-2 font-semibold">
                      1. Sign in to Google in this browser
                    </h3>
                    <p>
                      Open Google Drive, sign in if needed, then return here.
                      Use the same browser profile and a regular window. Signing
                      in to this app doesn’t necessarily sign you in to Google
                      Drive.
                    </p>
                    <a
                      className="mt-3 inline-block font-medium underline underline-offset-4"
                      href="https://drive.google.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open Google Drive ↗
                    </a>
                  </section>
                  <section>
                    <h3 className="mb-2 font-semibold">Why cookies matter</h3>
                    <p>
                      Google is a different website from this app, so its
                      cookies inside the player are called third-party cookies.
                      Blocking them can prevent the player from recognizing an
                      existing Google session—even if Drive works in its own
                      tab. Allowing them for this site lets Google use that
                      session inside playback.
                    </p>
                  </section>
                  <p className="text-muted-foreground">
                    Your Google password and sign-in cookies stay with Google
                    and your browser. This app cannot read them or change your
                    browser’s cookie settings.
                  </p>
                </div>
              )}
              {step === 1 && (
                <div className="space-y-5">
                  <p>
                    In desktop Chrome, open the cookie or eye icon beside this
                    page’s address, if shown. Allow third-party cookies for this
                    site. Chrome may reload the page.
                  </p>
                  <figure className="overflow-hidden rounded-xl border bg-white p-3">
                    <Image
                      src="/entertainment-setup/allow-cookies.png"
                      width={2223}
                      height={958}
                      unoptimized
                      alt="Chrome example: address-bar cookie panel with third-party cookies allowed for the current site"
                      className="mx-auto max-h-64 w-auto max-w-full"
                    />
                    <figcaption className="mt-2 text-xs text-gray-600">
                      Chrome example from Google. The example address is
                      web.dev; use this app’s address instead.
                    </figcaption>
                  </figure>
                  <section>
                    <h3 className="mb-2 font-semibold">
                      No icon? Use Chrome Settings
                    </h3>
                    <ol className="list-decimal space-y-2 pl-5">
                      <li>
                        Open Settings → Privacy and security → Third-party
                        cookies.
                      </li>
                      <li>
                        Find “Sites allowed to use third-party cookies” and
                        choose Add.
                      </li>
                      <li>
                        Add this app’s website address from your address bar,
                        then return here.
                      </li>
                    </ol>
                  </section>
                  <figure className="overflow-hidden rounded-xl border bg-white p-3">
                    <Image
                      src="/entertainment-setup/site-exception.png"
                      width={2074}
                      height={879}
                      unoptimized
                      alt="Chrome Settings example showing the list of sites allowed to use third-party cookies and the Add button"
                      className="mx-auto max-h-64 w-auto max-w-full"
                    />
                    <figcaption className="mt-2 text-xs text-gray-600">
                      Example settings screen. Labels and icons vary by Chrome
                      version.
                    </figcaption>
                  </figure>
                  <p className="text-muted-foreground">
                    A site exception permits third-party cookies from embedded
                    services on this site, not only Google. You can remove it
                    later in the same settings. There’s no need to allow cookies
                    for every website.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Screenshots:{" "}
                    <a
                      href="https://privacysandbox.google.com/cookies/prepare/debug"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      Google
                    </a>
                    ,{" "}
                    <a
                      href="https://creativecommons.org/licenses/by/4.0/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      CC BY 4.0
                    </a>
                    . Other browsers have different controls; managed school or
                    work browsers may restrict changes.
                  </p>
                </div>
              )}
              {step === 2 && (
                <div className="space-y-5">
                  <p>
                    Return to Entertainment and open a show. If a player was
                    already open when you changed settings, reload this page to
                    give it a fresh Google session.
                  </p>
                  <section className="rounded-xl border bg-muted/40 p-5">
                    <h3 className="mb-2 font-semibold">
                      Still seeing “Sign in”?
                    </h3>
                    <p>
                      Check that Google Drive is signed in in the same browser
                      profile, and that the cookie exception is for this app’s
                      address. Private windows, extensions, or school/work
                      policies can still block access. Cookie access doesn’t
                      remove Google’s other playback or file limits.
                    </p>
                  </section>
                  <p>
                    We can’t reliably check Google’s cookie permission from this
                    page. “Setup complete” simply remembers that you’ve finished
                    this guide; it doesn’t verify or change the permission.
                  </p>
                  <p className="text-muted-foreground">
                    Saved only in this browser’s local storage on this
                    device—never to your account or the cloud. Another
                    browser/profile or clearing site data will show this guide
                    again. You can reopen it anytime with Playback help.
                  </p>
                  <a
                    className="inline-block underline underline-offset-4"
                    href="https://support.google.com/drive/answer/2423694"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Google Drive playback help ↗
                  </a>
                </div>
              )}
            </div>
            <footer className="flex flex-wrap items-center justify-between gap-3 border-t p-5">
              <Button
                variant="ghost"
                onClick={step ? () => setStep(step - 1) : close}
              >
                {step ? "Back" : "Not now"}
              </Button>
              <div className="flex flex-wrap gap-2">
                {step < 2 && (
                  <Button variant="ghost" onClick={finish}>
                    Already set up
                  </Button>
                )}
                <Button onClick={step < 2 ? () => setStep(step + 1) : finish}>
                  {step < 2 ? "Continue" : "Setup complete"}
                </Button>
              </div>
            </footer>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </HelpContext.Provider>
  );
}
