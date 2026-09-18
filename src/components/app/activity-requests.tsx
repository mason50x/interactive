"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ComponentProps,
} from "react";
import { useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { useAction } from "convex/react";
import { ConvexError } from "convex/values";
import { CheckIcon, PlusIcon } from "@heroicons/react/24/outline";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Input, Textarea } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";

function FieldGroup(props: ComponentProps<"fieldset">) {
  return (
    <fieldset className="flex flex-col gap-5 disabled:opacity-60" {...props} />
  );
}
function Field({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-2">{children}</div>;
}

export function ActivityRequests() {
  const { user, isLoaded } = useUser();
  const submit = useAction(api.activityRequests.submit);
  const params = useSearchParams();
  const requested = params.get("request") === "1";
  const [open, setOpen] = useState(requested);
  const [prevRequested, setPrevRequested] = useState(requested);
  if (prevRequested !== requested) {
    setPrevRequested(requested);
    if (requested) setOpen(true);
  }
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    if (!sent || !open) return;
    const timeout = window.setTimeout(() => setOpen(false), 1400);
    return () => window.clearTimeout(timeout);
  }, [sent, open]);

  function show() {
    setSent(false);
    setError(null);
    setOpen(true);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    const data = new FormData(event.currentTarget);
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      await submit({
        activity: String(data.get("activity")),
        url: String(data.get("url")),
        reason: String(data.get("reason")),
        details: String(data.get("details")),
      });
      setSent(true);
    } catch (error) {
      setError(
        error instanceof ConvexError
          ? String(error.data)
          : "Couldn't send your request. Please try again.",
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={show}
        className="group flex aspect-video w-full cursor-pointer flex-col items-center justify-center gap-3 overflow-hidden rounded-xl border border-border bg-surface-muted p-5 text-center transition-[box-shadow] duration-300 outline-none hover:shadow-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <PlusIcon
          className="size-12 text-black dark:text-foreground"
          strokeWidth={3.5}
          aria-hidden="true"
        />
        <span className="text-base font-semibold text-foreground">
          Request an activity
        </span>
      </button>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!pending) {
            setOpen(next);
            if (!next) {
              setError(null);
            }
          }
        }}
      >
        <SheetContent
          showCloseButton={!sent}
          className="gap-0 overflow-y-auto data-[side=right]:w-[calc(100vw-1.5rem)] data-[side=right]:sm:max-w-md"
        >
          <SheetHeader className={sent ? "sr-only" : "p-6 pr-12"}>
            <SheetTitle>Activity Requests</SheetTitle>
            <SheetDescription>
              What should we add next? Tell us about an activity you’d love to
              see here.
            </SheetDescription>
          </SheetHeader>
          {sent ? (
            <div
              className="flex flex-1 items-center justify-center"
              role="status"
            >
              <CheckIcon
                className="size-20 text-success"
                strokeWidth={3.5}
                aria-hidden="true"
              />
              <span className="sr-only">Request sent</span>
            </div>
          ) : (
            <form
              onSubmit={onSubmit}
              className="flex flex-1 flex-col"
              aria-busy={pending}
            >
              <div className="px-6 pb-6">
                <FieldGroup disabled={pending || !isLoaded || !user}>
                  <Field>
                    <label htmlFor="request-activity">Name of activity</label>
                    <Input
                      id="request-activity"
                      name="activity"
                      required
                      maxLength={200}
                      placeholder="What’s it called?"
                    />
                  </Field>
                  <Field>
                    <label htmlFor="request-url">Working URL (optional)</label>
                    <Input
                      id="request-url"
                      name="url"
                      type="url"
                      maxLength={2000}
                      placeholder="https://…"
                    />
                  </Field>
                  <Field>
                    <label htmlFor="request-reason">
                      Why do you want it added?
                    </label>
                    <Textarea
                      id="request-reason"
                      name="reason"
                      required
                      maxLength={3000}
                      placeholder="Tell us what makes it worth adding."
                    />
                  </Field>
                  <Field>
                    <label htmlFor="request-details">
                      Anything else? (optional)
                    </label>
                    <Textarea
                      id="request-details"
                      name="details"
                      maxLength={3000}
                      placeholder="Helpful details, instructions, or things we should know."
                    />
                  </Field>
                </FieldGroup>
              </div>
              <SheetFooter className="px-6 pb-6">
                {error && <Alert>{error}</Alert>}
                <Button type="submit" disabled={pending || !isLoaded || !user}>
                  {pending ? "Sending…" : "Send request"}
                </Button>
              </SheetFooter>
            </form>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
