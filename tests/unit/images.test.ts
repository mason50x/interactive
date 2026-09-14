import { afterEach, describe, expect, test, vi } from "vitest";
import {
  isImageFile,
  MAX_IMAGES_PER_MESSAGE,
  previewFor,
  rememberPreview,
} from "@/lib/images";
import { MAX_IMAGES_PER_MESSAGE as SERVER_MAX_IMAGES } from "@convex/moderation/limits";

afterEach(() => vi.restoreAllMocks());

test("MAX_IMAGES_PER_MESSAGE mirrors the server's limit", () => {
  expect(MAX_IMAGES_PER_MESSAGE).toBe(SERVER_MAX_IMAGES);
});

describe("isImageFile", () => {
  test.each([
    ["image/png", true],
    ["image/jpeg", true],
    ["image/gif", true],
    ["image/webp", true],
    ["image/svg+xml", true],
    ["text/plain", false],
    ["application/octet-stream", false],
    ["", false],
    // `File` lowercases the type it is given, so the check still holds.
    ["IMAGE/PNG", true],
  ])("%j -> %s", (type, expected) => {
    expect(isImageFile(new File(["x"], "file", { type }))).toBe(expected);
  });
});

describe("rememberPreview / previewFor", () => {
  test("keeps twenty-four previews and revokes the oldest when the twenty-fifth arrives", () => {
    const revoke = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);

    for (let index = 1; index <= 24; index += 1) {
      rememberPreview(`att-${index}`, `blob:preview-${index}`);
    }
    expect(revoke).not.toHaveBeenCalled();
    expect(previewFor("att-1")).toBe("blob:preview-1");
    expect(previewFor("att-24")).toBe("blob:preview-24");
    expect(previewFor("att-missing")).toBeUndefined();

    rememberPreview("att-25", "blob:preview-25");
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith("blob:preview-1");
    expect(previewFor("att-1")).toBeUndefined();
    expect(previewFor("att-2")).toBe("blob:preview-2");
    expect(previewFor("att-25")).toBe("blob:preview-25");

    rememberPreview("att-26", "blob:preview-26");
    expect(revoke).toHaveBeenCalledTimes(2);
    expect(revoke).toHaveBeenLastCalledWith("blob:preview-2");
    expect(previewFor("att-2")).toBeUndefined();
  });

  test("re-remembering an existing id replaces its url without evicting", () => {
    const revoke = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);
    rememberPreview("att-26", "blob:preview-26-again");
    expect(previewFor("att-26")).toBe("blob:preview-26-again");
    expect(revoke).not.toHaveBeenCalled();
  });
});
