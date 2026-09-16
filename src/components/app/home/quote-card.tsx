"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { dailyLearningQuote, nextQuoteDelay } from "@/lib/learning-quotes";

export function QuoteCard() {
  const [quote, setQuote] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      const now = Date.now();
      setQuote(dailyLearningQuote(now));
      clearTimeout(timer);
      timer = setTimeout(refresh, nextQuoteDelay(now));
    };
    // Keep hydration stable, then schedule only the next UTC date boundary.
    timer = setTimeout(refresh, 0);
    const visibility = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);

  return (
    <Card radius="md" className="p-5">
      <h2 className="text-sm font-semibold">Quote of the day</h2>
      <blockquote className="mt-4 flex min-h-24 items-center text-[0.9375rem] leading-relaxed text-muted-foreground">
        <p>{quote ? `“${quote}”` : "A little wisdom is on its way…"}</p>
      </blockquote>
    </Card>
  );
}
