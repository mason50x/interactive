"use client";
import { useEffect, useState } from "react";
import { useChat } from "@/components/app/chat/chat-provider";

export function Greeting() {
  const { profile } = useChat();
  const [hour, setHour] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setHour(new Date().getHours());
    const initial = setTimeout(update, 0);
    const timer = setInterval(update, 60_000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, []);
  const greeting =
    hour === null
      ? "Welcome back"
      : hour < 12
        ? "Good morning"
        : hour < 18
          ? "Good afternoon"
          : "Good evening";
  return (
    <p className="mt-2 text-sm text-muted-foreground">
      {greeting}
      {profile ? `, ${profile.displayName || profile.handle}` : ""}. Ready for a
      little play?
    </p>
  );
}
