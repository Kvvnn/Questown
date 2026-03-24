import { describe, expect, it, vi } from "vitest";
import { createQuestownId } from "./id";

describe("createQuestownId", () => {
  it("uses crypto.randomUUID when available", () => {
    const randomUUID = vi.fn(() => "uuid-from-crypto" as ReturnType<Crypto["randomUUID"]>);

    const id = createQuestownId({ randomUUID: randomUUID as Crypto["randomUUID"] });

    expect(id).toBe("uuid-from-crypto");
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });

  it("falls back to a generated id when randomUUID is unavailable", () => {
    const id = createQuestownId(null);

    expect(id).toMatch(/^questown-[a-z0-9]+-[a-z0-9]+-[a-z0-9]+$/);
  });

  it("falls back cleanly when randomUUID throws", () => {
    const randomUUID = vi.fn(() => {
      throw new Error("blocked");
    });

    const id = createQuestownId({ randomUUID: randomUUID as Crypto["randomUUID"] });

    expect(id).toMatch(/^questown-[a-z0-9]+-[a-z0-9]+-[a-z0-9]+$/);
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });
});
