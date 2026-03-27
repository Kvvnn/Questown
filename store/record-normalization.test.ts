import { describe, expect, it } from "vitest";
import { normalizeImportedRecordState } from "./record-normalization";

describe("record normalization", () => {
  it("keeps the record key as the canonical date", () => {
    const result = normalizeImportedRecordState("2026-03-24", []);

    expect(result.date).toBe("2026-03-24");
  });

  it("keeps only one focused quest when imported data contains multiple pins", () => {
    const result = normalizeImportedRecordState("2026-03-24", [
      {
        id: "a",
        title: "첫 번째",
        type: "main",
        completed: false,
        createdAt: "2026-03-24T00:00:00.000Z",
        focusPinned: true
      },
      {
        id: "b",
        title: "두 번째",
        type: "sub",
        completed: false,
        createdAt: "2026-03-24T00:05:00.000Z",
        focusPinned: true
      }
    ]);

    expect(result.quests.filter((quest) => quest.focusPinned)).toHaveLength(1);
    expect(result.quests[0]?.focusPinned).toBe(true);
    expect(result.quests[1]?.focusPinned).toBe(false);
  });
});
