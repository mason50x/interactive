"use client";

import { useEffect, useState } from "react";
import { GeometryPlayground } from "@/components/app/geometry/playground";

function TimeoutCountdown({ expiresAt }: { expiresAt: number }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  const secondsLeft = Math.ceil(
    Math.max(0, expiresAt - (now ?? expiresAt)) / 1000,
  );
  const hours = Math.floor(secondsLeft / 3600);
  const minutes = Math.floor((secondsLeft % 3600) / 60);
  const seconds = secondsLeft % 60;
  const clock = [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");

  return (
    <time
      dateTime={new Date(expiresAt).toISOString()}
      title={new Date(expiresAt).toLocaleString()}
      role="timer"
      aria-live="off"
      aria-label={
        now === null ? "Calculating time remaining" : `${clock} remaining`
      }
      className="whitespace-nowrap tabular-nums"
    >
      {now === null ? "--:--:--" : clock}
    </time>
  );
}

export function TimeoutMessage({
  rayId,
  reason,
  expiresAt,
}: {
  rayId: string;
  reason: string;
  expiresAt: number;
}) {
  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-white text-black lg:grid lg:grid-cols-2 lg:overflow-hidden">
      <div className="flex items-center justify-center px-8 pt-16 pb-12 lg:h-svh lg:overflow-y-auto lg:pb-24">
        <div className="w-full max-w-xl">
          <h1 role="alert" className="text-3xl font-semibold">
            You&apos;ve been timed out
          </h1>
          <p className="mt-5 leading-relaxed">
            Your access has been temporarily paused. Contact an admin for help
            or to discuss this timeout.
          </p>
          <p className="mt-5 break-words whitespace-pre-wrap">
            <strong>Reason:</strong> {reason}
          </p>
        </div>
      </div>
      <div className="border-t border-neutral-200 bg-neutral-50 px-6 pt-10 pb-24 lg:h-svh lg:overflow-y-auto lg:border-t-0 lg:border-l lg:py-12">
        <div className="flex min-h-full items-center">
          <GeometryPlayground />
        </div>
      </div>
      <p className="fixed inset-x-0 bottom-0 z-[101] bg-white px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-xs text-neutral-500 lg:right-1/2">
        <span className="inline-flex flex-wrap items-baseline justify-center">
          <span>
            Ray ID: <code className="break-all select-all">{rayId}</code>
          </span>
          <span aria-hidden="true" className="mx-2">
            |
          </span>
          <TimeoutCountdown expiresAt={expiresAt} />
        </span>
      </p>
    </div>
  );
}
