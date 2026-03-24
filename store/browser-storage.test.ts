import { describe, expect, it, vi } from "vitest";
import { createSafeBrowserStorage } from "./browser-storage";

describe("createSafeBrowserStorage", () => {
  it("returns a noop storage when browser storage is unavailable", () => {
    const storage = createSafeBrowserStorage(undefined);

    expect(storage.getItem("missing")).toBeNull();
    expect(() => storage.setItem("key", "value")).not.toThrow();
    expect(() => storage.removeItem("key")).not.toThrow();
  });

  it("swallows storage access failures instead of throwing", () => {
    const storage = createSafeBrowserStorage({
      getItem: vi.fn(() => {
        throw new Error("read failed");
      }),
      setItem: vi.fn(() => {
        throw new Error("write failed");
      }),
      removeItem: vi.fn(() => {
        throw new Error("remove failed");
      })
    });

    expect(storage.getItem("key")).toBeNull();
    expect(() => storage.setItem("key", "value")).not.toThrow();
    expect(() => storage.removeItem("key")).not.toThrow();
  });
});
