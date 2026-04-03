import { describe, expect, it } from "vitest";
import { resolveSelectedTownDate, resolveTownMonth } from "./town-selection";

describe("town selection helpers", () => {
  it("preserves an already selected town month during state sync", () => {
    expect(resolveTownMonth("2026-02", "2026-03-25")).toBe("2026-02");
    expect(resolveTownMonth(undefined, "2026-03-25")).toBe("2026-03");
  });

  it("clamps future town months back to the current month", () => {
    expect(resolveTownMonth("2026-04", "2026-03-25")).toBe("2026-03");
  });

  it("keeps a valid selected town date within the chosen month", () => {
    expect(
      resolveSelectedTownDate("2026-02", "2026-03-25", "2026-02-14", {
        "2026-02-03": {
          dateKey: "2026-02-03",
          sessionIds: [],
          floorIds: [],
          roofType: "none",
          ornamentIds: [],
          totalScore: 0,
          successfulSessionCount: 0,
          averageNormalizedScore: 0,
          streakSnapshot: {}
        }
      })
    ).toBe("2026-02-14");
  });
});
