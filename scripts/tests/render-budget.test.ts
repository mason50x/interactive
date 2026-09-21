import { describe, expect, test } from "vitest";
import {
  hasLimitedRenderBudget,
  isPlayerRoute,
} from "../../src/lib/render-budget";
import {
  seedPoint,
  stepPoints,
} from "../../src/components/app/constellation/simulation";

describe("decorative rendering budget", () => {
  test.each([
    [{ deviceMemory: 4, hardwareConcurrency: 8 }, true],
    [{ deviceMemory: 8, hardwareConcurrency: 4 }, true],
    [{ deviceMemory: 8, hardwareConcurrency: 8 }, false],
    [{ connection: { saveData: true } }, true],
    [{}, false],
    [{ deviceMemory: 0, hardwareConcurrency: 0 }, false],
  ])("hardware animation budget for %j", (device, limited) => {
    expect(hasLimitedRenderBudget(device)).toBe(limited);
  });

  test.each([
    ["/activities", false],
    ["/activities/crossy", true],
    ["/entertainment/show", true],
    ["/learning-simulator/html/hash", true],
    ["/experience/browser", true],
    ["/learning-simulator", false],
    ["/experience", false],
    ["/chat/room", false],
  ])("player budget for %s", (path, expected) => {
    expect(isPlayerRoute(path)).toBe(expected);
  });
});

test("a still constellation settles under a stationary pointer, and after it leaves", () => {
  const point = { ...seedPoint(300, 300), x: 100, y: 100 };
  const options = {
    width: 300,
    height: 300,
    drifting: false,
    speed: 1,
    pointer: { x: 110, y: 110 } as { x: number; y: number } | null,
    flung: 0,
  };
  expect(stepPoints([point], options)).toBe(true);
  for (let i = 0; i < 60; i++) stepPoints([point], options);
  expect(stepPoints([point], options)).toBe(false);
  expect(point.dx).not.toBe(0);
  expect([point.x, point.y]).toEqual([100, 100]);
  options.pointer = null;
  expect(stepPoints([point], options)).toBe(true);
  for (let i = 0; i < 60; i++) stepPoints([point], options);
  expect(stepPoints([point], options)).toBe(false);
  expect([point.dx, point.dy]).toEqual([0, 0]);
});
