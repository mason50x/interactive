import { afterEach, describe, expect, test, vi } from "vitest";
import {
  EXPERIENCE_APPS,
  EXPERIENCE_HREF,
  experienceAppHref,
  experienceSrc,
  findExperienceApp,
} from "@/lib/experience";

afterEach(() => vi.unstubAllEnvs());

describe("experienceAppHref", () => {
  test.each([
    ["youtube", "/dashboard/experience/youtube"],
    ["a b/c", "/dashboard/experience/a%20b%2Fc"],
    ["?x=1&y", "/dashboard/experience/%3Fx%3D1%26y"],
  ])("%j -> %s", (id, href) => {
    expect(experienceAppHref(id)).toBe(href);
    expect(href.startsWith(`${EXPERIENCE_HREF}/`)).toBe(true);
  });
});

describe("findExperienceApp", () => {
  test("the allowlist lists at least one app", () => {
    expect(EXPERIENCE_APPS.length).toBeGreaterThan(0);
  });

  test.each(EXPERIENCE_APPS.map((app) => [app.id, app] as const))(
    "%s resolves to its own entry with a host and a start URL",
    (id, app) => {
      expect(findExperienceApp(id)).toBe(app);
      expect(app.host.length).toBeGreaterThan(0);
      expect(app.label.length).toBeGreaterThan(0);
      expect(() => new URL(app.start)).not.toThrow();
    },
  );

  test.each(["", "nope", "YOUTUBE", "wikipedia.org"])(
    "%j is not an app",
    (id) => {
      expect(findExperienceApp(id)).toBeNull();
    },
  );
});

describe("experienceSrc", () => {
  const target = "https://www.youtube.com/watch?v=abc&t=1";

  test("is null when no origin is configured", () => {
    vi.stubEnv("EXPERIENCE_ORIGIN", "");
    vi.stubEnv("NEXT_PUBLIC_EXPERIENCE_ORIGIN", "");
    expect(experienceSrc(target)).toBeNull();
  });

  test("frames the target through the server origin, slash stripped", () => {
    vi.stubEnv("EXPERIENCE_ORIGIN", "https://exp.example/");
    vi.stubEnv("NEXT_PUBLIC_EXPERIENCE_ORIGIN", "https://public.example");
    expect(experienceSrc(target)).toBe(
      `https://exp.example/?u=${encodeURIComponent(target)}`,
    );
  });

  test("falls back to the public origin when the server one is unparseable", () => {
    vi.stubEnv("EXPERIENCE_ORIGIN", "[SENSITIVE]");
    vi.stubEnv("NEXT_PUBLIC_EXPERIENCE_ORIGIN", "https://public.example/");
    expect(experienceSrc(target)).toBe(
      `https://public.example/?u=${encodeURIComponent(target)}`,
    );
  });
});
