import { createElement, createRef } from "react";
import { renderToString } from "react-dom/server";
import { expect, test } from "vitest";
import { ExperienceQuotaDonut } from "../../src/components/app/experience-quota";

test("the quota donut server-renders before its fullscreen portal container mounts", () => {
  const html = renderToString(createElement(ExperienceQuotaDonut, {
    container: createRef<HTMLElement>(),
    quota: {
      status: undefined,
      remaining: null,
      allowed: false,
      error: false,
      visible: false,
    },
  }));
  expect(html).toContain("Daily playtime: checking allowance");
  expect(html).toContain('aria-haspopup="dialog"');
});
