import { describe, expect, it } from "vitest";
import { normalizeImportedRecordState } from "./record-normalization";

describe("record normalization", () => {
  it("keeps the record key as the canonical date", () => {
    const result = normalizeImportedRecordState("2026-03-24", []);

    expect(result.date).toBe("2026-03-24");
  });
});
