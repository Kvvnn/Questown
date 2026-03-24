import { describe, expect, it } from "vitest";
import { getExecutionQueue, getFocusQuestIds, getWeeklyMainProgress } from "./execution";
import { DailyRecord, QuestItem } from "./types";

const q = (overrides: Partial<QuestItem>): QuestItem => ({
  id: overrides.id ?? crypto.randomUUID(),
  title: overrides.title ?? "quest",
  type: overrides.type ?? "daily",
  completed: overrides.completed ?? false,
  createdAt: overrides.createdAt ?? new Date().toISOString(),
  priority: overrides.priority,
  dependencyQuestIds: overrides.dependencyQuestIds,
  focusPinned: overrides.focusPinned,
  isRecurring: overrides.isRecurring,
  recurrencePattern: overrides.recurrencePattern,
  recurrenceKey: overrides.recurrenceKey,
  recurrenceAnchorDate: overrides.recurrenceAnchorDate,
  recurrenceIntervalDays: overrides.recurrenceIntervalDays,
  carryOverEnabled: overrides.carryOverEnabled,
  carryOverLimit: overrides.carryOverLimit,
  carryOverCount: overrides.carryOverCount,
  carryOverSourceQuestId: overrides.carryOverSourceQuestId,
  completedAt: overrides.completedAt
});

describe("execution utils", () => {
  it("prioritizes executable quests over blocked quests", () => {
    const main = q({ id: "main", title: "main", type: "main", priority: "p1" });
    const blocked = q({ id: "blocked", title: "blocked", type: "sub", dependencyQuestIds: ["main"], priority: "p1" });

    const queue = getExecutionQueue([main, blocked]);

    expect(queue[0].quest.id).toBe("main");
    expect(queue[1].quest.id).toBe("blocked");
    expect(queue[1].blockedByIds).toEqual(["main"]);
  });

  it("returns focus quest ids from top executable queue", () => {
    const quests = [
      q({ id: "a", type: "main", priority: "p1" }),
      q({ id: "b", type: "daily", priority: "p2" }),
      q({ id: "c", type: "sub", priority: "p3" }),
      q({ id: "d", type: "main", priority: "p1", dependencyQuestIds: ["a"] })
    ];

    const focus = getFocusQuestIds(quests, 3);
    expect(focus).toContain("a");
    expect(focus).not.toContain("d");
    expect(focus.length).toBeLessThanOrEqual(3);
  });

  it("computes weekly main progress", () => {
    const rec = (date: string, mainCompleted: number, mainTotal: number): DailyRecord => ({
      date,
      quests: [],
      completedCount: mainCompleted,
      totalCount: mainTotal,
      completionRate: mainTotal > 0 ? mainCompleted / mainTotal : 0,
      roofType: "mid",
      isFinalized: true,
      completedByType: { daily: 0, main: mainCompleted, sub: 0 },
      totalByType: { daily: 0, main: mainTotal, sub: 0 }
    });

    const records = {
      "2026-03-24": rec("2026-03-24", 2, 3),
      "2026-03-23": rec("2026-03-23", 1, 1),
      "2026-03-22": rec("2026-03-22", 0, 2)
    };

    const progress = getWeeklyMainProgress(records, "2026-03-24");
    expect(progress.completed).toBe(3);
    expect(progress.total).toBe(6);
    expect(progress.rate).toBeCloseTo(0.5);
  });
});
