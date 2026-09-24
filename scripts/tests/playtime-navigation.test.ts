import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { expect, test } from "vitest";
import { isPlaytimeRoute } from "../../config/playtime";
import { PlaytimeNavLink } from "../../src/components/app/playtime-status";

test("only the four playtime sections are restricted, including deep links", () => {
  for (const path of ["/activities", "/activities/chess", "/tv", "/tv/show", "/browse", "/browse/app", "/emulate", "/emulate/html/hash", "/emulate/published/id"]) {
    expect(isPlaytimeRoute(path)).toBe(true);
  }
  for (const path of ["/chat", "/chat/room", "/home", "/admin", "/activities-other"]) {
    expect(isPlaytimeRoute(path)).toBe(false);
  }
});

test("an exhausted sidebar destination has no navigable URL", () => {
  const html = renderToString(createElement(PlaytimeNavLink, {
    disabled: true, href: "/activities",
  }, "Activities"));
  expect(html).toContain('aria-disabled="true"');
  expect(html).not.toContain('href=');
  expect(html).toContain("30 more seconds");
});

test("chat stays a real link while playtime destinations are disabled", () => {
  const html = renderToString(createElement(PlaytimeNavLink, {
    disabled: false, href: "/chat",
  }, "Chat"));
  expect(html).toContain('href="/chat"');
  expect(html).not.toContain('aria-disabled="true"');
});
