import { expect, test } from "vitest";
import {
  currentRelease,
  releases,
  releaseSeenVersion,
  type Release,
} from "../../src/lib/releases";

function release(version: string, importance?: Release["importance"]): Release {
  return { version, importance, date: "2026-09-13", title: "", body: "" };
}

test("1.0.1 keeps the existing 1.0 storage key for read and unread users", () => {
  expect(currentRelease.version).toBe("1.0.1");
  const key = `release-seen:${releaseSeenVersion(releases)}`;
  const storage = new Map<string, string>();
  expect(storage.has(key)).toBe(false);
  storage.set("release-seen:1.0", "1");
  expect(storage.has(key)).toBe(true);
});

test("skipping consecutive minor updates preserves the read state", () => {
  expect(
    releaseSeenVersion([
      release("1.0.2", "minor"),
      release("1.0.1", "minor"),
      release("1.0"),
    ]),
  ).toBe("1.0");
});

test("an important release starts a fresh state that subsequent minor updates inherit", () => {
  const history = [release("1.1", "important"), ...releases];
  expect(releaseSeenVersion(history)).toBe("1.1");
  expect(releaseSeenVersion([release("1.1.1", "minor"), ...history])).toBe(
    "1.1",
  );
});

test("releases are important by default", () => {
  expect(releaseSeenVersion([release("1.2"), ...releases])).toBe("1.2");
});
