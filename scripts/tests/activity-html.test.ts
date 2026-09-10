import { describe, expect, it } from "vitest";
import { assertPatched, patchGameHtml } from "../migrate-to-r2.mjs";

const frameBuster = `<style id="antiClickjack">body{display:none !important;}</style><br><script type="text/javascript">if (self === top) { var antiClickjack = document.getElementById("antiClickjack"); antiClickjack.parentNode.removeChild(antiClickjack); } else { top.location = self.location; } </script>`;
const game = `<!DOCTYPE html><html><head><title>MotoX3M Pool</title></head><body><div id="content"></div><script src="motox3m.min.js"></script></body></html>`;

describe("hosted activity HTML", () => {
  it("restores the Phaser parent before startup without duplicating it on reruns", () => {
    const missingContainer = game.replace('<div id="content"></div>', "");
    expect(patchGameHtml(missingContainer)).toBe(game);
    expect(patchGameHtml(game)).toBe(game);
  });
  it("removes both the hiding style and blocked navigation, preserving game startup", () => {
    const result = patchGameHtml(game + frameBuster);
    expect(result).toBe(game);
    expect(() => assertPatched("motox3mpool", result)).not.toThrow();
    expect(patchGameHtml(result)).toBe(result);
  });

  it("leaves the working original and unrelated scripts/styles alone", () => {
    const original =
      game +
      `<style>body{background:black}</style><script>window.gameStarted=true;</script>`;
    expect(patchGameHtml(original)).toBe(original);
  });

  it("refuses to upload an unrecognized frame-buster instead of partially removing it", () => {
    const changed =
      game +
      frameBuster.replace(
        "top.location = self.location",
        "top.location.href = self.location.href",
      );
    expect(() =>
      assertPatched("changed-template", patchGameHtml(changed)),
    ).toThrow(/anticlickjack/);
  });
});
