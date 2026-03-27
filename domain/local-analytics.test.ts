import { describe, expect, it } from "vitest";
import { ensureDailyRecord } from "./date";
import { getLocalAnalyticsSnapshot } from "./local-analytics";
import { DailyRecord } from "./types";

const createRecord = (
  date: string,
  {
    completedCount = 0,
    finalized = false,
    completedMain = 0
  }: {
    completedCount?: number;
    finalized?: boolean;
    completedMain?: number;
  }
): DailyRecord => ({
  ...ensureDailyRecord(date),
  completedCount,
  totalCount: completedCount,
  isFinalized: finalized,
  completedByType: {
    daily: 0,
    main: completedMain,
    sub: 0
  },
  totalByType: {
    daily: 0,
    main: completedMain,
    sub: 0
  }
});

describe("getLocalAnalyticsSnapshot", () => {
  it("calculates the recent 7-day average completed count", () => {
    const recordsByDate = {
      "2026-03-21": createRecord("2026-03-21", { completedCount: 1 }),
      "2026-03-22": createRecord("2026-03-22", { completedCount: 2 }),
      "2026-03-23": createRecord("2026-03-23", { completedCount: 3 }),
      "2026-03-24": createRecord("2026-03-24", { completedCount: 4 }),
      "2026-03-25": createRecord("2026-03-25", { completedCount: 5 }),
      "2026-03-26": createRecord("2026-03-26", { completedCount: 6 }),
      "2026-03-27": createRecord("2026-03-27", { completedCount: 7 })
    };

    const snapshot = getLocalAnalyticsSnapshot(recordsByDate, "2026-03-27", 3, 10);
    expect(snapshot.avgCompletedLast7).toBe(4);
  });

  it("calculates the last 14-day finalized rate", () => {
    const recordsByDate = Object.fromEntries(
      Array.from({ length: 14 }, (_, index) => {
        const date = `2026-03-${String(index + 14).padStart(2, "0")}`;
        return [date, createRecord(date, { finalized: index < 7 })];
      })
    );

    const snapshot = getLocalAnalyticsSnapshot(recordsByDate, "2026-03-27", 3, 10);
    expect(snapshot.finalizedDaysLast14).toBe(7);
    expect(snapshot.finalizedRateLast14).toBe(50);
  });

  it("counts Monday-start weekly success streaks", () => {
    const recordsByDate = {
      "2026-03-16": createRecord("2026-03-16", { completedMain: 5 }),
      "2026-03-17": createRecord("2026-03-17", { completedMain: 5 }),
      "2026-03-23": createRecord("2026-03-23", { completedMain: 6 }),
      "2026-03-24": createRecord("2026-03-24", { completedMain: 4 })
    };

    const snapshot = getLocalAnalyticsSnapshot(recordsByDate, "2026-03-27", 3, 10);
    expect(snapshot.weeklySuccessStreak).toBe(2);
  });
});
