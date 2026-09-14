import { describe, expect, test } from "vitest";
import { needleOf, score, scoreFolded, searchEntries } from "@/lib/search";

describe("needleOf", () => {
  test.each([
    ["", ""],
    ["   ", ""],
    ["  Café!! ", "cafe"],
    ["Co-op", "co op"],
    ["Pokémon  GO", "pokemon go"],
    ["A_b.c/d", "a b c d"],
  ])("%j folds to %j", (query, needle) => {
    expect(needleOf(query)).toBe(needle);
  });
});

describe("score", () => {
  test("the four tiers are exact, prefix, word start, and infix, in that order", () => {
    const exact = score("Chat", "chat");
    const prefix = score("Chat room", "chat");
    const wordStart = score("Klondike Solitaire", "sol");
    const infix = score("Password", "word");

    expect(exact).toBe(1000);
    expect(prefix).toBe(800 - "chat room".length);
    expect(wordStart).toBe(600 - "klondike solitaire".length);
    expect(infix).toBe(400 - "password".length);
    expect(exact).toBeGreaterThan(prefix!);
    expect(prefix).toBeGreaterThan(wordStart!);
    expect(wordStart).toBeGreaterThan(infix!);
  });

  test("a stronger tier on a long text still beats a weaker tier on a short one", () => {
    const longPrefix = score(`chat ${"x".repeat(300)}`, "chat");
    const shortWordStart = score("a chat", "chat");
    const shortInfix = score("achat", "chat");
    expect(longPrefix).toBeGreaterThanOrEqual(600);
    expect(longPrefix).toBeGreaterThan(shortWordStart!);
    expect(shortWordStart).toBeGreaterThan(shortInfix!);
  });

  test("within a tier the shorter text wins", () => {
    expect(score("Chat", "ch")).toBeGreaterThan(score("Chatter", "ch")!);
  });

  test("accents and punctuation in the text cannot hide it from the query", () => {
    expect(score("Pokémon", "pokemon")).toBe(1000);
    expect(score("Co-op", needleOf("co op"))).toBe(1000);
    expect(score("Co-op mode", needleOf("op"))).toBe(600 - "co op mode".length);
  });

  test("no match and an empty haystack are null", () => {
    expect(score("Chat", "xyz")).toBeNull();
    expect(scoreFolded("", "")).toBeNull();
    expect(scoreFolded("", "chat")).toBeNull();
  });

  test("scoreFolded matches score on already-folded text", () => {
    expect(scoreFolded("klondike solitaire", "sol")).toBe(
      score("Klondike Solitaire", "sol"),
    );
  });
});

describe("searchEntries", () => {
  test("an empty needle finds nothing", () => {
    expect(searchEntries("", 10)).toEqual([]);
  });

  test("a destination is found by its label and carries its href as detail", () => {
    const [first] = searchEntries(needleOf("chat"), 10);
    expect(first).toMatchObject({
      id: "page:/dashboard/chat",
      source: "page",
      title: "Chat",
      href: "/dashboard/chat",
      detail: "/dashboard/chat",
    });
    expect(first.action).toBeUndefined();
  });

  test("a hit by title outranks a hit by keyword", () => {
    const hits = searchEntries(needleOf("account"), 10);
    const titles = hits.map((hit) => hit.title);
    expect(titles.indexOf("User account")).toBeLessThan(
      titles.indexOf("Settings"),
    );
    expect(hits[0].action).toBe("account");
  });

  test("keywords make an entry findable by what people call it", () => {
    expect(searchEntries(needleOf("password"), 10)[0]).toMatchObject({
      source: "account",
      title: "User account",
      action: "account",
    });
    expect(searchEntries(needleOf("boss key"), 10)[0]).toMatchObject({
      title: "Panic key",
      action: "settings",
    });
    expect(searchEntries(needleOf("night"), 10)[0]).toMatchObject({
      title: "Dark theme",
      action: "theme:dark",
    });
  });

  test("the limit caps the list after sorting", () => {
    const all = searchEntries(needleOf("theme"), 100);
    expect(all.length).toBeGreaterThanOrEqual(3);
    expect(searchEntries(needleOf("theme"), 2)).toEqual(all.slice(0, 2));
  });

  test("every static entry has a unique id that is safe as a DOM id", () => {
    const idsByTitle = new Map<string, string>();
    const titlesById = new Map<string, string>();
    for (const needle of "abcdefghijklmnopqrstuvwxyz0123456789") {
      for (const hit of searchEntries(needle, 1000)) {
        expect(hit.id).toMatch(
          /^(page|activity|setting|account|message):[a-z0-9/-]+$/,
        );
        expect(idsByTitle.get(hit.title) ?? hit.id).toBe(hit.id);
        expect(titlesById.get(hit.id) ?? hit.title).toBe(hit.title);
        idsByTitle.set(hit.title, hit.id);
        titlesById.set(hit.id, hit.title);
      }
    }
    expect(titlesById.size).toBeGreaterThanOrEqual(11);
    expect(titlesById.size).toBe(idsByTitle.size);
  });

  test("ids within one result list are unique", () => {
    const hits = searchEntries("e", 1000);
    expect(new Set(hits.map((hit) => hit.id)).size).toBe(hits.length);
  });
});
