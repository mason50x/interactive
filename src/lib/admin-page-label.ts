/** Human-readable names for the routes shown in the admin directory. */
export function adminPageLabel(
  path: string,
  activityTitles: ReadonlyMap<string, string>,
): string {
  const [, section, detail] = path.split("/");
  const activity = () =>
    detail
      ? `Activities · ${activityTitles.get(detail) ?? "Activity"}`
      : "Activities";

  switch (section) {
    case "home":
      return "Home";
    case "admin":
      return "Admin";
    case "activities":
    case "learn":
      return activity();
    // The old names stay so a presence row written before the rename still
    // reads properly.
    case "tv":
    case "entertainment":
      return detail ? `TV · ${friendlySegment(detail)}` : "TV";
    case "chat":
      return detail ? "Chat · Conversation" : "Chat";
    case "browse":
    case "experience":
      return detail ? `Browse · ${friendlySegment(detail)}` : "Browse";
    case "emulate":
    case "learning-simulator":
      return detail
        ? `Emulate · ${detail === "html" ? "HTML simulator" : detail === "published" ? "Published simulator" : "Simulator"}`
        : "Emulate";
    default:
      return section ? friendlySegment(section) : "Home";
  }
}

function friendlySegment(value: string): string {
  const names: Record<string, string> = {
    xbox: "Xbox Cloud Gaming",
    soccerrng: "Soccer RNG",
    "geforce-now": "GeForce NOW",
    youtube: "YouTube",
    tiktok: "TikTok",
    x: "X",
  };
  if (names[value]) return names[value];
  try {
    return decodeURIComponent(value)
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  } catch {
    return "Page";
  }
}
