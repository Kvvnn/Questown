import { describe, expect, it } from "vitest";
import { getStreakCount, getWeeklySummary } from "./progress";
import { DailyRecord } from "./types";

const rec = (date: string, completedCount: number, totalCount: number, isFinalized = true): DailyRecord => ({
  date,
  quests: [],
  completedCount,
  totalCount,
  completionRate: totalCount > 0 ? completedCount / totalCount : 0,
  roofType: "mid",
  isFinalized,
  completedByType: { daily: completedCount, main: 0, sub: 0 },
  totalByType: { daily: totalCount, main: 0, sub: 0 }
});

describe("progress utils", () => {
  it("calculates streak with goal", () => {
    const map = {
      "2026-03-24": rec("2026-03-24", 3, 3),
      "2026-03-23": rec("2026-03-23", 4, 5),
      "2026-03-22": rec("2026-03-22", 2, 3)
    };

    expect(getStreakCount(map, "2026-03-24", 3)).toBe(2);
  });

  it("returns weekly summary", () => {
    const map = {
      "2026-03-24": rec("2026-03-24", 3, 5),
      "2026-03-23": rec("2026-03-23", 2, 2),
      "2026-03-22": rec("2026-03-22", 0, 3)
    };

    const summary = getWeeklySummary(map, "2026-03-24", 2);
    expect(summary.completed).toBe(5);
    expect(summary.total).toBe(10);
    expect(summary.successfulDays).toBe(2);
  });
});
