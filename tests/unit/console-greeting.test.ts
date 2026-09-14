import { describe, expect, test } from "vitest";
import { consoleGreetingScript } from "@/lib/console-greeting";

describe("consoleGreetingScript", () => {
  test("parses as JavaScript and cannot close its own script tag", () => {
    expect(() => new Function(consoleGreetingScript)).not.toThrow();
    expect(consoleGreetingScript).not.toContain("</script");
    expect(consoleGreetingScript).toMatch(/^\(function\(\)\{try\{/);
  });

  test("logs the caution and then the offer, styled with %c", () => {
    const calls: unknown[][] = [];
    new Function("console", consoleGreetingScript)({
      log: (...args: unknown[]) => calls.push(args),
    });

    expect(calls).toHaveLength(2);
    const [caution, offer] = calls;
    expect(caution[0]).toMatch(/^%c/);
    expect(caution).toHaveLength(2);
    expect(offer[0]).toBe("%cTry out a free map with code %cCONSOLE20%c.");
    expect(offer).toHaveLength(4);
    for (const style of [caution[1], offer[1], offer[2], offer[3]]) {
      expect(style).toMatch(/^[a-z-]+:[^;]+(;[a-z-]+:[^;]+)*$/);
    }
  });

  test("a missing console is not worth taking the page down for", () => {
    expect(() =>
      new Function("console", consoleGreetingScript)(undefined),
    ).not.toThrow();
  });
});
