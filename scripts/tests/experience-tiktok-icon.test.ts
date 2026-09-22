import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ExperienceAppIcon } from "../../src/components/app/experience-app-icon";
import { experienceAppHref, findExperienceApp } from "../../src/lib/experience";

it("renders the bundled TikTok logo and resolves its catalog route", () => {
  expect(findExperienceApp("tiktok")).toEqual({
    id: "tiktok", label: "TikTok", host: "tiktok.com", start: "https://www.tiktok.com/",
  });
  expect(experienceAppHref("tiktok")).toBe("/experience/tiktok");
  const html = renderToStaticMarkup(createElement(ExperienceAppIcon, { id: "tiktok" }));
  expect(html).toContain('src="/experience/tiktok.png"');
  expect(html).toContain('aria-hidden="true"');
  const png = readFileSync(new URL("../../public/experience/tiktok.png", import.meta.url));
  expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(png.readUInt32BE(16)).toBe(32);
  expect(png.readUInt32BE(20)).toBe(32);
});


it("retains the bundled X logo while its catalog route is disabled", () => {
  expect(findExperienceApp("x")).toBeNull();
  expect(experienceAppHref("x")).toBe("/experience/x");
  const html = renderToStaticMarkup(createElement(ExperienceAppIcon, { id: "x" }));
  expect(html).toContain('src="/experience/x.png"');
  const png = readFileSync(new URL("../../public/experience/x.png", import.meta.url));
  expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
});

it("offers Xbox Cloud Gaming with its official bundled logo", () => {
  expect(findExperienceApp("xbox")).toEqual({ id: "xbox", label: "Xbox Cloud Gaming", host: "xbox.com", start: "https://www.xbox.com/play" });
  expect(experienceAppHref("xbox")).toBe("/experience/xbox");
  expect(renderToStaticMarkup(createElement(ExperienceAppIcon, { id: "xbox" }))).toContain('src="/experience/xbox.png"');
  const png = readFileSync(new URL("../../public/experience/xbox.png", import.meta.url));
  expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(png.readUInt32BE(16)).toBe(180);
  expect(png.readUInt32BE(20)).toBe(180);
});
