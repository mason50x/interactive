import { describe, expect, it } from "vitest";
import {
  assertPatched,
  patchGameHtml,
  patchGameScript,
} from "../migrate-to-r2.mjs";

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

describe("per-game repairs", () => {
  const paperio = `<html><head><title>Paper.io 2</title></head><body><script src="js/app-new-gm.js?26"></script></body></html>`;
  const holeio = `<html><head><title>Hole.io</title><script src="Build/UnityLoader.js"></script></head><body></body></html>`;

  it("fires Paper.io's form submit the sandbox withholds, once", () => {
    const result = patchGameHtml(paperio);
    expect(result).toContain('id="il-form-submit"');
    expect(patchGameHtml(result)).toBe(result);
  });

  it("adds Hole.io keyboard steering, once", () => {
    const result = patchGameHtml(holeio);
    expect(result).toContain('id="il-hole-keys"');
    expect(patchGameHtml(result)).toBe(result);
  });

  it("leaves other games without either shim", () => {
    expect(patchGameHtml(game)).not.toMatch(/il-(form-submit|hole-keys)/);
  });

  it("loads Monkey Mart's bundled Poki core instead of the dead host", () => {
    const loader = `window.PokiSDK = { rewardedBreak: t.rewardedBreak, displayAd: t.throwNotLoaded }; var i = "//tbg95.github.io/poki-sdk-" + (n ? "kids" : "core") + "-" + o + ".js";`;
    const result = patchGameScript("poki-sdk.js", loader);
    expect(result).toContain(`var i = "poki-sdk-" + (n ? "kids" : "core")`);
    expect(result).not.toContain("tbg95");
    // The engine calls these before the core has necessarily loaded.
    expect(result).toMatch(/isAdBlocked: function\(\) \{ return false \}/);
    expect(result).toContain("captureError:");
    expect(result).toContain("shareableURL:");
    expect(patchGameScript("poki-sdk.js", result)).toBe(result);
    expect(patchGameScript("other.js", loader)).toBe(loader);
  });
});
