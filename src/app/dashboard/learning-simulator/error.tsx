"use client";

/**
 * The simulator's error boundary. The message says what it can promise: the
 * progress is in IndexedDB and the cloud, not in the tree that just threw.
 */
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="space-y-4 p-8">
      <h1 className="text-xl font-semibold">
        Interactive Simulators couldn’t open
      </h1>
      <p>Your saved progress is kept separately.</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
