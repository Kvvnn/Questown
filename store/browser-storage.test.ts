import { describe, expect, it, vi } from "vitest";
import { createSafeBrowserStorage } from "./browser-storage";

describe("createSafeBrowserStorage", () => {
  it("returns a degraded noop storage when browser storage is unavailable", () => {
    const storage = createSafeBrowserStorage(undefined);

    expect(storage.getItem("missing")).toBeNull();
    expect(() => storage.setItem("key", "value")).not.toThrow();
    expect(() => storage.removeItem("key")).not.toThrow();
    expect(storage.getHealth()).toMatchObject({
      readable: false,
      writable: false,
      degraded: true
    });
  });

  it("records storage health when access fails instead of throwing", () => {
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
    expect(storage.getHealth()).toMatchObject({
      readable: false,
      degraded: true,
      lastError: "read failed"
    });

    expect(() => storage.setItem("key", "value")).not.toThrow();
    expect(storage.getHealth()).toMatchObject({
      writable: false,
      degraded: true,
      lastError: "write failed"
    });

    expect(() => storage.removeItem("key")).not.toThrow();
    expect(storage.getHealth()).toMatchObject({
      writable: false,
      degraded: true,
      lastError: "remove failed"
    });
  });
});
