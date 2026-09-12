import { afterEach, expect, test, vi } from "vitest";
import { siteUrl } from "../../src/lib/site-url";
afterEach(() => vi.unstubAllEnvs());
test("runtime staging origin overrides the public canonical origin", () => {
  vi.stubEnv("SITE_URL", "https://staging.example.org/");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.org");
  expect(siteUrl()).toBe("https://staging.example.org");
});
test("production origin is preserved without Vercel system variables", () => {
  vi.stubEnv("SITE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.org/");
  expect(siteUrl()).toBe("https://example.org");
});
test("missing production origin fails before an invitation can be sent", () => {
  vi.stubEnv("SITE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
  vi.stubEnv("NODE_ENV", "production");
  expect(siteUrl).toThrow("Set SITE_URL");
});
for (const origin of [
  "javascript:alert(1)",
  "https://user:pass@example.org",
  "https://example.org/path",
  "https://example.org?redirect=1",
]) {
  test(`rejects non-origin configuration: ${origin}`, () => {
    vi.stubEnv("SITE_URL", origin);
    expect(siteUrl).toThrow();
  });
}
