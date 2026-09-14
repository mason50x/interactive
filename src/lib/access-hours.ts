/** One shared clock for every visitor, including daylight saving changes. */
const centralClock = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function isAccessOpen(now: Date = new Date()): boolean {
  const parts = centralClock.formatToParts(now);
  const weekday = parts.find((part) => part.type === "weekday")?.value;
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  const minutes = hour * 60 + minute;
  return (
    ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(weekday ?? "") &&
    minutes >= 7 * 60 + 30 &&
    minutes < 14 * 60 + 55
  );
}

export function accessClosedResponse(request: Request): Response {
  return new Response(
    request.method === "HEAD"
      ? null
      : '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Outside access hours</title><body><main><h1>We’re closed right now</h1><p>Access is available Monday–Friday, 7:30 a.m.–2:55 p.m. Central time.</p><p>Please return during these hours.</p></main></body></html>',
    {
      status: 403,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow",
        "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      },
    },
  );
}
