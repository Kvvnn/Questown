import { describe, expect, it } from "vitest";
import { resolveSelectedTownDate, resolveTownMonth } from "./town-selection";

describe("town selection helpers", () => {
  it("preserves an already selected town month during state sync", () => {
    expect(resolveTownMonth("2026-02", "2026-03-25")).toBe("2026-02");
    expect(resolveTownMonth(undefined, "2026-03-25")).toBe("2026-03");
  });

  it("keeps a valid selected town date within the chosen month", () => {
    expect(
      resolveSelectedTownDate("2026-02", "2026-03-25", "2026-02-14", {
        "2026-02-03": {
          date: "2026-02-03",
          quests: [],
          completedCount: 0,
          totalCount: 0,
          completionRate: 0,
          roofType: "none",
          isFinalized: false,
          completedByType: { daily: 0, main: 0, sub: 0 },
          totalByType: { daily: 0, main: 0, sub: 0 }
        }
      })
    ).toBe("2026-02-14");
  });
});
