import { describe, expect, it } from "vitest";
import { getCompletedQuestTypes, getDominantQuestType, getQuestCounts } from "./quest";
import { DailyRecord, QuestItem } from "./types";

const quests: QuestItem[] = [
  {
    id: "1",
    title: "운동",
    type: "daily",
    completed: true,
    createdAt: "2026-03-24T08:00:00.000Z",
    completedAt: "2026-03-24T09:00:00.000Z"
  },
  {
    id: "2",
    title: "핵심 업무",
    type: "main",
    completed: true,
    createdAt: "2026-03-24T08:30:00.000Z",
    completedAt: "2026-03-24T10:00:00.000Z"
  },
  {
    id: "3",
    title: "영어 공부",
    type: "sub",
    completed: false,
    createdAt: "2026-03-24T11:00:00.000Z"
  }
];

describe("quest utils", () => {
  it("calculates quest counts by type", () => {
    const counts = getQuestCounts(quests);
    expect(counts.totalByType).toEqual({ daily: 1, main: 1, sub: 1 });
    expect(counts.completedByType).toEqual({ daily: 1, main: 1, sub: 0 });
  });

  it("returns completed quest types ordered by completion time", () => {
    expect(getCompletedQuestTypes(quests)).toEqual(["daily", "main"]);
  });

  it("detects dominant quest type", () => {
    const record: DailyRecord = {
      date: "2026-03-24",
      quests,
      completedCount: 2,
      totalCount: 3,
      completionRate: 2 / 3,
      roofType: "mid",
      isFinalized: true,
      completedByType: { daily: 1, main: 1, sub: 0 },
      totalByType: { daily: 1, main: 1, sub: 1 }
    };

    expect(getDominantQuestType(record, "completed")).toBe("daily");
    expect(getDominantQuestType(record, "total")).toBe("daily");
  });
});
