import { describe, expect, test } from "vitest";
import { ACTIVITIES_HREF, CHAT_HREF, NAV_HREFS, navItems } from "@/lib/nav";

/** A plain function component, or the exotic object `forwardRef` returns
 *  (which is what Heroicons export). */
const isComponent = (value: unknown) =>
  typeof value === "function" ||
  (typeof value === "object" && value !== null && "$$typeof" in value);

describe("navItems", () => {
  test("NAV_HREFS is derived from navItems and holds no duplicates", () => {
    expect(NAV_HREFS).toEqual(navItems.map((item) => item.href));
    expect(new Set(NAV_HREFS).size).toBe(NAV_HREFS.length);
  });

  test("keeps one identity across reads", () => {
    expect(NAV_HREFS).toBe(NAV_HREFS);
  });

  test.each(navItems.map((item) => [item.label, item] as const))(
    "%s carries both icon cuts and a dashboard route",
    (_label, item) => {
      expect(isComponent(item.icon.outline)).toBe(true);
      expect(isComponent(item.icon.solid)).toBe(true);
      expect(item.icon.outline).not.toBe(item.icon.solid);
      expect(item.href).toMatch(/^\/dashboard(\/|$)/);
    },
  );

  test("the named destinations are on the rail", () => {
    expect(NAV_HREFS).toContain("/dashboard");
    expect(NAV_HREFS).toContain(ACTIVITIES_HREF);
    expect(NAV_HREFS).toContain(CHAT_HREF);
  });

  test("only the chat row shows an unread dot", () => {
    expect(
      navItems.filter((item) => item.unread).map((item) => item.href),
    ).toEqual([CHAT_HREF]);
  });

  test("labels are unique", () => {
    const labels = navItems.map((item) => item.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
