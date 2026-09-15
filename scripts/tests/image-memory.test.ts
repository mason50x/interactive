import { afterEach, expect, test, vi } from "vitest";
import {
  prepareImage,
  rememberPreview,
  previewFor,
} from "../../src/lib/images";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test.each([false, true])(
  "image buffers are released after encoding (failure: %s)",
  async (fails) => {
    const bitmap = { width: 4096, height: 2048, close: vi.fn() };
    const blob = new Blob(["encoded"], { type: "image/webp" });
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: vi.fn() }),
      toBlob: (done: (blob: Blob) => void) => {
        if (fails) throw new Error("encode failed");
        done(blob);
      },
    };
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
    vi.stubGlobal("document", { createElement: () => canvas });
    const prepared = prepareImage(
      new File(["photo"], "photo.jpg", { type: "image/jpeg" }),
    );
    if (fails) await expect(prepared).rejects.toThrow("encode failed");
    else
      await expect(prepared).resolves.toEqual({
        blob,
        width: 2048,
        height: 1024,
      });
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
  },
);

test("replacing a preview releases its previous blob but keeps the current URL", () => {
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  rememberPreview("memory-test", "blob:first");
  rememberPreview("memory-test", "blob:second");
  rememberPreview("memory-test", "blob:second");
  expect(revoke.mock.calls).toEqual([["blob:first"]]);
  expect(previewFor("memory-test")).toBe("blob:second");
});
