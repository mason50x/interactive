import { afterEach, describe, expect, test, vi } from "vitest";
import {
  formatLegalDate,
  LEGAL_UPDATED,
  legalDocuments,
  privacy,
  terms,
} from "@/lib/legal";

afterEach(() => vi.unstubAllEnvs());

describe("formatLegalDate", () => {
  test.each([
    ["2026-08-31", "August 31, 2026"],
    ["2026-01-01", "January 1, 2026"],
    ["2025-12-31", "December 31, 2025"],
    ["2024-02-29", "February 29, 2024"],
  ])("%s reads as %s", (iso, label) => {
    expect(formatLegalDate(iso)).toBe(label);
  });

  test("does not shift the day when the process runs west of UTC", () => {
    vi.stubEnv("TZ", "America/Los_Angeles");
    // Precondition: the local clock really did move, so the assertion below
    // is exercising the fixed zone rather than a machine that happens to be
    // in UTC already.
    expect(new Date("2026-08-31T00:00:00Z").getDate()).toBe(30);
    expect(formatLegalDate("2026-08-31")).toBe("August 31, 2026");
  });

  test("does not shift the day when the process runs east of UTC", () => {
    vi.stubEnv("TZ", "Pacific/Kiritimati");
    expect(formatLegalDate("2026-12-31")).toBe("December 31, 2026");
  });

  test("the shared update date renders", () => {
    expect(formatLegalDate(LEGAL_UPDATED)).toBe("August 31, 2026");
  });
});

describe("legalDocuments", () => {
  test("carries exactly the two slugs, each pointing at the other", () => {
    expect(Object.keys(legalDocuments).sort()).toEqual(["pp", "tos"]);
    expect(legalDocuments.pp.document).toBe(privacy);
    expect(legalDocuments.tos.document).toBe(terms);
    expect(legalDocuments.pp.sibling).toEqual({
      title: terms.title,
      href: "/tos",
    });
    expect(legalDocuments.tos.sibling).toEqual({
      title: privacy.title,
      href: "/pp",
    });
  });

  test.each([
    ["Privacy Policy", privacy],
    ["Terms of Service", terms],
  ])(
    "%s has unique, linkable section ids and no empty sections",
    (title, document) => {
      expect(document.title).toBe(title);
      expect(document.lede.length).toBeGreaterThan(0);
      const ids = document.sections.map((section) => section.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const section of document.sections) {
        expect(section.id).toMatch(/^[a-z][a-z0-9-]*$/);
        expect(section.heading.length).toBeGreaterThan(0);
        expect(section.blocks.length).toBeGreaterThan(0);
        for (const block of section.blocks) {
          if (block.kind === "p") expect(block.text.length).toBeGreaterThan(0);
          else expect(block.items.length).toBeGreaterThan(0);
        }
      }
    },
  );
});
